import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Amount columns, created as integer by the generator and widened to bigint below. */
const AMOUNT_COLUMNS: Record<string, string[]> = {
  negotiation_thread: ["catalog_total", "target_total", "offer_total", "accepted_total"],
  negotiation_message: ["price_total"],
  negotiation_variant_floor: ["amount"],
}

export class Migration20261115162839 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "negotiation_variant_floor" drop constraint if exists "negotiation_variant_floor_unique";`
    )
    this.addSql(
      `create table if not exists "negotiation_counter" ("id" text not null, "year" integer not null, "value" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "negotiation_counter_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_counter_deleted_at" ON "negotiation_counter" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_negotiation_counter_year" ON "negotiation_counter" ("year") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "negotiation_message" ("id" text not null, "thread_id" text not null, "author" text check ("author" in ('customer', 'team', 'system')) not null, "author_id" text null, "type" text check ("type" in ('message', 'target_price', 'counter_offer', 'acceptance', 'rejection', 'internal_note', 'expiry', 'offer_expired', 'withdrawal', 'added_to_cart', 'draft_order_created')) not null, "body" text null, "price" jsonb null, "price_total" integer null, "internal" boolean not null default false, "is_demo" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "negotiation_message_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_message_deleted_at" ON "negotiation_message" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_message_thread" ON "negotiation_message" ("thread_id", "created_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_message_author" ON "negotiation_message" ("author_id", "created_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "negotiation_setting" ("id" text not null, "key" text not null, "value" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "negotiation_setting_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_setting_deleted_at" ON "negotiation_setting" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_negotiation_setting_key" ON "negotiation_setting" ("key") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "negotiation_thread" ("id" text not null, "number" text not null, "is_demo" boolean not null default false, "customer_id" text not null, "customer" jsonb not null, "kind" text check ("kind" in ('product', 'cart')) not null, "lines" jsonb not null, "currency_code" text not null, "tax_inclusive" boolean not null default false, "region_id" text null, "source_cart_id" text null, "product_id" text null, "variant_id" text null, "quantity_total" integer not null, "catalog_total" integer not null, "target" jsonb not null, "target_total" integer not null, "offer" jsonb null, "offer_total" integer null, "offer_expires_at" timestamptz null, "accepted" jsonb null, "accepted_total" integer null, "accepted_by" text null, "accepted_at" timestamptz null, "accepted_until" timestamptz null, "status" text check ("status" in ('open', 'countered', 'accepted', 'rejected', 'expired', 'withdrawn')) not null default 'open', "turn" text null, "assignee_id" text null, "version" integer not null default 1, "last_activity_at" timestamptz not null, "last_author" text not null, "first_team_reply_at" timestamptz null, "closed_at" timestamptz null, "draft_order_id" text null, "order_id" text null, "search_text" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "negotiation_thread_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_thread_deleted_at" ON "negotiation_thread" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_negotiation_thread_number" ON "negotiation_thread" ("number") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_thread_status" ON "negotiation_thread" ("status", "last_activity_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_thread_customer" ON "negotiation_thread" ("customer_id", "created_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_thread_product" ON "negotiation_thread" ("product_id") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "negotiation_variant_floor" ("id" text not null, "variant_id" text not null, "currency_code" text not null, "amount" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "negotiation_variant_floor_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_variant_floor_deleted_at" ON "negotiation_variant_floor" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_negotiation_variant_floor_unique" ON "negotiation_variant_floor" ("variant_id", "currency_code") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "negotiation_write" ("id" text not null, "thread_id" text not null, "kind" text check ("kind" in ('draft_order', 'cart')) not null, "status" text check ("status" in ('pending', 'done', 'failed', 'removed', 'ordered')) not null, "target_id" text null, "line_item_ids" jsonb null, "actor_id" text null, "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "negotiation_write_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_write_deleted_at" ON "negotiation_write" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_write_thread" ON "negotiation_write" ("thread_id", "kind") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "negotiation_write_run" ("id" text not null, "thread_id" text not null, "writer" text check ("writer" in ('draft_order', 'cart')) not null, "stage" text check ("stage" in ('plan', 'dry_run', 'commit', 'error')) not null, "actor_type" text not null, "actor_id" text null, "input" jsonb null, "result" jsonb null, "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "negotiation_write_run_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_write_run_deleted_at" ON "negotiation_write_run" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_negotiation_write_run_created" ON "negotiation_write_run" ("created_at") WHERE deleted_at IS NULL;`
    )

    // Amounts are integers in minor units; bigint so a large B2B order (over 21 million zł) still fits.
    for (const [table, columns] of Object.entries(AMOUNT_COLUMNS)) {
      for (const column of columns) {
        this.addSql(`alter table "${table}" alter column "${column}" type bigint;`)
      }
    }

    // Exactly once: one live draft order per thread, one live cart write per thread.
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_negotiation_write_draft_once" ON "negotiation_write" ("thread_id") WHERE kind = 'draft_order' AND status IN ('pending', 'done') AND deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_negotiation_write_cart_once" ON "negotiation_write" ("thread_id") WHERE kind = 'cart' AND status IN ('pending', 'done', 'ordered') AND deleted_at IS NULL;`
    )

    // Messages are append-only. Demo rows may be deleted, so "Restore demo data" can replace them.
    this.addSql(`create or replace function "negotiation_message_append_only"() returns trigger language plpgsql as $$
      begin
        if (TG_OP = 'DELETE' and OLD.is_demo) then return OLD; end if;
        raise exception 'negotiation_message is append-only';
      end $$;`)
    this.addSql(`drop trigger if exists "negotiation_message_append_only" on "negotiation_message";`)
    this.addSql(
      `create trigger "negotiation_message_append_only" before update or delete on "negotiation_message" for each row execute function "negotiation_message_append_only"();`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop trigger if exists "negotiation_message_append_only" on "negotiation_message";`)
    this.addSql(`drop function if exists "negotiation_message_append_only"();`)
    this.addSql(`drop table if exists "negotiation_counter" cascade;`)

    this.addSql(`drop table if exists "negotiation_message" cascade;`)

    this.addSql(`drop table if exists "negotiation_setting" cascade;`)

    this.addSql(`drop table if exists "negotiation_thread" cascade;`)

    this.addSql(`drop table if exists "negotiation_variant_floor" cascade;`)

    this.addSql(`drop table if exists "negotiation_write" cascade;`)

    this.addSql(`drop table if exists "negotiation_write_run" cascade;`)
  }
}
