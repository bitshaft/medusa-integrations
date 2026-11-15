import type { MedusaContainer } from "@medusajs/framework/types"

import { logger } from "../lib/negotiations/server/runtime"
import { sweep } from "../lib/negotiations/server/threads"

/**
 * Every hour: counter-offers past their deadline lapse (the thread goes back
 * to the team) and threads with no move for `expiryDays` expire. Each is one
 * conditional update, so a person acting at the same moment wins or loses
 * cleanly; nothing is closed twice. Demo threads are skipped.
 */
export default async function negotiationsExpireJob(container: MedusaContainer) {
  const result = await sweep(container)
  if (result.lapsed || result.expired) {
    logger(container).info(
      `[negotiations] ${result.lapsed} counter-offer(s) lapsed, ${result.expired} thread(s) expired`
    )
  }
}

export const config = {
  name: "negotiations-expire",
  schedule: "17 * * * *",
}
