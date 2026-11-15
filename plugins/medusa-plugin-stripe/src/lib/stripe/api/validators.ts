import { z } from "@medusajs/framework/zod"

import { METHOD_GROUPS } from "../methods"

const refresh = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true")

export const AdminOverviewQuery = z.object({
  days: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(30)]))
    .default(7),
  refresh,
})
export type AdminOverviewQuery = z.infer<typeof AdminOverviewQuery>

export const AdminPaymentsQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  status: z.string().max(40).optional(),
  method: z.enum(METHOD_GROUPS).optional(),
  currency: z.string().length(3).optional(),
  format: z.enum(["json", "csv"]).default("json"),
  refresh,
})
export type AdminPaymentsQuery = z.infer<typeof AdminPaymentsQuery>

export const AdminPayoutsQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(90), refresh })
export type AdminPayoutsQuery = z.infer<typeof AdminPayoutsQuery>

export const AdminPayoutQuery = z.object({ format: z.enum(["json", "csv"]).default("json"), refresh })
export type AdminPayoutQuery = z.infer<typeof AdminPayoutQuery>

export const AdminRefreshQuery = z.object({ refresh })
export type AdminRefreshQuery = z.infer<typeof AdminRefreshQuery>
