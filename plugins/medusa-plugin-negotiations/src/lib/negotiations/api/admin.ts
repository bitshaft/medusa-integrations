import type { MedusaRequest } from "@medusajs/framework/http"

import { nextDeadline } from "../expiry"
import { checkFloors } from "../floors"
import { allowedOfferModes } from "../offers"
import { ensureDemo } from "../server/demo"
import { resolveNegotiations } from "../server/runtime"
import { floorsOf } from "../server/threads"
import { teamMessage, teamView, type ThreadRecord } from "../views"

/** Demo mode shows the demo threads only (seeded on first use); otherwise the real ones. */
export async function demoMode(req: MedusaRequest): Promise<boolean> {
  const service = resolveNegotiations(req.scope)
  const demo = (await service.getOptions()).demo
  if (demo) await ensureDemo(req.scope)
  return demo
}

export async function listRow(req: MedusaRequest, thread: ThreadRecord) {
  const { expiryDays } = await resolveNegotiations(req.scope).getOptions()
  const view = teamView(thread, { expiryDays })
  return { ...view, next_deadline: nextDeadline(thread, expiryDays)?.toISOString() ?? null }
}

/** Everything the thread page needs: the thread, all messages, minimum prices and their check, writes and runs. */
export async function threadDetail(req: MedusaRequest, thread: ThreadRecord) {
  const service = resolveNegotiations(req.scope)
  const [options, settings, messages, floors, writes, runs] = await Promise.all([
    service.getOptions(),
    service.getSettings(),
    service.listMessages(thread.id, { internal: true }),
    floorsOf(req.scope, thread),
    service.listWrites(thread.id),
    service.listRuns({ thread_id: thread.id, limit: 50 }),
  ])
  const check = (lines: ThreadRecord["target"]["lines"] | undefined) =>
    lines ? checkFloors(lines, thread.lines, floors, settings.max_discount_bp) : null
  return {
    negotiation: { ...(await listRow(req, thread)) },
    messages: messages.map(teamMessage),
    floors,
    floor_checks: { target: check(thread.target.lines), offer: check(thread.offer?.lines) },
    offer_modes: allowedOfferModes(thread.kind, settings.cart_counter_modes),
    writes: writes.map((w) => ({
      ...w,
      created_at: w.created_at.toISOString(),
      updated_at: w.updated_at.toISOString(),
    })),
    runs,
    writers: {
      draft_orders: { on: options.writers.draftOrders, armed: settings.armed.draft_orders },
      cart: { on: options.writers.cart, armed: settings.armed.cart },
    },
    customer_accept: options.customerAccept,
    expiry_days: options.expiryDays,
    max_discount_bp: settings.max_discount_bp,
  }
}
