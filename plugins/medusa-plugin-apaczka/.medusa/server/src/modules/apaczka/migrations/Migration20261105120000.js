"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20261105120000 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
const STATUSES = "'pending', 'created', 'posted', 'in_transit', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'exception', 'returned', 'canceled', 'claimed', 'unknown'";
class Migration20261105120000 extends migrations_1.Migration {
    async up() {
        this.addSql(`create table if not exists "apaczka_shipment" (` +
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
            `constraint "apaczka_shipment_pkey" primary key ("id"));`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_apaczka_shipment_fulfillment_id_unique" ON "apaczka_shipment" (fulfillment_id) WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_apaczka_shipment_apaczka_order_id" ON "apaczka_shipment" (apaczka_order_id) WHERE deleted_at IS NULL AND apaczka_order_id IS NOT NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_apaczka_shipment_waybill_number" ON "apaczka_shipment" (waybill_number) WHERE deleted_at IS NULL AND waybill_number IS NOT NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_apaczka_shipment_order_id" ON "apaczka_shipment" (order_id) WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_apaczka_shipment_status" ON "apaczka_shipment" (status) WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_apaczka_shipment_deleted_at" ON "apaczka_shipment" (deleted_at) WHERE deleted_at IS NOT NULL;`);
        this.addSql(`create table if not exists "apaczka_tracking_event" (` +
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
            `constraint "apaczka_tracking_event_pkey" primary key ("id"));`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_apaczka_tracking_event_shipment_id" ON "apaczka_tracking_event" (shipment_id) WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_apaczka_tracking_event_shipment_id_fingerprint_unique" ON "apaczka_tracking_event" (shipment_id, fingerprint) WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_apaczka_tracking_event_shipment_id_occurred_at" ON "apaczka_tracking_event" (shipment_id, occurred_at) WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_apaczka_tracking_event_deleted_at" ON "apaczka_tracking_event" (deleted_at) WHERE deleted_at IS NOT NULL;`);
        this.addSql(`alter table if exists "apaczka_tracking_event" add constraint "apaczka_tracking_event_shipment_id_foreign" ` +
            `foreign key ("shipment_id") references "apaczka_shipment" ("id") on update cascade on delete cascade;`);
    }
    async down() {
        this.addSql(`alter table if exists "apaczka_tracking_event" drop constraint if exists "apaczka_tracking_event_shipment_id_foreign";`);
        this.addSql(`drop table if exists "apaczka_tracking_event" cascade;`);
        this.addSql(`drop table if exists "apaczka_shipment" cascade;`);
    }
}
exports.Migration20261105120000 = Migration20261105120000;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNjExMDUxMjAwMDAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9hcGFjemthL21pZ3JhdGlvbnMvTWlncmF0aW9uMjAyNjExMDUxMjAwMDAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEseUVBQW9FO0FBRXBFLE1BQU0sUUFBUSxHQUNaLDhKQUE4SixDQUFBO0FBRWhLLE1BQWEsdUJBQXdCLFNBQVEsc0JBQVM7SUFDM0MsS0FBSyxDQUFDLEVBQUU7UUFDZixJQUFJLENBQUMsTUFBTSxDQUNULGlEQUFpRDtZQUMvQyxzQkFBc0I7WUFDdEIsa0NBQWtDO1lBQ2xDLHdCQUF3QjtZQUN4Qix5QkFBeUI7WUFDekIsZ0NBQWdDO1lBQ2hDLDhCQUE4QjtZQUM5Qiw0QkFBNEI7WUFDNUIsaUNBQWlDO1lBQ2pDLDRCQUE0QjtZQUM1Qix3QkFBd0I7WUFDeEIscUNBQXFDLFFBQVEsaUNBQWlDO1lBQzlFLDBCQUEwQjtZQUMxQiw4Q0FBOEM7WUFDOUMsMkNBQTJDO1lBQzNDLHdCQUF3QjtZQUN4Qix1RkFBdUY7WUFDdkYsNEJBQTRCO1lBQzVCLDhCQUE4QjtZQUM5Qiw2QkFBNkI7WUFDN0IsaUNBQWlDO1lBQ2pDLDJCQUEyQjtZQUMzQiwyQkFBMkI7WUFDM0IsNkJBQTZCO1lBQzdCLGlDQUFpQztZQUNqQyxtQ0FBbUM7WUFDbkMsa0NBQWtDO1lBQ2xDLG9DQUFvQztZQUNwQyxxQ0FBcUM7WUFDckMscUJBQXFCO1lBQ3JCLHlCQUF5QjtZQUN6QixtREFBbUQ7WUFDbkQsbURBQW1EO1lBQ25ELGlDQUFpQztZQUNqQyx5REFBeUQsQ0FDNUQsQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QsaUpBQWlKLENBQ2xKLENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULHdLQUF3SyxDQUN6SyxDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FDVCxrS0FBa0ssQ0FDbkssQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QsdUhBQXVILENBQ3hILENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULG1IQUFtSCxDQUNwSCxDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FDVCwrSEFBK0gsQ0FDaEksQ0FBQTtRQUVELElBQUksQ0FBQyxNQUFNLENBQ1QsdURBQXVEO1lBQ3JELHNCQUFzQjtZQUN0QiwrRUFBK0U7WUFDL0UscUNBQXFDLFFBQVEsZUFBZTtZQUM1RCw4QkFBOEI7WUFDOUIsMkJBQTJCO1lBQzNCLHFCQUFxQjtZQUNyQixzQ0FBc0M7WUFDdEMsK0JBQStCO1lBQy9CLCtCQUErQjtZQUMvQixtREFBbUQ7WUFDbkQsbURBQW1EO1lBQ25ELGlDQUFpQztZQUNqQywrREFBK0QsQ0FDbEUsQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QseUlBQXlJLENBQzFJLENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULGdMQUFnTCxDQUNqTCxDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FDVCxrS0FBa0ssQ0FDbkssQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QsMklBQTJJLENBQzVJLENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULDZHQUE2RztZQUMzRyx1R0FBdUcsQ0FDMUcsQ0FBQTtJQUNILENBQUM7SUFFUSxLQUFLLENBQUMsSUFBSTtRQUNqQixJQUFJLENBQUMsTUFBTSxDQUNULHdIQUF3SCxDQUN6SCxDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyx3REFBd0QsQ0FBQyxDQUFBO1FBQ3JFLElBQUksQ0FBQyxNQUFNLENBQUMsa0RBQWtELENBQUMsQ0FBQTtJQUNqRSxDQUFDO0NBQ0Y7QUFuR0QsMERBbUdDIn0=