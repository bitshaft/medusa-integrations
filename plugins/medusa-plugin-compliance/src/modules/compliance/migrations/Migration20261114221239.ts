import { Migration } from "@medusajs/framework/mikro-orm/migrations"

const APPEND_ONLY = [
  "compliance_consent_version",
  "compliance_consent_entry",
  "compliance_request_event",
  "compliance_price_record",
]

export class Migration20261114221239 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "compliance_consent_version" drop constraint if exists "compliance_consent_version_unique";`
    )
    this.addSql(
      `create table if not exists "compliance_anonymization" ("id" text not null, "customer_id" text not null, "request_id" text null, "actor_id" text null, "summary" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_anonymization_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_anonymization_deleted_at" ON "compliance_anonymization" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_compliance_anonymization_customer" ON "compliance_anonymization" ("customer_id") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "compliance_consent_entry" ("id" text not null, "type_key" text not null, "version" integer not null, "granted" boolean not null, "customer_id" text null, "email" text null, "anonymous_id" text null, "source" text check ("source" in ('storefront', 'admin', 'link', 'import')) not null, "placement" text null, "actor_type" text not null default 'customer', "actor_id" text null, "ip_hash" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_consent_entry_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_consent_entry_deleted_at" ON "compliance_consent_entry" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_consent_entry_customer" ON "compliance_consent_entry" ("customer_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_consent_entry_email" ON "compliance_consent_entry" ("email") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_consent_entry_anonymous" ON "compliance_consent_entry" ("anonymous_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_consent_entry_type" ON "compliance_consent_entry" ("type_key", "created_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "compliance_consent_type" ("id" text not null, "key" text not null, "name" jsonb not null, "placement" text check ("placement" in ('registration', 'checkout', 'account', 'newsletter', 'cookies')) not null, "required" boolean not null default false, "active" boolean not null default true, "cookie_category" text check ("cookie_category" in ('necessary', 'analytics', 'marketing')) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_consent_type_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_consent_type_deleted_at" ON "compliance_consent_type" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_compliance_consent_type_key" ON "compliance_consent_type" ("key") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "compliance_consent_version" ("id" text not null, "type_key" text not null, "version" integer not null, "text" jsonb not null, "text_hash" text not null, "actor_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_consent_version_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_consent_version_deleted_at" ON "compliance_consent_version" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_compliance_consent_version_unique" ON "compliance_consent_version" ("type_key", "version") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "compliance_manufacturer" ("id" text not null, "name" text not null, "manufacturer" jsonb not null, "outside_eu" boolean not null default false, "responsible" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_manufacturer_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_manufacturer_deleted_at" ON "compliance_manufacturer" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "compliance_order_retention" ("id" text not null, "order_id" text not null, "customer_id" text not null, "purge_after" timestamptz not null, "purged_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_order_retention_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_order_retention_deleted_at" ON "compliance_order_retention" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_compliance_order_retention_order" ON "compliance_order_retention" ("order_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_order_retention_due" ON "compliance_order_retention" ("purge_after") WHERE deleted_at IS NULL AND purged_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "compliance_price_record" ("id" text not null, "variant_id" text not null, "product_id" text not null, "region_id" text not null, "currency_code" text not null, "amount" numeric not null, "regular_amount" numeric not null, "discounted" boolean not null, "discount_kind" text check ("discount_kind" in ('price_list', 'promotion')) null, "discount_ref" text null, "source" text check ("source" in ('snapshot', 'change', 'job')) not null, "series_start" boolean not null default false, "start_known" boolean not null default false, "recorded_at" timestamptz not null, "raw_amount" jsonb not null, "raw_regular_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_price_record_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_price_record_deleted_at" ON "compliance_price_record" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_price_record_series" ON "compliance_price_record" ("variant_id", "region_id", "currency_code", "recorded_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_price_record_product" ON "compliance_price_record" ("product_id") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "compliance_product_safety" ("id" text not null, "product_id" text not null, "manufacturer_id" text null, "manufacturer" jsonb null, "outside_eu" boolean null, "responsible" jsonb null, "identification" jsonb null, "label_image_url" text null, "warnings" jsonb null, "gaps" jsonb null, "complete" boolean not null default false, "checked_at" timestamptz null, "product_title" text null, "product_status" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_product_safety_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_product_safety_deleted_at" ON "compliance_product_safety" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_compliance_product_safety_product" ON "compliance_product_safety" ("product_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_product_safety_complete" ON "compliance_product_safety" ("complete") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "compliance_request" ("id" text not null, "type" text check ("type" in ('access', 'portability', 'erasure', 'objection', 'rectification')) not null, "status" text check ("status" in ('unverified', 'open', 'accepted', 'completed', 'rejected', 'expired')) not null default 'unverified', "customer_id" text null, "email" text not null, "locale" text not null default 'pl', "details" text null, "token_hash" text null, "token_expires_at" timestamptz null, "ip_hash" text null, "verified_at" timestamptz null, "deadline_at" timestamptz null, "closed_at" timestamptz null, "reminded_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_request_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_request_deleted_at" ON "compliance_request" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_request_status" ON "compliance_request" ("status", "deadline_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_request_email" ON "compliance_request" ("email", "created_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_request_ip" ON "compliance_request" ("ip_hash", "created_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_request_token" ON "compliance_request" ("token_hash") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_request_customer" ON "compliance_request" ("customer_id") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "compliance_request_event" ("id" text not null, "request_id" text not null, "action" text check ("action" in ('submitted', 'verified', 'accepted', 'rejected', 'exported', 'anonymized', 'completed', 'noted', 'expired', 'due_soon')) not null, "actor_type" text not null, "actor_id" text null, "note" text null, "data" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_request_event_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_request_event_deleted_at" ON "compliance_request_event" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_request_event_request" ON "compliance_request_event" ("request_id", "created_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "compliance_setting" ("id" text not null, "key" text not null, "value" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compliance_setting_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_setting_deleted_at" ON "compliance_setting" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_compliance_setting_key" ON "compliance_setting" ("key") WHERE deleted_at IS NULL;`
    )
    // Registers are append-only: the database itself refuses to change or
    // delete a consent text, a consent entry, a request event or a price
    // record, whatever code tries. (TRUNCATE, used by test teardown, is not affected.)
    this.addSql(`create or replace function "compliance_append_only"() returns trigger language plpgsql as $$
begin
  raise exception '% rows cannot be changed or deleted; add a new row instead', TG_TABLE_NAME;
end;
$$;`)
    for (const table of APPEND_ONLY) {
      this.addSql(`drop trigger if exists "${table}_append_only" on "${table}";`)
      this.addSql(
        `create trigger "${table}_append_only" before update or delete on "${table}" for each row execute function "compliance_append_only"();`
      )
    }
    // A request is never deleted and its content never changes; only its
    // status fields move on. What happened is in compliance_request_event.
    this.addSql(`create or replace function "compliance_request_guard"() returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'compliance_request rows cannot be deleted';
  end if;
  if NEW.id is distinct from OLD.id or NEW.type is distinct from OLD.type or NEW.email is distinct from OLD.email
     or NEW.customer_id is distinct from OLD.customer_id or NEW.details is distinct from OLD.details
     or NEW.created_at is distinct from OLD.created_at or NEW.deleted_at is distinct from OLD.deleted_at then
    raise exception 'only the status fields of a compliance_request can change';
  end if;
  return NEW;
end;
$$;`)
    this.addSql(`drop trigger if exists "compliance_request_guard" on "compliance_request";`)
    this.addSql(
      `create trigger "compliance_request_guard" before update or delete on "compliance_request" for each row execute function "compliance_request_guard"();`
    )
  }

  override async down(): Promise<void> {
    for (const table of APPEND_ONLY) this.addSql(`drop trigger if exists "${table}_append_only" on "${table}";`)
    this.addSql(`drop function if exists "compliance_append_only"();`)
    this.addSql(`drop trigger if exists "compliance_request_guard" on "compliance_request";`)
    this.addSql(`drop function if exists "compliance_request_guard"();`)
    this.addSql(`drop table if exists "compliance_anonymization" cascade;`)

    this.addSql(`drop table if exists "compliance_consent_entry" cascade;`)

    this.addSql(`drop table if exists "compliance_consent_type" cascade;`)

    this.addSql(`drop table if exists "compliance_consent_version" cascade;`)

    this.addSql(`drop table if exists "compliance_manufacturer" cascade;`)

    this.addSql(`drop table if exists "compliance_order_retention" cascade;`)

    this.addSql(`drop table if exists "compliance_price_record" cascade;`)

    this.addSql(`drop table if exists "compliance_product_safety" cascade;`)

    this.addSql(`drop table if exists "compliance_request" cascade;`)

    this.addSql(`drop table if exists "compliance_request_event" cascade;`)

    this.addSql(`drop table if exists "compliance_setting" cascade;`)
  }
}
