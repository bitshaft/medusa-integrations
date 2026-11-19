import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261119171710 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "currency_setting" drop constraint if exists "currency_setting_key_unique";`)
    this.addSql(
      `alter table if exists "currency_rate_table" drop constraint if exists "currency_rate_table_provider_date_unique";`
    )
    this.addSql(
      `create table if not exists "currency_filled_price" ("id" text not null, "price_id" text not null, "run_id" text not null, "variant_id" text not null, "product_id" text not null, "currency_code" text not null, "price_list_id" text null, "region_id" text null, "action" text not null, "amount" text not null, "previous_amount" text null, "base_amount" text not null, "mode" text not null, "rate" text not null, "margin" text not null, "table_no" text null, "rate_date" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "currency_filled_price_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_currency_filled_price_deleted_at" ON "currency_filled_price" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_currency_filled_price_price_created" ON "currency_filled_price" ("price_id", "created_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_currency_filled_price_run" ON "currency_filled_price" ("run_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_currency_filled_price_product" ON "currency_filled_price" ("product_id") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "currency_fill_run" ("id" text not null, "actor_id" text null, "actor_name" text null, "demo" boolean not null default false, "base_currency" text not null, "scope" jsonb not null, "run_options" jsonb not null, "rates" jsonb not null, "added" integer not null default 0, "overwritten" integer not null default 0, "skipped" integer not null default 0, "skipped_by" jsonb not null, "products" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "currency_fill_run_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_currency_fill_run_deleted_at" ON "currency_fill_run" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_currency_fill_run_created_at" ON "currency_fill_run" ("created_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "currency_rate_table" ("id" text not null, "provider" text not null, "table_no" text not null, "effective_date" text not null, "base" text not null, "rates" jsonb not null, "checked_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "currency_rate_table_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_currency_rate_table_deleted_at" ON "currency_rate_table" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_currency_rate_table_provider_date_unique" ON "currency_rate_table" ("provider", "effective_date") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "currency_setting" ("id" text not null, "key" text not null, "value" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "currency_setting_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_currency_setting_deleted_at" ON "currency_setting" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_currency_setting_key_unique" ON "currency_setting" ("key") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "currency_filled_price" cascade;`)

    this.addSql(`drop table if exists "currency_fill_run" cascade;`)

    this.addSql(`drop table if exists "currency_rate_table" cascade;`)

    this.addSql(`drop table if exists "currency_setting" cascade;`)
  }
}
