import { OlxReconnectError } from "./auth"
import { type OlxAdvert, type OlxApi, OlxRefusedError } from "./client"
import type { KitLogger } from "./kit/secrets"
import {
  type AdvertInput,
  type AdvertRecord,
  LIVE_STATUSES,
  type ProductSafety,
  type SoldChannel,
  type SyncCursor,
} from "./types"
import { validateAdvert, type ValidationIssue } from "./validation"

/** A worker that stopped mid-write loses its claim after this long. */
export const CLAIM_STALE_MS = 2 * 60_000
/** How long OLX gets to show an advert whose create request lost its answer. */
export const UNCONFIRMED_AFTER_MS = 15 * 60_000
const MAX_FEED_PAGES = 20

export type AdvertStore = {
  getRecord(id: string): Promise<AdvertRecord | null>
  findForVariant(variantId: string): Promise<AdvertRecord | null>
  findByOlxId(olxId: string): Promise<AdvertRecord | null>
  listLive(variantIds?: string[]): Promise<AdvertRecord[]>
  listPublishing(): Promise<AdvertRecord[]>
  listPendingDeactivations(): Promise<AdvertRecord[]>
  createRecord(data: { variant_id: string; product_id: string; payload: AdvertInput }): Promise<AdvertRecord>
  patchRecord(id: string, patch: Partial<AdvertRecord>): Promise<AdvertRecord>
  claimRecord(id: string, now: Date, staleBefore: Date): Promise<AdvertRecord | null>
  /**
   * Records that the advert must come down, in one conditional UPDATE: `null`
   * when it is already on its way down (a "Sold on OLX" mark is never replaced)
   * or, with `statuses`, no longer in one of them.
   */
  markForDeactivation(
    id: string,
    mark: { success: boolean; channel: SoldChannel | null; at: Date | null; statuses?: readonly string[] }
  ): Promise<AdvertRecord | null>
  readCursor(): Promise<SyncCursor | null>
  saveCursor(cursor: SyncCursor): Promise<void>
}

export type Engine = {
  store: AdvertStore
  api: OlxApi
  logger: KitLogger
  safety: () => Promise<ProductSafety>
  /** Per variant: can it still be bought in the store? `null` when that cannot be told. */
  availability: (variantIds: string[]) => Promise<Map<string, boolean | null>>
  now?: () => Date
}

/** How a write ended, for the admin: every outcome is an answer, not an exception. */
export type WriteResult =
  | { result: "published" | "saved"; advert: AdvertRecord }
  /** OLX did not answer in time; the sync job finds out whether the advert exists. */
  | { result: "unconfirmed"; advert: AdvertRecord; message: string; edit?: boolean }
  | { result: "invalid"; issues: ValidationIssue[] }
  | { result: "conflict"; code: "exists" | "in_progress" | "not_on_olx" | "out_of_stock" | "taking_down" }
  | { result: "refused"; message: string; fields?: Array<{ field: string; detail: string }> }

const clock = (engine: Engine) => engine.now?.() ?? new Date()
const staleBefore = (now: Date) => new Date(now.getTime() - CLAIM_STALE_MS)
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
/** OLX answered "no" (or the account must be reconnected): the write certainly did not happen. */
const isDefinite = (error: unknown) => error instanceof OlxRefusedError || error instanceof OlxReconnectError

const refused = (error: unknown): WriteResult => ({
  result: "refused",
  message: messageOf(error),
  ...(error instanceof OlxRefusedError && error.fields.length ? { fields: error.fields } : {}),
})

/** Whether OLX already shows this form: how a lost answer to an edit is told apart. */
const sameContent = (advert: OlxAdvert, input: AdvertInput) =>
  advert.title?.trim() === input.title.trim() &&
  advert.description?.trim() === input.description.trim() &&
  Number(advert.price?.value) === Number(input.price)

const fromOlx = (advert: OlxAdvert, now: Date) => ({
  olx_advert_id: String(advert.id),
  status: advert.status,
  url: advert.url ?? null,
  valid_to: advert.valid_to ? new Date(advert.valid_to) : null,
  synced_at: now,
})

