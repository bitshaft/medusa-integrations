import { model } from "@medusajs/framework/utils"

/**
 * One OLX advert for one variant. `id` is sent to OLX as `external_id`, so a
 * write whose answer was lost can be found again instead of repeated.
 */
export const OlxAdvert = model
  .define("olx_advert", {
    id: model.id({ prefix: "olxad" }).primaryKey(),
    variant_id: model.text(),
    product_id: model.text(),
    demo: model.boolean().default(false),
    olx_advert_id: model.text().nullable(),
    status: model.text(),
    url: model.text().nullable(),
    valid_to: model.dateTime().nullable(),
    title: model.text(),
    price: model.text(),
    payload: model.json(),
    last_error: model.text().nullable(),
    /** Must come down on OLX; stays set until OLX confirmed it. */
    pending_deactivate: model.boolean().default(false),
    pending_success: model.boolean().default(false),
    sold_channel: model.text().nullable(),
    sold_at: model.dateTime().nullable(),
    /** Who is writing this advert to OLX right now. */
    claimed_at: model.dateTime().nullable(),
    /** Set just before the create request: from here on OLX may have the advert. */
    write_started_at: model.dateTime().nullable(),
    synced_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_olx_advert_variant_demo_unique",
      on: ["variant_id", "demo"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_olx_advert_product", on: ["product_id"], where: "deleted_at IS NULL" },
    { name: "IDX_olx_advert_status", on: ["status"], where: "deleted_at IS NULL" },
    { name: "IDX_olx_advert_olx_id", on: ["olx_advert_id"], where: "deleted_at IS NULL" },
  ])
