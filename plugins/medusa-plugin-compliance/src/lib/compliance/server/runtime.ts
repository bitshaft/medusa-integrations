import type { IEventBusModuleService, Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { COMPLIANCE_MODULE } from "../../../modules/compliance"
import type ComplianceModuleService from "../../../modules/compliance/service"
import type { ModuleKey } from "../settings"

export function resolveCompliance(container: MedusaContainer): ComplianceModuleService {
  return container.resolve<ComplianceModuleService>(COMPLIANCE_MODULE)
}

export function logger(container: MedusaContainer): Logger {
  return container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
}

type GraphResult = { data: Array<Record<string, any>>; metadata?: { count?: number } }

/** `query.graph`, typed loosely: the plugin reads fields across modules and links. */
export function graph(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as {
    graph: (config: Record<string, unknown>) => Promise<GraphResult>
  }
  return (config: Record<string, unknown>) => query.graph(config)
}

/** Events other plugins listen to. Payloads are documented in the README. */
export const ComplianceEvents = {
  CONSENT_GRANTED: "compliance.consent_granted",
  CONSENT_WITHDRAWN: "compliance.consent_withdrawn",
  REQUEST_VERIFICATION: "compliance.request_verification",
  REQUEST_OPENED: "compliance.request_opened",
  REQUEST_DUE_SOON: "compliance.request_due_soon",
  REQUEST_CLOSED: "compliance.request_closed",
  CUSTOMER_ANONYMIZED: "compliance.customer_anonymized",
} as const

export async function emit(container: MedusaContainer, name: string, data: Record<string, unknown>) {
  await container.resolve<IEventBusModuleService>(Modules.EVENT_BUS).emit({ name, data })
}

/** A module (GPSR, GDPR, Omnibus) is switched on and the plugin options are valid. */
export async function moduleOn(container: MedusaContainer, key: ModuleKey): Promise<boolean> {
  const service = resolveCompliance(container)
  return (await service.isEnabled()) && (await service.getSettings()).modules[key]
}

/** Reads every row of a `query.graph` entity in pages. */
export async function graphAll(
  container: MedusaContainer,
  config: Record<string, unknown>,
  pageSize = 500
): Promise<Array<Record<string, any>>> {
  const rows: Array<Record<string, any>> = []
  for (let skip = 0; ; skip += pageSize) {
    const { data } = await graph(container)({ ...config, pagination: { skip, take: pageSize } })
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}
