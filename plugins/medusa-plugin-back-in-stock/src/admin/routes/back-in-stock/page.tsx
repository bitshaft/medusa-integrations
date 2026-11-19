import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BellAlert, BookOpen } from "@medusajs/icons"
import { Container, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { DemoBar, ResetDemoButton } from "../../components/back-in-stock/demo-bar"
import { Guide } from "../../components/back-in-stock/guide"
import { History } from "../../components/back-in-stock/history"
import { Settings } from "../../components/back-in-stock/settings"
import { Subscriptions } from "../../components/back-in-stock/subscriptions"
import { Wanted } from "../../components/back-in-stock/wanted"
import { useBackInStockStatus } from "../../lib/back-in-stock/api"
import { navIcon } from "../../lib/back-in-stock/kit/nav-icon"
import { DisabledNotice, LoadingBlock, PageHeader, PageTabs, useTabParam } from "../../lib/back-in-stock/kit/page"
import { PageIcon, TabTrigger } from "../../lib/back-in-stock/kit/ui"
import { CogSixTooth, ClockSolid, Heart, Users } from "@medusajs/icons"

const BRAND_COLOR = "#7c3aed"
const TAB_ICONS = {
  wanted: { icon: Heart, color: "#db2777" },
  subscriptions: { icon: Users, color: "#2563eb" },
  history: { icon: ClockSolid, color: "#ea580c" },
  settings: { icon: CogSixTooth, color: "#64748b" },
  guide: { icon: BookOpen, color: "#db2777" },
} as const

const TABS = ["wanted", "subscriptions", "history", "settings", "guide"] as const

/** The plugin's page under Extensions. */
const BackInStockPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useBackInStockStatus()
  const [tab, setTab] = useTabParam(TABS)
  const s = status.data
  const demo = Boolean(s?.enabled && s.demo)

  return (
    <div className="flex flex-col gap-y-3">
      {demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <PageHeader
          icon={<PageIcon icon={BellAlert} color={BRAND_COLOR} />}
          title={t("back-in-stock.title")}
          description={t("back-in-stock.description")}
          state={!s ? null : !s.enabled ? "off" : demo ? "demo" : "on"}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["back-in-stock"] })}
          refreshing={status.isFetching}
        />

        {s?.enabled && (
          <PageTabs value={tab} onChange={setTab} actions={demo && <ResetDemoButton />}>
            {TABS.map((value) => (
              <TabTrigger key={value} value={value} icon={TAB_ICONS[value].icon} color={TAB_ICONS[value].color}>
                {t(`back-in-stock.tabs.${value}`)}
              </TabTrigger>
            ))}
          </PageTabs>
        )}

        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {status.isError && (
          <Text size="small" className="text-ui-fg-error px-6 py-4">
            {t("back-in-stock.loadError")}
          </Text>
        )}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("back-in-stock.disabled.hint")} />}
      </Container>

      {s?.enabled && tab === "wanted" && <Wanted counts={s.counts} />}
      {s?.enabled && tab === "subscriptions" && <Subscriptions />}
      {s?.enabled && tab === "history" && <History />}
      {s?.enabled && tab === "settings" && <Settings status={s} />}
      {tab === "guide" && <Guide />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "back-in-stock.title",
  translationNs: "translation",
  icon: navIcon(BellAlert, BRAND_COLOR),
})

export default BackInStockPage
