import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261113233118 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "coupons_setting" drop constraint if exists "coupons_setting_key_unique";`)
    this.addSql(`alter table if exists "coupons_coupon" drop constraint if exists "coupons_coupon_code_unique";`)
    this.addSql(
      `create table if not exists "coupons_coupon" ("id" text not null, "code" text not null, "name" text null, "kind" text check ("kind" in ('percentage', 'fixed', 'free_shipping', 'category', 'buy_get')) not null, "automatic" boolean not null default false, "exclusive" boolean not null default false, "tiered" boolean not null default false, "batch_size" integer null, "batch_prefix" text null, "draft" jsonb not null, "campaign_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "coupons_coupon_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_coupons_coupon_deleted_at" ON "coupons_coupon" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_coupons_coupon_code_unique" ON "coupons_coupon" ("code") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "coupons_setting" ("id" text not null, "key" text not null, "value" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "coupons_setting_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_coupons_setting_deleted_at" ON "coupons_setting" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_coupons_setting_key_unique" ON "coupons_setting" ("key") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "coupons_coupon" cascade;`)

    this.addSql(`drop table if exists "coupons_setting" cascade;`)
  }
}