async function adopt(engine: Engine, row: AdvertRecord, advert: OlxAdvert): Promise<AdvertRecord> {
  const now = clock(engine)
  const saved = await engine.store.patchRecord(row.id, {
    ...fromOlx(advert, now),
    last_error: null,
    claimed_at: null,
    write_started_at: null,
  })
  // The item may have sold while the advert was being created.
  if (saved.pending_deactivate) {
    return flushDeactivation(engine, saved)
  }
  await checkStock(engine, [saved.variant_id]).catch((error) =>
    engine.logger.warn(`[olx] Could not check stock of ${saved.variant_id}: ${messageOf(error)}`)
  )
  return (await engine.store.getRecord(saved.id)) ?? saved
}

/**
 * Creates the advert, never twice: OLX is asked for this row's `external_id`
 * first, and a create whose answer was lost stays "publishing" until the
 * sync job sees whether OLX has it.
 */
async function sendCreate(engine: Engine, row: AdvertRecord): Promise<WriteResult> {
  let existing: OlxAdvert | null
  try {
    existing = await engine.api.findByExternalId(row.id)
  } catch (error) {
    const failed = await engine.store.patchRecord(row.id, {
      status: "failed",
      last_error: messageOf(error),
      claimed_at: null,
      write_started_at: null,
    })
    return isDefinite(error)
      ? refused(error)
      : { result: "refused", message: failed.last_error ?? "OLX did not answer. Nothing was published." }
  }
  if (existing) {
    return { result: "published", advert: await adopt(engine, row, existing) }
  }

  await engine.store.patchRecord(row.id, { write_started_at: clock(engine) })
  try {
    const created = await engine.api.createAdvert(row.payload, row.id, await engine.safety())
    return { result: "published", advert: await adopt(engine, row, created) }
  } catch (error) {
    if (isDefinite(error)) {
      await engine.store.patchRecord(row.id, {
        status: "failed",
        last_error: messageOf(error),
        claimed_at: null,
        write_started_at: null,
      })
      return refused(error)
    }
    const advert = await engine.store.patchRecord(row.id, { last_error: messageOf(error), claimed_at: null })
    return { result: "unconfirmed", advert, message: messageOf(error) }
  }
}

/** Publishes one variant. A failed earlier attempt is tried again on the same row. */
export async function publishAdvert(
  engine: Engine,
  input: { variant_id: string; product_id: string; advert: AdvertInput }
): Promise<WriteResult> {
  const issues = validateAdvert(input.advert)
  if (issues.length) {
    return { result: "invalid", issues }
  }
  const now = clock(engine)
  let row = await engine.store.findForVariant(input.variant_id)
  if (row && row.status !== "failed") {
    return { result: "conflict", code: row.status === "publishing" ? "in_progress" : "exists" }
  }
  // An item that cannot be bought in the store is not offered on OLX either.
  const stock = await engine.availability([input.variant_id])
  if (stock.get(input.variant_id) === false) {
    return { result: "conflict", code: "out_of_stock" }
  }
  if (row) {
    const claimed = await engine.store.claimRecord(row.id, now, staleBefore(now))
    if (!claimed || claimed.status !== "failed") {
      return { result: "conflict", code: "in_progress" }
    }
    row = await engine.store.patchRecord(row.id, {
      status: "publishing",
      title: input.advert.title.trim(),
      price: input.advert.price,
      payload: input.advert,
      last_error: null,
    })
  } else {
    try {
      const created = await engine.store.createRecord({
        variant_id: input.variant_id,
        product_id: input.product_id,
        payload: input.advert,
      })
      row = await engine.store.claimRecord(created.id, now, staleBefore(now))
    } catch (error) {
      // The unique index: another request created this variant's advert a moment ago.
      if (await engine.store.findForVariant(input.variant_id)) {
        return { result: "conflict", code: "in_progress" }
      }
      throw error
    }
    if (!row) {
      return { result: "conflict", code: "in_progress" }
    }
  }
  return sendCreate(engine, row)
}

