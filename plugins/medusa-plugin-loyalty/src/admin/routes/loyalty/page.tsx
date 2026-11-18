import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, BookOpen, ChartBar, CogSixTooth, Gift, Star, Users } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Skeleton, Tabs, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Customers } from "../../components/loyalty/customers"
import { Dashboard } from "../../components/loyalty/dashboard"
import { DemoBar } from "../../components/loyalty/demo-bar"
import { Guide } from "../../components/loyalty/guide"
import { Rewards } from "../../components/loyalty/rewards"
import { Settings } from "../../components/loyalty/settings"
import { useSettings } from "../../lib/loyalty/api"
import { navIcon } from "../../lib/loyalty/kit/nav-icon"
import { PageIcon, TabTrigger } from "../../lib/loyalty/kit/ui"

const BRAND_COLOR = "#d97706"

type Tab = "panel" | "rewards" | "customers" | "settings" | "guide"

/** The "Loyalty" page in the main menu. */
const LoyaltyPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useSettings()
  const [tab, setTab] = useState<Tab>("panel")
  const s = status.data

  return (
    <div className="flex flex-col gap-y-3">
      {s?.enabled && s.options.demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-x-3">
            <PageIcon icon={Star} color={BRAND_COLOR} />
            <div>
              <div className="flex items-center gap-x-2">
                <Heading>{t("loyalty.title")}</Heading>
                {s?.enabled && (
                  <Badge size="2xsmall" color={s.settings.enabled ? "green" : "orange"}>
                    {s.settings.enabled ? t("loyalty.programOn") : t("loyalty.programOff")}
                  </Badge>
                )}
              </div>
              <Text size="small" className="text-ui-fg-subtle">
                {t("loyalty.description")}
              </Text>
            </div>
          </div>
          <Button
            size="small"
            variant="secondary"
            isLoading={status.isFetching}
            onClick={() => queryClient.invalidateQueries({ queryKey: ["loyalty"] })}
          >
            <ArrowPath />
            {t("loyalty.refresh")}
          </Button>
        </div>
        <div className="px-6 py-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <Tabs.List>
              <TabTrigger value="panel" icon={ChartBar} color="#2563eb">
                {t("loyalty.tabs.panel")}
              </TabTrigger>
              <TabTrigger value="rewards" icon={Gift} color="#ea580c">
                {t("loyalty.tabs.rewards")}
              </TabTrigger>
              <TabTrigger value="customers" icon={Users} color="#7c3aed">
                {t("loyalty.tabs.customers")}
              </TabTrigger>
              <TabTrigger value="settings" icon={CogSixTooth} color="#64748b">
                {t("loyalty.tabs.settings")}
              </TabTrigger>
              <TabTrigger value="guide" icon={BookOpen} color="#db2777">
                {t("loyalty.tabs.guide")}
              </TabTrigger>
            </Tabs.List>
          </Tabs>
        </div>
        {status.isLoading && <Skeleton className="m-6 h-10" />}
        {s && !s.enabled && (
          <div className="px-6 py-4">
            <Text size="small" weight="plus" className="text-ui-fg-error">
              {t("loyalty.disabled.title", { reason: s.disabled_reason })}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {t("loyalty.disabled.hint")}
            </Text>
          </div>
        )}
      </Container>

      {s?.enabled && tab === "panel" && <Dashboard />}
      {s?.enabled && tab === "rewards" && <Rewards tiers={s.settings.tiers.levels} currencyCode={s.currency_code} />}
      {s?.enabled && tab === "customers" && <Customers />}
      {s?.enabled && tab === "settings" && (
        <Settings settings={s.settings} defaults={s.defaults} storeCurrencies={s.store_currencies} />
      )}
      {tab === "guide" && <Guide />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "loyalty.title",
  translationNs: "translation",
  icon: navIcon(Star, BRAND_COLOR),
})

export default LoyaltyPage
