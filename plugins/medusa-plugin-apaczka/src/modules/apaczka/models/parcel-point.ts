import { model } from "@medusajs/framework/utils"

/**
 * One parcel point (locker, pickup point) of one carrier, stored so
 * searches never hold whole lists in memory. Written in bulk by the point
 * directory (`src/lib/apaczka/point-store.ts`), one carrier and country at a
 * time; see `ApaczkaPointSync` for each list's state.
 */
export const ApaczkaParcelPoint = model
  .define("apaczka_point", {
    id: model.id({ prefix: "apzpt" }).primaryKey(),
    /** Apaczka points type (`points/{type}/`): `INPOST`, `DPD`, `DHL`, `POCZTA`, `PWR`… */
    type: model.text(),
    country_code: model.text(),
    /** Apaczka's `foreign_address_id`, the code customers see, e.g. `WAW41N`. */
    external_id: model.text(),
    subtype: model.text().nullable(),
    name: model.text().nullable(),
    line1: model.text(),
    line2: model.text().nullable(),
    street: model.text().nullable(),
    house_number: model.text().nullable(),
    postal_code: model.text(),
    city: model.text(),
    latitude: model.float().nullable(),
    longitude: model.float().nullable(),
    /** As sent by Apaczka: text, or `{ mon: [["08:00","20:00"]], … }`. */
    open_hours: model.json().nullable(),
    /** Short form for lists, e.g. `24/7` or `Mon–Fri 08:00–20:00`. */
    open_hours_summary: model.text().nullable(),
    accepts_cod: model.boolean().default(true),
    accepts_delivery: model.boolean().default(true),
    accepts_sending: model.boolean().default(true),
    image_url: model.text().nullable(),
    additional_info: model.text().nullable(),
    /** Lowercase, no diacritics: code, name, street, city and postal code, for text search. */
    search: model.text(),
    /** The sync that last saw this point; older rows are removed when a sync finishes. */
    synced_at: model.dateTime(),
  })
  .indexes([
    { name: "IDX_apaczka_point_external", on: ["type", "country_code", "external_id"], unique: true },
    { name: "IDX_apaczka_point_location", on: ["type", "country_code", "latitude", "longitude"] },
    { name: "IDX_apaczka_point_synced", on: ["type", "country_code", "synced_at"] },
  ])
