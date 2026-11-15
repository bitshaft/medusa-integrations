import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { Budget } from "../budget"
import {
  checkAccount,
  checkCapture,
  checkDomains,
  checkKey,
  checkMode,
  checkPaymentMethods,
  checkProvider,
  type CheckResult,
  checkWebhook,
  expectedMode,
  type Probe,
  webhookUrl,
} from "../checks"
import { StripeApiError } from "../client"
import type { StripeReader } from "../reader"
import { resolveStripe } from "./runtime"

type Row = Record<string, any>

/** Turns a Stripe call into a Probe: a value, or why it failed (never throws). */
export async function probe<T>(task: () => Promise<T>): Promise<Probe<T>> {
  try {
    return { ok: true, value: await task() }
  } catch (error) {
    if (error instanceof StripeApiError) {
      if (error.invalidKey) return { ok: false, reason: "invalid_key", message: error.message }
      if (error.noPermission) return { ok: false, reason: "no_permission", message: error.message }
    }
    return { ok: false, reason: "unavailable", message: (error as Error).message }
  }
}

/** Ids of the payment providers registered in Medusa. */
async function registeredProviders(container: MedusaContainer): Promise<string[]> {
  try {
    const payment = container.resolve(Modules.PAYMENT) as unknown as {
      listPaymentProviders: (filters?: Row, config?: Row) => Promise<Array<{ id: string; is_enabled?: boolean }>>
    }
    return (await payment.listPaymentProviders({}, { take: 500 }))
      .filter((p) => p.is_enabled !== false)
      .map((p) => p.id)
  } catch {
    return []
  }
}

/** The `capture` option of the official provider in medusa-config, or null when it cannot be read. */
export function providerCaptureOption(configModule: Row | undefined, providerId: string): boolean | null {
  const modules = configModule?.modules
  const list: Row[] = Array.isArray(modules)
    ? modules
    : Object.entries(modules ?? {}).map(([key, value]) => ({ key, ...(value as Row) }))
  const payment = list.find(
    (m) => m.key === Modules.PAYMENT || m.key === "payment" || String(m.resolve ?? "").endsWith("/payment")
  )
  const providers: Row[] = payment?.options?.providers ?? []
  const provider = providers.find(
    (p) => (p.id ?? "stripe") === providerId && String(p.resolve ?? "").includes("payment-stripe")
  )
  if (!provider) return null
  return Boolean(provider.options?.capture)
}

function backendUrl(configModule: Row | undefined, option: string | undefined): string | null {
  return option ?? configModule?.admin?.backendUrl ?? process.env.MEDUSA_BACKEND_URL ?? null
}

/**
 * Every health check with its verdict. Reads only what the checks need;
 * each Stripe call is a Probe, so a missing permission is a warning on one
 * check, not an error page.
 */
export async function runChecks(
  container: MedusaContainer,
  reader: StripeReader | null,
  options: { fresh?: boolean } = {}
) {
  const service = resolveStripe(container)
  const opts = service.getOptions()
  const info = service.keyInfo()
  const configModule = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE, { allowUnregistered: true }) as
    Row | undefined
  const budget = new Budget()
  const fresh = options.fresh
  const providers = await registeredProviders(container)
  const results: CheckResult[] = [checkProvider(providers, opts.providerId)]
  const mode = checkMode(info, expectedMode(opts.mode, process.env.NODE_ENV))

  if (!reader) {
    results.push(checkKey(info, null))
    results.push(mode)
    return { partial: false, missed: [] as string[], checks: results }
  }

  const url = webhookUrl(backendUrl(configModule, opts.backendUrl), opts.providerId)
  const day = Math.floor(Date.now() / 1000) - 86_400
  const run = <T>(part: string, task: () => Promise<T>) =>
    budget.run(part, () => probe(task), { ok: false, reason: "unavailable" } as Probe<T>)

  const [balance, account, configs, endpoints, failed, domains, recent] = await Promise.all([
    run("balance", () => reader.get("/v1/balance", {}, { fresh })),
    run("account", () => reader.get<Row>("/v1/account", {}, { fresh })),
    run(
      "payment_method_configurations",
      async () => (await reader.list<Row>("/v1/payment_method_configurations", {}, { fresh, max: 100 })).data
    ),
    run(
      "webhook_endpoints",
      async () => (await reader.list<Row>("/v1/webhook_endpoints", {}, { fresh, max: 100 })).data
    ),
    run(
      "events",
      async () =>
        (await reader.list<Row>("/v1/events", { delivery_success: false, created: { gte: day } }, { fresh, max: 100 }))
          .data.length
    ),
    opts.storefrontDomains.length
      ? run(
          "payment_method_domains",
          async () => (await reader.list<Row>("/v1/payment_method_domains", {}, { fresh, max: 100 })).data
        )
      : Promise.resolve(null),
    run(
      "payment_intents",
      async () => (await reader.get<{ data: Row[] }>("/v1/payment_intents", { limit: 20 }, { fresh })).data
    ),
  ])

  results.push(checkKey(info, balance))
  // With an invalid key every other Stripe check would only repeat that error.
  if (!balance.ok && balance.reason === "invalid_key") {
    results.push(mode)
    return { partial: budget.partial, missed: [...budget.missed], checks: results }
  }
  results.push(
    checkAccount(account),
    checkPaymentMethods(configs),
    checkWebhook(url, endpoints, failed),
    checkDomains(opts.storefrontDomains, domains),
    checkCapture(providerCaptureOption(configModule, opts.providerId), recent),
    mode
  )
  return { partial: budget.partial, missed: [...budget.missed], checks: results }
}
