import { Migration } from "@medusajs/framework/mikro-orm/migrations"

const STATUSES =
  "'pending', 'created', 'posted', 'in_transit', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'exception', 'returned', 'canceled', 'claimed', 'unknown'"

export class Migration20261105120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "apaczka_shipment" (` +
        `"id" text not null, ` +
        `"fulfillment_id" text not null, ` +
        `"order_id" text null, ` +
        `"return_id" text null, ` +
        `"apaczka_order_id" text null, ` +
        `"waybill_number" text null, ` +
        `"tracking_url" text null, ` +
        `"service_id" integer not null, ` +
        `"service_name" text null, ` +
        `"supplier" text null, ` +
        `"status" text check ("status" in (${STATUSES})) not null default 'pending', ` +
        `"raw_status" text null, ` +
        `"is_return" boolean not null default false, ` +
        `"is_cod" boolean not null default false, ` +
        `"point_id" text null, ` +
        `"label_format" text check ("label_format" in ('pdf', 'zpl')) not null default 'pdf', ` +
        `"price_net" integer null, ` +
        `"price_gross" integer null, ` +
        `"cod_amount" integer null, ` +
        `"declared_value" integer null, ` +
        `"pickup_type" text null, ` +
        `"pickup_date" text null, ` +
        `"pickup_number" text null, ` +
        `"shipped_at" timestamptz null, ` +
        `"delivered_at" timestamptz null, ` +
        `"canceled_at" timestamptz null, ` +
        `"last_event_at" timestamptz null, ` +
        `"last_synced_at" timestamptz null, ` +
        `"error" text null, ` +
        `"metadata" jsonb null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "apaczka_shipment_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_apaczka_shipment_fulfillment_id_unique" ON "apaczka_shipment" (fulfillment_id) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_shipment_apaczka_order_id" ON "apaczka_shipment" (apaczka_order_id) WHERE deleted_at IS NULL AND apaczka_order_id IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_shipment_waybill_number" ON "apaczka_shipment" (waybill_number) WHERE deleted_at IS NULL AND waybill_number IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_shipment_order_id" ON "apaczka_shipment" (order_id) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_shipment_status" ON "apaczka_shipment" (status) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_shipment_deleted_at" ON "apaczka_shipment" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )

    this.addSql(
      `create table if not exists "apaczka_tracking_event" (` +
        `"id" text not null, ` +
        `"source" text check ("source" in ('webhook', 'polling', 'system')) not null, ` +
        `"status" text check ("status" in (${STATUSES})) not null, ` +
        `"raw_status" text not null, ` +
        `"description" text null, ` +
        `"place" text null, ` +
        `"occurred_at" timestamptz not null, ` +
        `"fingerprint" text not null, ` +
        `"shipment_id" text not null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "apaczka_tracking_event_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_tracking_event_shipment_id" ON "apaczka_tracking_event" (shipment_id) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_apaczka_tracking_event_shipment_id_fingerprint_unique" ON "apaczka_tracking_event" (shipment_id, fingerprint) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_tracking_event_shipment_id_occurred_at" ON "apaczka_tracking_event" (shipment_id, occurred_at) WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_tracking_event_deleted_at" ON "apaczka_tracking_event" (deleted_at) WHERE deleted_at IS NOT NULL;`
    )
    this.addSql(
      `alter table if exists "apaczka_tracking_event" add constraint "apaczka_tracking_event_shipment_id_foreign" ` +
        `foreign key ("shipment_id") references "apaczka_shipment" ("id") on update cascade on delete cascade;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "apaczka_tracking_event" drop constraint if exists "apaczka_tracking_event_shipment_id_foreign";`
    )
    this.addSql(`drop table if exists "apaczka_tracking_event" cascade;`)
    this.addSql(`drop table if exists "apaczka_shipment" cascade;`)
  }
}
