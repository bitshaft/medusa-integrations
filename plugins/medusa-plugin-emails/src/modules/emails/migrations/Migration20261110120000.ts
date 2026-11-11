import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261110120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "emails_message" (` +
        `"id" text not null, ` +
        `"type" text not null, ` +
        `"locale" text not null, ` +
        `"recipient" text not null, ` +
        `"subject" text null, ` +
        `"status" text check ("status" in ('pending', 'sent', 'failed', 'demo')) not null default 'pending', ` +
        `"dedupe_key" text null, ` +
        `"order_id" text null, ` +
        `"customer_id" text null, ` +
        `"resource_type" text null, ` +
        `"resource_id" text null, ` +
        `"trigger_type" text null, ` +
        `"input" jsonb null, ` +
        `"attempts" integer not null default 0, ` +
        `"retryable" boolean not null default false, ` +
        `"next_retry_at" timestamptz null, ` +
        `"error" text null, ` +
        `"notification_id" text null, ` +
        `"original_message_id" text null, ` +
        `"sent_at" timestamptz null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "emails_message_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_message_deleted_at" ON "emails_message" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_emails_message_dedupe_key_unique" ON "emails_message" (dedupe_key) WHERE deleted_at IS NULL AND dedupe_key IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_message_order_id" ON "emails_message" (order_id) WHERE deleted_at IS NULL AND order_id IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_message_customer_id" ON "emails_message" (customer_id) WHERE deleted_at IS NULL AND customer_id IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_message_status_next_retry_at" ON "emails_message" (status, next_retry_at) WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "emails_setting" (` +
        `"id" text not null, ` +
        `"key" text not null, ` +
        `"value" jsonb not null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "emails_setting_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_setting_deleted_at" ON "emails_setting" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_emails_setting_key_unique" ON "emails_setting" (key) WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "emails_low_stock_alert" (` +
        `"id" text not null, ` +
        `"inventory_item_id" text not null, ` +
        `"location_id" text not null, ` +
        `"available" integer not null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "emails_low_stock_alert_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_low_stock_alert_deleted_at" ON "emails_low_stock_alert" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_emails_low_stock_alert_inventory_item_id_location_id_unique" ON "emails_low_stock_alert" (inventory_item_id, location_id) WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "emails_low_stock_alert" cascade;`)
    this.addSql(`drop table if exists "emails_setting" cascade;`)
    this.addSql(`drop table if exists "emails_message" cascade;`)
  }
}
