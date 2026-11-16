import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, BellAlert } from "@medusajs/icons"
import { Button, Container, Heading, Skeleton, Tabs, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { History } from "../../components/back-in-stock/history"
import { Settings } from "../../components/back-in-stock/settings"
import { Subscriptions } from "../../components/back-in-stock/subscriptions"
import { Wanted } from "../../components/back-in-stock/wanted"
import { useBackInStockStatus } from "../../lib/back-in-stock/api"
import { navIcon } from "../../lib/back-in-stock/kit/nav-icon"
import { PageIcon, TabTrigger } from "../../lib/back-in-stock/kit/ui"
import { CogSixTooth, ClockSolid, Heart, Users } from "@medusajs/icons"

const BRAND_COLOR = "#7c3aed"
const TAB_ICONS = {
  wanted: { icon: Heart, color: "#db2777" },
  subscriptions: { icon: Users, color: "#2563eb" },
  history: { icon: ClockSolid, color: "#ea580c" },
  settings: { icon: CogSixTooth, color: "#64748b" },
} as const

const TABS = ["wanted", "subscriptions", "history", "settings"] as const
type Tab = (typeof TABS)[number]

/** The plugin's page under Extensions. */
const BackInStockPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useBackInStockStatus()
  const [tab, setTab] = useState<Tab>("wanted")
  const s = status.data

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="overflow-hidden divide-y p-0">
        <div className="flex items-center justify-between gap-x-4 px-6 py-4">
          <div className="flex items-center gap-x-3">
            <PageIcon icon={BellAlert} color={BRAND_COLOR} />
            <div>
              <Heading>{t("back-in-stock.title")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("back-in-stock.description")}
              </Text>
            </div>
          </div>
          <Button
            size="small"
            variant="secondary"
            isLoading={status.isFetching}
            onClick={() => queryClient.invalidateQueries({ queryKey: ["back-in-stock"] })}
          >
            <ArrowPath />
            {t("back-in-stock.refresh")}
          </Button>
        </div>

        {s?.enabled && s.demo && (
          <Text size="small" className="text-ui-fg-interactive px-6 py-3">
            {t("back-in-stock.demoMode")}
          </Text>
        )}

        {s?.enabled && (
          <div className="grid grid-cols-2 gap-px md:grid-cols-4">
            {(["active", "pending", "ended", "pending_checks"] as const).map((key) => (
              <div key={key} className="px-6 py-3">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {t(`back-in-stock.tiles.${key}`)}
                </Text>
                <Text size="xlarge" weight="plus">
                  {s.counts[key]}
                </Text>
              </div>
            ))}
          </div>
        )}

        {s?.enabled && (
          <div className="px-6 py-3">
            <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
              <Tabs.List>
                {TABS.map((value) => (
                  <TabTrigger key={value} value={value} icon={TAB_ICONS[value].icon} color={TAB_ICONS[value].color}>
                    {t(`back-in-stock.tabs.${value}`)}
                  </TabTrigger>
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
            {t("back-in-stock.loadError")}
          </Text>
        )}
        {s && !s.enabled && (
          <div className="px-6 py-4">
            <Text size="small" weight="plus">
              {t("back-in-stock.disabled.title")}
            </Text>
            <Text size="small" className="text-ui-fg-error">
              {s.disabled_reason}
            </Text>
            <Text size="small" className="text-ui-fg-subtle mt-1">
              {t("back-in-stock.disabled.hint")}
            </Text>
          </div>
        )}
      </Container>

      {s?.enabled && tab === "wanted" && <Wanted />}
      {s?.enabled && tab === "subscriptions" && <Subscriptions />}
      {s?.enabled && tab === "history" && <History />}
      {s?.enabled && tab === "settings" && <Settings status={s} />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "back-in-stock.title",
  translationNs: "translation",
  icon: navIcon(BellAlert, BRAND_COLOR),
})

export default BackInStockPage
