import type { MedusaContainer } from "@medusajs/framework/types"

import { grantBirthdays } from "../lib/loyalty/server/maintenance"
import { logger, resolveLoyalty } from "../lib/loyalty/server/runtime"

/** Daily, in the morning: birthday points, once a year per customer. */
export default async function loyaltyBirthdays(container: MedusaContainer) {
  const service = resolveLoyalty(container)
  if (!(await service.isEnabled())) return
  const granted = await grantBirthdays(container, await service.getSettings(), (await service.getOptions()).timeZone)
  if (granted) logger(container).info(`[loyalty] Birthday points for ${granted} customer(s)`)
}

export const config = { name: "loyalty-birthdays", schedule: "15 6 * * *" }
