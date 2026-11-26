import type { Knex } from "@medusajs/framework/mikro-orm/knex"
import { generateEntityId, MedusaError } from "@medusajs/framework/utils"

import type { ApaczkaPoint } from "./client"
import type { PointStorage, PointSyncStatus, StoredPointQuery } from "./point-directory"
import { fromPointRow, POINT_SYNC_TABLE, POINT_TABLE, type PointRow, toPointRow } from "./point-rows"

/** Rows per INSERT: well under Postgres' 65,535 bind parameters. */
const BATCH_SIZE = 500

/** Columns a re-synced point updates (everything except its ID and creation time). */
const UPDATED_COLUMNS = [
  "subtype",
  "name",
  "line1",
  "line2",
  "street",
  "house_number",
  "postal_code",
  "city",
  "latitude",
  "longitude",
  "open_hours",
  "open_hours_summary",
  "accepts_cod",
  "accepts_delivery",
  "accepts_sending",
  "image_url",
  "additional_info",
  "search",
  "synced_at",
  "updated_at",
] as const

/**
 * Parcel point lists in Postgres (`apaczka_point`, `apaczka_point_sync`),
 * through the shared database connection. The module and the fulfillment
 * provider each get one, so both read the same lists. The connection is
 * resolved on first use.
 */
export class ApaczkaPointStore implements PointStorage {
  constructor(private readonly connection: () => Knex | undefined) {}

  private db(): Knex {
    const db = this.connection()
    if (!db) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "[apaczka] The database connection is not available to store parcel points"
      )
    }
    return db
  }

  async getStatus(type: string, countryCode: string): Promise<PointSyncStatus | null> {
    const row = await this.db()(POINT_SYNC_TABLE).where({ type, country_code: countryCode }).first()
    return row ? toStatus(row) : null
  }

  async listStatuses(): Promise<PointSyncStatus[]> {
    const rows = await this.db()(POINT_SYNC_TABLE).orderBy(["country_code", "type"])
    return rows.map(toStatus)
  }

  async tryLock(type: string, countryCode: string, now: Date, lockTimeoutMs: number): Promise<boolean> {
    const db = this.db()
    await db.raw(
      `insert into "${POINT_SYNC_TABLE}" ("id", "type", "country_code", "status", "created_at", "updated_at")
       values (?, ?, ?, 'idle', ?, ?) on conflict ("type", "country_code") where "deleted_at" is null do nothing`,
      [generateEntityId(undefined, "apzpts"), type, countryCode, now, now]
    )
    // Atomic: only one caller turns an idle, failed or dead sync into a running one.
    const locked = await db(POINT_SYNC_TABLE)
      .where({ type, country_code: countryCode })
      .andWhere((where) =>
        where
          .whereNot("status", "running")
          .orWhereNull("started_at")
          .orWhere("started_at", "<", new Date(now.getTime() - lockTimeoutMs))
      )
      .update({ status: "running", started_at: now, updated_at: now })
      .returning("id")
    return locked.length === 1
  }

  async replace(type: string, countryCode: string, points: ApaczkaPoint[], syncedAt: Date): Promise<number> {
    const rows = new Map<string, PointRow>()
    for (const point of points) {
      const row = toPointRow(point, { type, countryCode, syncedAt })
      // A list can repeat an ID; the last copy wins, as an upsert would.
      if (row) rows.set(row.external_id, row)
    }

    const values = [...rows.values()].map((row) => ({ ...row, created_at: syncedAt, updated_at: syncedAt }))
    await this.db().transaction(async (trx) => {
      for (let start = 0; start < values.length; start += BATCH_SIZE) {
        const insert = trx(POINT_TABLE)
          .insert(values.slice(start, start + BATCH_SIZE))
          .toSQL()
        await trx.raw(
          // The unique index is partial (Medusa adds `deleted_at is null`), so the target repeats it.
          `${insert.sql} on conflict ("type", "country_code", "external_id") where "deleted_at" is null do update set ` +
            UPDATED_COLUMNS.map((column) => `"${column}" = excluded."${column}"`).join(", "),
          insert.bindings as Knex.ValueDict[]
        )
      }
      // Points the new list no longer has.
      await trx(POINT_TABLE).where({ type, country_code: countryCode }).andWhere("synced_at", "<", syncedAt).del()
    })
    return values.length
  }

  async finish(
    type: string,
    countryCode: string,
    result: { now: Date; source: string; count: number } | { now: Date; error: string }
  ): Promise<void> {
    await this.db()(POINT_SYNC_TABLE)
      .where({ type, country_code: countryCode })
      .update(
        "error" in result
          ? { status: "failed", finished_at: result.now, error: result.error.slice(0, 1000), updated_at: result.now }
          : {
              status: "idle",
              finished_at: result.now,
              succeeded_at: result.now,
              source: result.source,
              point_count: result.count,
              error: null,
              updated_at: result.now,
            }
      )
  }

  async search(query: StoredPointQuery): Promise<ApaczkaPoint[]> {
    const select = this.db()(POINT_TABLE).where({ type: query.type, country_code: query.countryCode })
    if (query.cod) select.where("accepts_cod", true)
    if (query.sending) select.where("accepts_sending", true)
    for (const term of query.terms) {
      select.where("search", "like", `%${escapeLike(term)}%`)
    }
    if (query.bbox) {
      select
        .whereBetween("latitude", [query.bbox.south, query.bbox.north])
        .whereBetween("longitude", [query.bbox.west, query.bbox.east])
    }
    if (query.origin) {
      // Nearest first: an equirectangular distance is enough to sort (exact km are computed later).
      const { latitude, longitude } = query.origin
      const scale = Math.cos((latitude * Math.PI) / 180) ** 2
      select.orderByRaw(
        `("latitude" is null), (("latitude" - ?) * ("latitude" - ?) + ("longitude" - ?) * ("longitude" - ?) * ?)`,
        [latitude, latitude, longitude, longitude, scale]
      )
    } else {
      select.orderBy(["city", "line1", "external_id"])
    }
    const rows = await select.limit(query.limit)
    return rows.map(fromPointRow)
  }

  async find(type: string, countryCode: string, pointId: string): Promise<ApaczkaPoint | undefined> {
    const id = pointId.trim().toUpperCase()
    const db = this.db()
    const row =
      (await db(POINT_TABLE).where({ type, country_code: countryCode, external_id: id }).first()) ??
      (await db(POINT_TABLE)
        .where({ type, country_code: countryCode })
        .andWhere((where) => where.whereRaw(`upper("external_id") = ?`, [id]).orWhereRaw(`upper("name") = ?`, [id]))
        .first())
    return row ? fromPointRow(row) : undefined
  }
}

function toStatus(row: Record<string, unknown>): PointSyncStatus {
  const date = (value: unknown) => (value ? new Date(value as string) : null)
  return {
    type: String(row.type),
    country_code: String(row.country_code),
    source: (row.source as string | null) ?? null,
    status: (row.status as PointSyncStatus["status"]) ?? "idle",
    started_at: date(row.started_at),
    finished_at: date(row.finished_at),
    succeeded_at: date(row.succeeded_at),
    point_count: row.point_count == null ? null : Number(row.point_count),
    error: (row.error as string | null) ?? null,
  }
}

/** `%` and `_` in a search term are literal characters, not wildcards. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}
