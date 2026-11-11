import { z } from "@medusajs/framework/zod"

import { CHECK_SOURCES } from "../../../modules/whitelist-vat/models/check"

const number = z.string().trim().min(1).max(40)
const country = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "Expected a two-letter country code")
const paging = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}

export const StoreVerify = z.object({
  /** The tax ID as the customer typed it. */
  number,
  /** Billing country, for numbers typed without a prefix. */
  country_code: country.optional(),
})

export const AdminVerify = z.object({
  number,
  country_code: country.optional(),
  /** Ask the registers even when a recent answer is stored. */
  force: z.boolean().optional(),
})

export const AdminRecordVerify = z.object({
  force: z.boolean().optional(),
})

export const AdminCheckBankAccount = z.object({
  nip: number,
  /** 26 digits, with or without spaces and the PL prefix. */
  account: z.string().trim().min(26).max(40),
})

/** Groups of statuses the contractors list filters by. */
export const SUBJECT_FILTERS = ["all", "active", "exempt", "problem", "stale"] as const

export const AdminSubjectsQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  filter: z.enum(SUBJECT_FILTERS).default("all"),
  ...paging,
})

export const AdminChecksQuery = z.object({
  number: z.string().trim().min(1).max(40).optional(),
  order_id: z.string().min(1).optional(),
  customer_id: z.string().min(1).optional(),
  source: z.enum(CHECK_SOURCES).optional(),
  ...paging,
})

export type StoreVerifyBody = z.output<typeof StoreVerify>
export type AdminVerifyBody = z.output<typeof AdminVerify>
export type AdminRecordVerifyBody = z.output<typeof AdminRecordVerify>
export type AdminCheckBankAccountBody = z.output<typeof AdminCheckBankAccount>
export type AdminSubjectsQueryParams = z.output<typeof AdminSubjectsQuery>
export type AdminChecksQueryParams = z.output<typeof AdminChecksQuery>
