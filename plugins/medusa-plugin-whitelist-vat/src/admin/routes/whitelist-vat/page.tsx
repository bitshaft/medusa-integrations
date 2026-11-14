import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, ShieldCheck } from "@medusajs/icons"
import { Button, Container, Heading, Skeleton, Tabs, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Lookup } from "../../components/whitelist-vat/lookup"
import { Overview } from "../../components/whitelist-vat/overview"
import { Settings } from "../../components/whitelist-vat/settings"
import { useWhitelistVatStatus } from "../../lib/whitelist-vat/api"
import { navIcon } from "../../lib/whitelist-vat/kit/nav-icon"

const TABS = ["overview", "lookup", "settings"] as const
type Tab = (typeof TABS)[number]

/**
 * The plugin's page under Extensions: an overview of the businesses
 * verified so far with the full history, manual lookups, and the registers
 * and options in use.
 */
const WhitelistVatPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useWhitelistVatStatus()
  const [tab, setTab] = useState<Tab>("overview")
  const s = status.data

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between gap-x-4 px-6 py-4">
          <div>
            <Heading>{t("whitelist-vat.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("whitelist-vat.description")}
            </Text>
          </div>
          <Button
            size="small"
            variant="secondary"
            isLoading={status.isFetching}
            onClick={() => queryClient.invalidateQueries({ queryKey: ["whitelist-vat"] })}
          >
            <ArrowPath />
            {t("whitelist-vat.refresh")}
          </Button>
        </div>

        {s?.enabled && (
          <div className="px-6 py-3">
            <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
              <Tabs.List>
                {TABS.map((value) => (
                  <Tabs.Trigger key={value} value={value}>
                    {t(`whitelist-vat.tabs.${value}`)}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Tabs>
          </div>
        )}

        {status.isLoading && (
          <div className="px-6 py-4">
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {status.isError && (
          <Text size="small" className="text-ui-fg-error px-6 py-4">
            {t("whitelist-vat.loadError")}
          </Text>
        )}
        {s && !s.enabled && (
          <div className="px-6 py-4">
            <Text size="small" weight="plus">
              {t("whitelist-vat.disabled.title")}
            </Text>
            <Text size="small" className="text-ui-fg-error">
              {s.disabled_reason}
            </Text>
            <Text size="small" className="text-ui-fg-subtle mt-1">
              {t("whitelist-vat.disabled.hint")}
            </Text>
          </div>
        )}
      </Container>

      {s?.enabled && tab === "overview" && <Overview status={s} />}
      {s?.enabled && tab === "lookup" && <Lookup bankAccounts={s.registers.mf.enabled} />}
      {s?.enabled && tab === "settings" && <Settings status={s} />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "VAT white list",
  icon: navIcon(ShieldCheck, "#16a34a"),
})

export default WhitelistVatPage
