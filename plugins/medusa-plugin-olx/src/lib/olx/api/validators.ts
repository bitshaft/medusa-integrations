import { z } from "@medusajs/framework/zod"

const attribute = z.object({
  code: z.string().min(1),
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
})

export const AdvertBody = z.object({
  title: z.string(),
  description: z.string(),
  price: z.string(),
  negotiable: z.boolean(),
  category_id: z.number().int(),
  attributes: z.array(attribute).max(100),
  images: z.array(z.string()).max(30),
  city_id: z.number().int(),
  district_id: z.number().int().nullable(),
  contact_name: z.string(),
  contact_phone: z.string().nullable(),
  advertiser_type: z.enum(["private", "business"]),
})

export const AdminPublish = z.object({
  variant_id: z.string().min(1),
  advert: AdvertBody,
})

export const AdminBulkPublish = z.object({
  variant_ids: z.array(z.string().min(1)).min(1).max(50),
  category_id: z.number().int().positive(),
  attributes: z.array(attribute).max(100),
})

export const AdminCommand = z.object({
  command: z.enum(["deactivate", "activate", "sold"]),
})

const party = z.object({
  name: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  email: z.string().max(200).optional(),
})

export const AdminSettings = z.object({
  contact_name: z.string().max(100),
  contact_phone: z.string().max(40),
  city_id: z.number().int().nullable(),
  city_name: z.string().max(200),
  district_id: z.number().int().nullable(),
  advertiser_type: z.enum(["private", "business"]),
  negotiable: z.boolean(),
  category_id: z.number().int().nullable(),
  category_name: z.string().max(300),
  safety: z.object({
    placed_before_2024: z.boolean().optional(),
    manufacturer: party.optional(),
    warning_and_safety: z.string().max(2000).optional(),
  }),
})

export const AdminAdvertsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(200).optional(),
  status: z.preprocess(
    (value) => (typeof value === "string" ? value.split(",").filter(Boolean) : value),
    z.array(z.string()).optional()
  ),
})

export const AdminSearchQuery = z.object({ q: z.string().trim().min(3).max(150) })
export const AdminCityQuery = z.object({ q: z.string().trim().min(2).max(100) })
