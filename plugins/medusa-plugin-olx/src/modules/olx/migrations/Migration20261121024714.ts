import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261121024714 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "olx_setting" drop constraint if exists "olx_setting_key_unique";`)
    this.addSql(`alter table if exists "olx_oauth_state" drop constraint if exists "olx_oauth_state_hash_unique";`)
    this.addSql(`alter table if exists "olx_connection" drop constraint if exists "olx_connection_key_unique";`)
    this.addSql(`alter table if exists "olx_advert" drop constraint if exists "olx_advert_variant_demo_unique";`)
    this.addSql(
      `create table if not exists "olx_advert" ("id" text not null, "variant_id" text not null, "product_id" text not null, "demo" boolean not null default false, "olx_advert_id" text null, "status" text not null, "url" text null, "valid_to" timestamptz null, "title" text not null, "price" text not null, "payload" jsonb not null, "last_error" text null, "pending_deactivate" boolean not null default false, "pending_success" boolean not null default false, "sold_channel" text null, "sold_at" timestamptz null, "claimed_at" timestamptz null, "write_started_at" timestamptz null, "synced_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "olx_advert_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_olx_advert_deleted_at" ON "olx_advert" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_olx_advert_variant_demo_unique" ON "olx_advert" ("variant_id", "demo") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_olx_advert_product" ON "olx_advert" ("product_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_olx_advert_status" ON "olx_advert" ("status") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_olx_advert_olx_id" ON "olx_advert" ("olx_advert_id") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "olx_connection" ("id" text not null, "key" text not null default 'default', "olx_user_id" text null, "olx_user_name" text null, "is_business" boolean not null default false, "access_token" text not null, "refresh_token" text not null, "access_expires_at" timestamptz not null, "needs_reconnect" boolean not null default false, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "olx_connection_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_olx_connection_deleted_at" ON "olx_connection" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_olx_connection_key_unique" ON "olx_connection" ("key") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "olx_oauth_state" ("id" text not null, "state_hash" text not null, "expires_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "olx_oauth_state_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_olx_oauth_state_deleted_at" ON "olx_oauth_state" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_olx_oauth_state_hash_unique" ON "olx_oauth_state" ("state_hash") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "olx_setting" ("id" text not null, "key" text not null, "value" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "olx_setting_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_olx_setting_deleted_at" ON "olx_setting" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_olx_setting_key_unique" ON "olx_setting" ("key") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "olx_advert" cascade;`)

    this.addSql(`drop table if exists "olx_connection" cascade;`)

    this.addSql(`drop table if exists "olx_oauth_state" cascade;`)

    this.addSql(`drop table if exists "olx_setting" cascade;`)
  }
}
