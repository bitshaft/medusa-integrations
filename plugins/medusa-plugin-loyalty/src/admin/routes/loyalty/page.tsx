import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, BookOpen, ChartBar, CogSixTooth, Gift, Star, Users } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Skeleton, Tabs, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Customers } from "../../components/loyalty/customers"
import { Dashboard } from "../../components/loyalty/dashboard"
import { Guide } from "../../components/loyalty/guide"
import { Rewards } from "../../components/loyalty/rewards"
import { Settings } from "../../components/loyalty/settings"
import { useSettings } from "../../lib/loyalty/api"

type Tab = "panel" | "rewards" | "customers" | "settings" | "guide"

/** The "Loyalty program" page under Extensions. */
const LoyaltyPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useSettings()
  const [tab, setTab] = useState<Tab>("panel")
  const s = status.data

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-x-3">
            <Star />
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
              <Tabs.Trigger value="panel">
                <ChartBar />
                {t("loyalty.tabs.panel")}
              </Tabs.Trigger>
              <Tabs.Trigger value="rewards">
                <Gift />
                {t("loyalty.tabs.rewards")}
              </Tabs.Trigger>
              <Tabs.Trigger value="customers">
                <Users />
                {t("loyalty.tabs.customers")}
              </Tabs.Trigger>
              <Tabs.Trigger value="settings">
                <CogSixTooth />
                {t("loyalty.tabs.settings")}
              </Tabs.Trigger>
              <Tabs.Trigger value="guide">
                <BookOpen />
                {t("loyalty.tabs.guide")}
              </Tabs.Trigger>
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
      {s?.enabled && tab === "rewards" && (
        <Rewards tiers={s.settings.tiers.levels} currencyCode={s.settings.currency_code} />
      )}
      {s?.enabled && tab === "customers" && <Customers />}
      {s?.enabled && tab === "settings" && <Settings settings={s.settings} defaults={s.defaults} />}
      {tab === "guide" && <Guide />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "loyalty.title",
  translationNs: "translation",
  icon: Star,
})

export default LoyaltyPage
