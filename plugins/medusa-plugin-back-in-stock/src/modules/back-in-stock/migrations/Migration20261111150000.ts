import { Migration } from "@medusajs/framework/mikro-orm/migrations"

const TIMESTAMPS =
  `"created_at" timestamptz not null default now(), ` +
  `"updated_at" timestamptz not null default now(), ` +
  `"deleted_at" timestamptz null, `

export class Migration20261111150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "back_in_stock_subscription" (` +
        `"id" text not null, ` +
        `"email" text null, ` +
        `"variant_id" text not null, ` +
        `"product_id" text null, ` +
        `"sales_channel_id" text not null, ` +
        `"customer_id" text null, ` +
        `"locale" text not null, ` +
        `"country_code" text null, ` +
        `"status" text check ("status" in ('pending', 'active', 'purchased', 'unsubscribed', 'expired')) not null default 'pending', ` +
        `"consent_text" text null, ` +
        `"confirmed_at" timestamptz null, ` +
        `"notification_count" integer not null default 0, ` +
        `"last_notified_at" timestamptz null, ` +
        `"ended_at" timestamptz null, ` +
        `"anonymized_at" timestamptz null, ` +
        `"demo" boolean not null default false, ` +
        TIMESTAMPS +
        `constraint "back_in_stock_subscription_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_back_in_stock_subscription_deleted_at" ON "back_in_stock_subscription" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bis_subscription_open_unique" ON "back_in_stock_subscription" (email, variant_id, sales_channel_id) WHERE deleted_at IS NULL AND status IN ('pending', 'active');`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bis_subscription_variant_channel_status" ON "back_in_stock_subscription" (variant_id, sales_channel_id, status) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bis_subscription_customer_id" ON "back_in_stock_subscription" (customer_id) WHERE deleted_at IS NULL AND customer_id IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bis_subscription_status_created_at" ON "back_in_stock_subscription" (status, created_at) WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "back_in_stock_token" (` +
        `"id" text not null, ` +
        `"subscription_id" text not null, ` +
        `"purpose" text check ("purpose" in ('confirm', 'unsubscribe')) not null, ` +
        `"token_hash" text not null, ` +
        `"used_at" timestamptz null, ` +
        TIMESTAMPS +
        `constraint "back_in_stock_token_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_back_in_stock_token_deleted_at" ON "back_in_stock_token" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bis_token_hash_unique" ON "back_in_stock_token" (token_hash) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bis_token_subscription_id" ON "back_in_stock_token" (subscription_id) WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "back_in_stock_notification" (` +
        `"id" text not null, ` +
        `"subscription_id" text not null, ` +
        `"variant_id" text not null, ` +
        `"sales_channel_id" text not null, ` +
        `"kind" text check ("kind" in ('restock', 'confirm')) not null default 'restock', ` +
        `"status" text check ("status" in ('pending', 'sent', 'demo', 'skipped', 'failed')) not null default 'pending', ` +
        `"via" text null, ` +
        `"available" integer null, ` +
        `"error" text null, ` +
        `"sent_at" timestamptz null, ` +
        TIMESTAMPS +
        `constraint "back_in_stock_notification_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_back_in_stock_notification_deleted_at" ON "back_in_stock_notification" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bis_notification_pending_unique" ON "back_in_stock_notification" (subscription_id) WHERE deleted_at IS NULL AND status = 'pending';`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bis_notification_subscription_created" ON "back_in_stock_notification" (subscription_id, created_at) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bis_notification_variant_created" ON "back_in_stock_notification" (variant_id, created_at) WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "back_in_stock_variant_state" (` +
        `"id" text not null, ` +
        `"variant_id" text not null, ` +
        `"sales_channel_id" text not null, ` +
        `"in_stock" boolean not null default false, ` +
        `"available" integer null, ` +
        `"reason" text null, ` +
        `"checked_at" timestamptz not null, ` +
        `"restocked_at" timestamptz null, ` +
        TIMESTAMPS +
        `constraint "back_in_stock_variant_state_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_back_in_stock_variant_state_deleted_at" ON "back_in_stock_variant_state" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bis_variant_state_unique" ON "back_in_stock_variant_state" (variant_id, sales_channel_id) WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "back_in_stock_pending_check" (` +
        `"id" text not null, ` +
        `"variant_id" text not null, ` +
        `"sales_channel_id" text not null, ` +
        `"due_at" timestamptz not null, ` +
        `"claimed_at" timestamptz null, ` +
        `"dirty_at" timestamptz null, ` +
        `"forced" boolean not null default false, ` +
        TIMESTAMPS +
        `constraint "back_in_stock_pending_check_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_back_in_stock_pending_check_deleted_at" ON "back_in_stock_pending_check" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bis_pending_check_unique" ON "back_in_stock_pending_check" (variant_id, sales_channel_id) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bis_pending_check_due_at" ON "back_in_stock_pending_check" (due_at) WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "back_in_stock_setting" (` +
        `"id" text not null, ` +
        `"key" text not null, ` +
        `"value" jsonb not null, ` +
        TIMESTAMPS +
        `constraint "back_in_stock_setting_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_back_in_stock_setting_deleted_at" ON "back_in_stock_setting" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bis_setting_key_unique" ON "back_in_stock_setting" (key) WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    for (const table of [
      "back_in_stock_setting",
      "back_in_stock_pending_check",
      "back_in_stock_variant_state",
      "back_in_stock_notification",
      "back_in_stock_token",
      "back_in_stock_subscription",
    ]) {
      this.addSql(`drop table if exists "${table}" cascade;`)
    }
  }
}