/** Saves an edit on OLX, then here. */
export async function updateAdvert(engine: Engine, id: string, input: AdvertInput): Promise<WriteResult> {
  const issues = validateAdvert(input)
  if (issues.length) {
    return { result: "invalid", issues }
  }
  const row = await engine.store.getRecord(id)
  if (!row?.olx_advert_id) {
    return { result: "conflict", code: "not_on_olx" }
  }
  const now = clock(engine)
  const claimed = await engine.store.claimRecord(id, now, staleBefore(now))
  if (!claimed) {
    return { result: "conflict", code: "in_progress" }
  }
  // Read under the claim: the item may have sold since the form was opened.
  if (claimed.pending_deactivate || claimed.sold_channel) {
    await engine.store.patchRecord(id, { claimed_at: null })
    return { result: "conflict", code: "taking_down" }
  }
  const saveEdit = (advert: OlxAdvert) =>
    engine.store.patchRecord(id, {
      ...fromOlx({ ...advert, id: advert.id ?? row.olx_advert_id! }, clock(engine)),
      title: input.title.trim(),
      price: input.price,
      payload: input,
      last_error: null,
      claimed_at: null,
    })
  try {
    const updated = await engine.api.updateAdvert(row.olx_advert_id, input, row.id, await engine.safety())
    return { result: "saved", advert: await saveEdit(updated) }
  } catch (error) {
    if (isDefinite(error)) {
      await engine.store.patchRecord(id, { last_error: messageOf(error), claimed_at: null })
      return refused(error)
    }
    // The answer was lost, so OLX may have applied the edit: ask it.
    const current = await engine.api.getAdvert(row.olx_advert_id).catch(() => null)
    if (current && sameContent(current, input)) {
      return { result: "saved", advert: await saveEdit(current) }
    }
    const advert = await engine.store.patchRecord(id, { last_error: messageOf(error), claimed_at: null })
    return { result: "unconfirmed", advert, message: messageOf(error), edit: true }
  }
}

/**
 * Takes one advert down. The intent is saved first and stays until OLX
 * confirms, so a failed call is repeated by the sync job.
 */
export async function flushDeactivation(engine: Engine, row: AdvertRecord): Promise<AdvertRecord> {
  if (!row.pending_deactivate || !row.olx_advert_id) {
    return row
  }
  const now = clock(engine)
  const claimed = await engine.store.claimRecord(row.id, now, staleBefore(now))
  if (!claimed) {
    return row
  }
  if (!claimed.pending_deactivate) {
    return engine.store.patchRecord(row.id, { claimed_at: null })
  }
  try {
    // From the claimed row: "Sold on OLX" may have been recorded after `row` was read.
    await engine.api.command(row.olx_advert_id, { command: "deactivate", is_success: claimed.pending_success })
    return await engine.store.patchRecord(row.id, {
      status: "removed_by_user",
      pending_deactivate: false,
      last_error: null,
      claimed_at: null,
      synced_at: clock(engine),
    })
  } catch (error) {
    if (error instanceof OlxRefusedError) {
      // OLX refuses to deactivate an advert that is already down: that is the state we wanted.
      const current = await engine.api.getAdvert(row.olx_advert_id).catch(() => undefined)
      if (current === null || (current && !LIVE_STATUSES.includes(current.status))) {
        return engine.store.patchRecord(row.id, {
          status: current?.status ?? "removed_by_user",
          pending_deactivate: false,
          last_error: null,
          claimed_at: null,
          synced_at: clock(engine),
        })
      }
    }
    engine.logger.warn(`[olx] Could not take down advert ${row.olx_advert_id}: ${messageOf(error)}. Will retry.`)
    return engine.store.patchRecord(row.id, { last_error: messageOf(error), claimed_at: null })
  }
}

