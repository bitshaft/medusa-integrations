import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { ArrowDownTray } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Skeleton, StatusBadge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { DemoBar, RequestStatusBadge } from "../components/compliance/shared"
import { exportUrl, useCustomerCompliance } from "../lib/compliance/api"
import { shortDate } from "../lib/compliance/format"

/** Consents, data subject requests and a data export on the customer page. */
const CustomerComplianceWidget = ({ data: customer }: DetailWidgetProps<AdminCustomer>) => {
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useCustomerCompliance(customer.id)
  if (!isLoading && !data?.enabled) return null
  const lang = i18n.language
  return (
    <Container className="flex flex-col gap-y-4 p-6">
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
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "customer.details.after" })

export default CustomerComplianceWidget
