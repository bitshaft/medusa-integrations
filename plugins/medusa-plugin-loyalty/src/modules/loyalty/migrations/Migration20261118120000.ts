import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * The ledger stays append-only, with one exception: "Restore test data" in
 * demo mode replaces the whole program. It sets `loyalty.demo_reset` for
 * its own transaction only (`set_config(..., true)`), so no other session
 * and no later statement can delete an entry.
 */
export class Migration20261118120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create or replace function "loyalty_entry_immutable"() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('loyalty.demo_reset', true) = 'on' then
    return old;
  end if;
  raise exception 'loyalty_entry rows cannot be changed or deleted; add a correcting entry instead';
end;
$$;`)
  }

  override async down(): Promise<void> {
    this.addSql(`create or replace function "loyalty_entry_immutable"() returns trigger language plpgsql as $$
begin
  raise exception 'loyalty_entry rows cannot be changed or deleted; add a correcting entry instead';
end;
$$;`)
  }
}
