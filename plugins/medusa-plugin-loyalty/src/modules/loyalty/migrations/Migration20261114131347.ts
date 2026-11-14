import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261114131347 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "loyalty_setting" drop constraint if exists "loyalty_setting_key_unique";`)
    this.addSql(`alter table if exists "loyalty_entry" drop constraint if exists "loyalty_entry_key_unique";`)
    this.addSql(`alter table if exists "loyalty_account" drop constraint if exists "loyalty_account_customer_unique";`)
    this.addSql(
      `create table if not exists "loyalty_account" ("id" text not null, "customer_id" text not null, "tier_id" text null, "balance" integer not null default 0, "last_activity_at" timestamptz null, "birthday" text null, "birthday_set_at" timestamptz null, "reminded_for" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_account_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_account_deleted_at" ON "loyalty_account" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_loyalty_account_customer_unique" ON "loyalty_account" ("customer_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_account_activity" ON "loyalty_account" ("last_activity_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "loyalty_entry" ("id" text not null, "account_id" text not null, "customer_id" text not null, "type" text check ("type" in ('order', 'action', 'redemption', 'return', 'expiry', 'adjustment', 'tier_bonus')) not null, "reason" text check ("reason" in ('earn', 'cancel', 'return', 'signup', 'first_order', 'birthday', 'newsletter', 'redeem', 'redeem_returned', 'expired', 'manual', 'tier_bonus')) not null, "points" integer not null, "key" text not null, "order_id" text null, "reward_id" text null, "redemption_id" text null, "code" text null, "description" text null, "actor_type" text check ("actor_type" in ('system', 'admin', 'customer')) not null default 'system', "actor_id" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_entry_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_entry_deleted_at" ON "loyalty_entry" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_loyalty_entry_key_unique" ON "loyalty_entry" ("key") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_entry_account" ON "loyalty_entry" ("account_id", "created_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_entry_customer" ON "loyalty_entry" ("customer_id", "created_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_entry_order" ON "loyalty_entry" ("order_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_entry_type_created" ON "loyalty_entry" ("type", "created_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "loyalty_redemption" ("id" text not null, "reward_id" text not null, "reward_name" text not null, "customer_id" text not null, "kind" text check ("kind" in ('fixed', 'percentage', 'free_shipping', 'gift')) not null, "cost" integer not null, "status" text check ("status" in ('issued', 'used', 'expired', 'in_cart', 'ordered', 'released')) not null, "code" text null, "promotion_id" text null, "expires_at" timestamptz null, "cart_id" text null, "variant_id" text null, "order_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_redemption_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_redemption_deleted_at" ON "loyalty_redemption" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_redemption_customer_reward" ON "loyalty_redemption" ("customer_id", "reward_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_redemption_status" ON "loyalty_redemption" ("status") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_redemption_cart" ON "loyalty_redemption" ("cart_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_redemption_code" ON "loyalty_redemption" ("code") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "loyalty_reward" ("id" text not null, "name" text not null, "description" text null, "kind" text check ("kind" in ('fixed', 'percentage', 'free_shipping', 'gift')) not null, "value" numeric null, "currency_code" text null, "variant_id" text null, "cost" integer not null, "active" boolean not null default true, "min_tier_id" text null, "per_customer_limit" integer null, "code_valid_days" integer null, "raw_value" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_reward_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_reward_deleted_at" ON "loyalty_reward" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "loyalty_setting" ("id" text not null, "key" text not null, "value" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_setting_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_setting_deleted_at" ON "loyalty_setting" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_loyalty_setting_key_unique" ON "loyalty_setting" ("key") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "loyalty_tier_change" ("id" text not null, "customer_id" text not null, "from_tier_id" text null, "to_tier_id" text null, "spend" numeric not null, "trigger" text not null, "raw_spend" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_tier_change_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_tier_change_deleted_at" ON "loyalty_tier_change" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_tier_change_customer" ON "loyalty_tier_change" ("customer_id", "created_at") WHERE deleted_at IS NULL;`
    )

    // The ledger is append-only: the database itself refuses to change or
    // delete an entry, whatever code tries. Mistakes are fixed with a
    // correcting entry. (TRUNCATE, used by test teardown, is not affected.)
    this.addSql(`create or replace function "loyalty_entry_immutable"() returns trigger language plpgsql as $$
begin
  raise exception 'loyalty_entry rows cannot be changed or deleted; add a correcting entry instead';
end;
$$;`)
    this.addSql(`drop trigger if exists "loyalty_entry_immutable" on "loyalty_entry";`)
    this.addSql(
      `create trigger "loyalty_entry_immutable" before update or delete on "loyalty_entry" for each row execute function "loyalty_entry_immutable"();`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop trigger if exists "loyalty_entry_immutable" on "loyalty_entry";`)
    this.addSql(`drop function if exists "loyalty_entry_immutable"();`)
    this.addSql(`drop table if exists "loyalty_account" cascade;`)

    this.addSql(`drop table if exists "loyalty_entry" cascade;`)

    this.addSql(`drop table if exists "loyalty_redemption" cascade;`)

    this.addSql(`drop table if exists "loyalty_reward" cascade;`)

    this.addSql(`drop table if exists "loyalty_setting" cascade;`)

    this.addSql(`drop table if exists "loyalty_tier_change" cascade;`)
  }
}
