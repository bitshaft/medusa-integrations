import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Settings staff change on the admin's Settings tab (key → JSON). */
export class Migration20261116011653 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "apaczka_setting" ("id" text not null, "key" text not null, "value" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "apaczka_setting_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_apaczka_setting_deleted_at" ON "apaczka_setting" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_apaczka_setting_key" ON "apaczka_setting" ("key") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "apaczka_setting" cascade;`)
  }
}