/** "Take down": by hand, nothing was sold. */
export async function deactivateAdvert(engine: Engine, id: string): Promise<WriteResult> {
  const row = await engine.store.getRecord(id)
  if (!row?.olx_advert_id) {
    return { result: "conflict", code: "not_on_olx" }
  }
  const marked = await engine.store.markForDeactivation(id, { success: false, channel: null, at: null })
  const pending = marked ?? (await engine.store.getRecord(id)) ?? row
  const advert = await flushDeactivation(engine, pending)
  return advert.pending_deactivate
    ? { result: "unconfirmed", advert, message: advert.last_error ?? "OLX did not confirm yet." }
    : { result: "saved", advert }
}

/** Brings an advert back. Refused while the item cannot be bought, so it is never sold twice. */
export async function activateAdvert(engine: Engine, id: string): Promise<WriteResult> {
  const row = await engine.store.getRecord(id)
  if (!row?.olx_advert_id) {
    return { result: "conflict", code: "not_on_olx" }
  }
  const stock = await engine.availability([row.variant_id])
  if (stock.get(row.variant_id) === false) {
    return { result: "conflict", code: "out_of_stock" }
  }
  const now = clock(engine)
  const claimed = await engine.store.claimRecord(id, now, staleBefore(now))
  if (!claimed) {
    return { result: "conflict", code: "in_progress" }
  }
  if (claimed.pending_deactivate) {
    await engine.store.patchRecord(id, { claimed_at: null })
    return { result: "conflict", code: "taking_down" }
  }
  try {
    await engine.api.command(row.olx_advert_id, { command: "activate" })
    const current = await engine.api.getAdvert(row.olx_advert_id).catch(() => null)
    const advert = await engine.store.patchRecord(id, {
      ...(current ? fromOlx(current, clock(engine)) : { status: "new", synced_at: clock(engine) }),
      pending_deactivate: false,
      pending_success: false,
      sold_channel: null,
      sold_at: null,
      last_error: null,
      claimed_at: null,
    })
    return { result: "saved", advert }
  } catch (error) {
    await engine.store.patchRecord(id, { last_error: messageOf(error), claimed_at: null })
    return refused(error)
  }
}

/** Takes down the live adverts of variants that can no longer be bought in the store. */
export async function checkStock(engine: Engine, variantIds: string[] | "all"): Promise<number> {
  if (variantIds !== "all" && !variantIds.length) {
    return 0
  }
  const rows = await engine.store.listLive(variantIds === "all" ? undefined : variantIds)
  if (!rows.length) {
    return 0
  }
  const stock = await engine.availability([...new Set(rows.map((row) => row.variant_id))])
  let count = 0
  for (const row of rows) {
    // `null` means "cannot tell": an advert is never taken down on a guess.
    if (stock.get(row.variant_id) !== false) {
      continue
    }
    const pending = await engine.store.markForDeactivation(row.id, {
      success: false,
      channel: "store",
      at: clock(engine),
      statuses: LIVE_STATUSES,
    })
    if (!pending) {
      continue
    }
    await flushDeactivation(engine, pending)
    count++
  }
  return count
}

/** Settles creates whose answer was lost: OLX has the advert, or it can be published again. */
export async function resolvePublishing(engine: Engine): Promise<number> {
  let resolved = 0
  for (const row of await engine.store.listPublishing()) {
    const now = clock(engine)
    const claimed = await engine.store.claimRecord(row.id, now, staleBefore(now))
    if (!claimed) {
      continue
    }
    try {
      const found = await engine.api.findByExternalId(row.id)
      if (found) {
        await adopt(engine, claimed, found)
        resolved++
      } else if (!claimed.write_started_at) {
        await engine.store.patchRecord(row.id, {
          status: "failed",
          last_error: "The advert was not sent to OLX. Publish it again.",
          claimed_at: null,
        })
        resolved++
      } else if (now.getTime() - claimed.write_started_at.getTime() > UNCONFIRMED_AFTER_MS) {
        await engine.store.patchRecord(row.id, {
          status: "failed",
          last_error:
            "OLX did not confirm the advert and does not show it. Check your OLX account, then publish again.",
          claimed_at: null,
          write_started_at: null,
        })
        resolved++
      } else {
        await engine.store.patchRecord(row.id, { claimed_at: null })
      }
    } catch (error) {
      await engine.store.patchRecord(row.id, { last_error: messageOf(error), claimed_at: null })
    }
  }
  return resolved
}

