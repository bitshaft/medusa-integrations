import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Stored parcel point lists: one row per point (`apaczka_point`) and the
 * state of each carrier's list, which doubles as the sync lock
 * (`apaczka_point_sync`). See docs/parcel-points.md.
 */
export class Migration20261125212639 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "apaczka_point" ("id" text not null, "type" text not null, "country_code" text not null, "external_id" text not null, "subtype" text null, "name" text null, "line1" text not null, "line2" text null, "street" text null, "house_number" text null, "postal_code" text not null, "city" text not null, "latitude" real null, "longitude" real null, "open_hours" jsonb null, "open_hours_summary" text null, "accepts_cod" boolean not null default true, "accepts_delivery" boolean not null default true, "accepts_sending" boolean not null default true, "image_url" text null, "additional_info" text null, "search" text not null, "synced_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "apaczka_point_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_point_deleted_at" ON "apaczka_point" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_apaczka_point_external" ON "apaczka_point" ("type", "country_code", "external_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_point_location" ON "apaczka_point" ("type", "country_code", "latitude", "longitude") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_point_synced" ON "apaczka_point" ("type", "country_code", "synced_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "apaczka_point_sync" ("id" text not null, "type" text not null, "country_code" text not null, "source" text null, "status" text check ("status" in ('idle', 'running', 'failed')) not null default 'idle', "started_at" timestamptz null, "finished_at" timestamptz null, "succeeded_at" timestamptz null, "point_count" integer null, "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "apaczka_point_sync_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_point_sync_deleted_at" ON "apaczka_point_sync" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_apaczka_point_sync_list" ON "apaczka_point_sync" ("type", "country_code") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "apaczka_point" cascade;`)

    this.addSql(`drop table if exists "apaczka_point_sync" cascade;`)
  }
}
