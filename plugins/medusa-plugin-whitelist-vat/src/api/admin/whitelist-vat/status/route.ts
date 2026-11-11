import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { PROBLEM_STATUSES, resolveWhitelistVat, staleBefore } from "../../../../lib/whitelist-vat/api/utils"
import { maskIdentifier } from "../../../../lib/whitelist-vat/kit/secrets"
import { readPackageVersion } from "../../../../lib/whitelist-vat/kit/package-info"
import { PACKAGE_NAME } from "../../../../lib/whitelist-vat/options"
import { startOfWarsawDay } from "../../../../lib/whitelist-vat/verify"

/**
 * `GET /admin/whitelist-vat/status` — for the plugin's page: which
 * registers are in use, how much of today's white list quota is spent, how
 * many businesses have each kind of verdict, and the options in effect
 * (read-only; they are set in medusa-config.ts). Never returns the GUS key.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveWhitelistVat(req)
  const version = readPackageVersion(PACKAGE_NAME, __dirname)

  if (!(await service.isEnabled())) {
    return res.json({ enabled: false, disabled_reason: await service.getDisabledReason(), version })
  }

  const options = await service.getOptions()
  const count = async (filters: Record<string, unknown>) =>
    (await service.listAndCountWhitelistVatSubjects(filters, { take: 1, select: ["id"] }))[1]

  const [all, active, exempt, problem, stale, mfToday] = await Promise.all([
    count({}),
    count({ status: "active" }),
    count({ status: ["exempt", "valid"] }),
    count({ status: PROBLEM_STATUSES }),
    count({ $or: [{ checked_at: { $lt: staleBefore(options) } }, { checked_at: null }] }),
    service.countRequestsSince("mf", startOfWarsawDay(new Date())),
  ])

  res.json({
    enabled: true,
    version,
    registers: {
      mf: {
        enabled: options.mf.enabled,
        environment: options.mf.environment,
        requests_today: mfToday,
        daily_limit: options.mf.dailyLimit,
      },
      gus: {
        enabled: Boolean(options.gus.apiKey),
        environment: options.gus.environment,
        api_key: options.gus.apiKey ? maskIdentifier(options.gus.apiKey) : null,
      },
      vies: {
        enabled: options.vies.enabled,
        requester_vat_number: options.vies.requesterVatNumber ?? null,
      },
    },
    counts: { all, active, exempt, problem, stale },
    options: {
      cache_ttl_hours: options.cacheTtlHours,
      timeout_ms: options.timeoutMs,
      default_country: options.defaultCountry,
      tax_id_keys: options.taxIdKeys,
      verify_on_order_placed: options.orders.verifyOnPlaced,
      reject_on_completion: options.checkout.rejectOnCompletion,
      reject_statuses: options.checkout.rejectStatuses,
      store_route: options.store.enabled,
      store_rate_limit_per_minute: options.store.rateLimitPerMinute,
    },
  })
}
