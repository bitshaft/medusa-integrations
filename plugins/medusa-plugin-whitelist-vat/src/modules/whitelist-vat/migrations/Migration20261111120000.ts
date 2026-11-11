import { Migration } from "@medusajs/framework/mikro-orm/migrations"

const STATUSES = "'active', 'exempt', 'unregistered', 'inactive', 'valid', 'invalid', 'not_found', 'unverified'"
const OUTCOMES =
  "'active', 'exempt', 'unregistered', 'valid', 'invalid', 'found', 'inactive', 'not_found', 'unavailable'"

export class Migration20261111120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "whitelist_vat_subject" (` +
        `"id" text not null, ` +
        `"number" text not null, ` +
        `"kind" text check ("kind" in ('nip', 'eu_vat')) not null, ` +
        `"country_code" text not null, ` +
        `"status" text check ("status" in (${STATUSES})) not null default 'unverified', ` +
        `"name" text null, ` +
        `"address" text null, ` +
        `"company" jsonb null, ` +
        `"sources" jsonb null, ` +
        `"bank_account_count" integer not null default 0, ` +
        `"customer_id" text null, ` +
        `"checked_at" timestamptz null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "whitelist_vat_subject_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_whitelist_vat_subject_deleted_at" ON "whitelist_vat_subject" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_whitelist_vat_subject_number_unique" ON "whitelist_vat_subject" (number) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_whitelist_vat_subject_status" ON "whitelist_vat_subject" (status) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_whitelist_vat_subject_customer_id" ON "whitelist_vat_subject" (customer_id) WHERE deleted_at IS NULL AND customer_id IS NOT NULL;`
    )

    this.addSql(
      `create table if not exists "whitelist_vat_check" (` +
        `"id" text not null, ` +
        `"number" text not null, ` +
        `"source" text check ("source" in ('mf', 'gus', 'vies', 'local')) not null, ` +
        `"outcome" text check ("outcome" in (${OUTCOMES})) not null, ` +
        `"status" text null, ` +
        `"request_id" text null, ` +
        `"error" text null, ` +
        `"duration_ms" integer null, ` +
        `"from_cache" boolean not null default false, ` +
        `"trigger_type" text null, ` +
        `"name" text null, ` +
        `"order_id" text null, ` +
        `"customer_id" text null, ` +
        `"cart_id" text null, ` +
        `"checked_at" timestamptz not null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "whitelist_vat_check_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_whitelist_vat_check_deleted_at" ON "whitelist_vat_check" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_whitelist_vat_check_number" ON "whitelist_vat_check" (number) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_whitelist_vat_check_order_id" ON "whitelist_vat_check" (order_id) WHERE deleted_at IS NULL AND order_id IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_whitelist_vat_check_customer_id" ON "whitelist_vat_check" (customer_id) WHERE deleted_at IS NULL AND customer_id IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_whitelist_vat_check_source_checked_at" ON "whitelist_vat_check" (source, checked_at) WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "whitelist_vat_check" cascade;`)
    this.addSql(`drop table if exists "whitelist_vat_subject" cascade;`)
  }
}