/** Copies one advert's state from OLX, under the claim. `busy`: it is being written, read it again later. */
async function refreshFromOlx(engine: Engine, olxId: string): Promise<"changed" | "unknown" | "busy"> {
  const row = await engine.store.findByOlxId(olxId)
  if (!row) {
    return "unknown"
  }
  const now = clock(engine)
  if (!(await engine.store.claimRecord(row.id, now, staleBefore(now)))) {
    return "busy"
  }
  try {
    const advert = await engine.api.getAdvert(olxId)
    await engine.store.patchRecord(row.id, {
      ...(advert ? fromOlx(advert, now) : { status: "removed_by_user", pending_deactivate: false, synced_at: now }),
      claimed_at: null,
    })
    return "changed"
  } catch (error) {
    await engine.store.patchRecord(row.id, { claimed_at: null })
    throw error
  }
}

/**
 * Reads OLX's change feed and updates the adverts it names. The position is
 * saved after every page, with the adverts that were being written at that
 * moment, which are read again on the next sync.
 */
export async function syncFeed(engine: Engine): Promise<number> {
  const started = clock(engine).toISOString()
  let position = await engine.store.readCursor()
  if (!position) {
    await engine.store.saveCursor({ since: started, cursor: null, last_success_at: started, retry_ids: [] })
    return 0
  }
  let changed = 0
  const busy = new Set<string>()
  for (const id of position.retry_ids ?? []) {
    const outcome = await refreshFromOlx(engine, id)
    if (outcome === "busy") busy.add(id)
    if (outcome === "changed") changed++
  }
  if (position.retry_ids?.length) {
    position = { ...position, retry_ids: [...busy] }
    await engine.store.saveCursor(position)
  }
  for (let page = 0; page < MAX_FEED_PAGES; page++) {
    let result
    try {
      result = await engine.api.advertChanges(position.since, position.cursor)
    } catch (error) {
      if (error instanceof OlxRefusedError && error.status === 400 && position.cursor) {
        // OLX no longer knows the cursor: read again from the last complete sync.
        position = { ...position, since: position.last_success_at ?? position.since, cursor: null }
        await engine.store.saveCursor(position)
        continue
      }
      throw error
    }
    for (const id of result.ids) {
      const outcome = await refreshFromOlx(engine, id)
      if (outcome === "busy") {
        busy.add(id)
      } else {
        busy.delete(id)
        if (outcome === "changed") changed++
      }
    }
    position = { ...position, cursor: result.nextCursor ?? position.cursor, retry_ids: [...busy] }
    if (!result.hasMore) {
      position = { ...position, last_success_at: started }
    }
    await engine.store.saveCursor(position)
    if (!result.hasMore) {
      break
    }
  }
  return changed
}

export type SyncSummary = { resolved: number; taken_down: number; retried: number; changed: number; errors: string[] }

/** One round of the sync job. A failing part never stops the others. */
export async function runSync(engine: Engine): Promise<SyncSummary> {
  const summary: SyncSummary = { resolved: 0, taken_down: 0, retried: 0, changed: 0, errors: [] }
  const part = async (name: string, run: () => Promise<void>) => {
    try {
      await run()
    } catch (error) {
      summary.errors.push(`${name}: ${messageOf(error)}`)
    }
  }
  await part("publishing", async () => {
    summary.resolved = await resolvePublishing(engine)
  })
  await part("stock", async () => {
    summary.taken_down = await checkStock(engine, "all")
  })
  await part("deactivations", async () => {
    for (const row of await engine.store.listPendingDeactivations()) {
      const after = await flushDeactivation(engine, row)
      if (!after.pending_deactivate) summary.retried++
    }
  })
  await part("feed", async () => {
    summary.changed = await syncFeed(engine)
  })
  return summary
}
