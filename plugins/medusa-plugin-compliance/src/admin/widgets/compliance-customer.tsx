import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { ArrowDownTray, DocumentText } from "@medusajs/icons"
import { Badge, Button, Heading, Skeleton, StatusBadge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { DemoBar, RequestStatusBadge } from "../components/compliance/shared"
import { exportUrl, useCustomerCompliance } from "../lib/compliance/api"
import { shortDate } from "../lib/compliance/format"
import {
  claimZone,
  DETAIL_ZONES,
  DetailIntegrations,
  type EntityLike,
  type Level,
  registerTab,
} from "../lib/compliance/kit/integrations"

registerTab("customer", {
  id: "compliance",
  brand: { label: "compliance.title", icon: DocumentText, color: "#0d9488" },
  order: 10,
  useState: (customer) => {
    const { data, isLoading } = useCustomerCompliance(customer.id)
    if (!data?.enabled) return { visible: false, level: "none", loading: isLoading }
    // A data subject request still to handle orange; anonymised grey; otherwise green.
    const open = data.requests.some((r) => ["unverified", "open", "accepted"].includes(r.status))
    const level: Level = open ? "warn" : data.anonymized ? "none" : "ok"
    return { visible: true, level }
  },
  Panel: ({ entity }) => <CompliancePanel customerId={entity.id} />,
})
claimZone(DETAIL_ZONES.customer, "compliance")

/** The Integrations card at the top of the customer page (rendered by one plugin for all of them). */
const CustomerComplianceWidget = ({ data: customer }: DetailWidgetProps<AdminCustomer>) => (
  <DetailIntegrations page="customer" owner="compliance" entity={customer as unknown as EntityLike} />
)

/** Consents, data subject requests and a data export of the customer. */
const CompliancePanel = ({ customerId }: { customerId: string }) => {
  const customer = { id: customerId }
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useCustomerCompliance(customer.id)
  if (!isLoading && !data?.enabled) return null
  const lang = i18n.language
  return (
    <div className="flex flex-col gap-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Heading level="h2">{t("compliance.customer.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("compliance.customer.hint")}
          </Text>
        </div>
        {data && !data.demo && (
          <Button size="small" variant="secondary" asChild>
            <a href={exportUrl("customers", customer.id, "zip")} download>
              <ArrowDownTray />
              {t("compliance.customer.export")}
            </a>
          </Button>
        )}
      </div>
      {data?.demo && <DemoBar />}
      {isLoading || !data ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          {data.anonymized && (
            <Badge color="red" className="w-fit">
              {t("compliance.customer.anonymized", { date: shortDate(data.anonymized.created_at, lang) })}
            </Badge>
          )}
          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              {t("compliance.customer.consents")}
            </Text>
            {!data.consents.length ? (
              <Text size="small" className="text-ui-fg-subtle">
                {t("compliance.customer.noConsentTypes")}
              </Text>
            ) : (
              data.consents.map((c) => (
                <div key={c.type_key} className="flex flex-wrap items-center gap-2">
                  <Text size="small" className="min-w-[160px] font-mono">
                    {c.type_key}
                  </Text>
                  <StatusBadge color={c.granted ? "green" : "grey"}>
                    {c.granted
                      ? t("compliance.gdpr.granted")
                      : c.at
                        ? t("compliance.gdpr.withdrawn")
                        : t("compliance.customer.never")}
                  </StatusBadge>
                  {c.version && (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      v{c.version} · {shortDate(c.at, lang)}
                    </Text>
                  )}
                  {c.outdated && (
                    <Badge size="2xsmall" color="orange">
                      {t("compliance.customer.outdated", { version: c.latest_version })}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              {t("compliance.customer.requests")}
            </Text>
            {!data.requests.length ? (
              <Text size="small" className="text-ui-fg-subtle">
                {t("compliance.customer.noRequests")}
              </Text>
            ) : (
              data.requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2">
                  <Text size="small">{t(`compliance.gdpr.types.${r.type}`)}</Text>
                  <RequestStatusBadge status={r.status} />
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {shortDate(r.created_at, lang)}
                  </Text>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-customer-details",
})

export default CustomerComplianceWidget
