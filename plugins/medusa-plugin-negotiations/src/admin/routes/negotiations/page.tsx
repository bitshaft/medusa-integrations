import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BookOpen, ChartBar, ChatBubbleLeftRight, CogSixTooth } from "@medusajs/icons"
import { Container } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { Dashboard } from "../../components/negotiations/dashboard"
import { Guide } from "../../components/negotiations/guide"
import { Settings } from "../../components/negotiations/settings"
import { DemoBar, ResetDemoButton, TabTrigger } from "../../components/negotiations/shared"
import { keys, useSettings } from "../../lib/negotiations/api"
import { navIcon } from "../../lib/negotiations/kit/nav-icon"
import { DisabledNotice, LoadingBlock, PageHeader, PageTabs, useTabParam } from "../../lib/negotiations/kit/page"
import { PageIcon } from "../../lib/negotiations/kit/ui"

const BRAND_COLOR = "#0891b2"

const TABS = ["panel", "settings", "guide"] as const

/** "Negotiations" in the main menu: the dashboard and thread list, the settings and the rollout guide. */
const NegotiationsPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useSettings()
  const [tab, setTab] = useTabParam(TABS)
  const s = status.data
  const demo = Boolean(s?.enabled && s.options.demo)
  return (
    <div className="flex flex-col gap-y-3">
      {demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <PageHeader
          icon={<PageIcon icon={ChatBubbleLeftRight} color={BRAND_COLOR} />}
          title={t("negotiations.title")}
          description={t("negotiations.description")}
          state={!s ? null : !s.enabled ? "off" : demo ? "demo" : "on"}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: keys.all })}
          refreshing={status.isFetching}
        />
        <PageTabs value={tab} onChange={setTab} actions={demo && <ResetDemoButton />}>
          <TabTrigger value="panel" icon={ChartBar} color="#0891b2">
            {t("negotiations.tabs.panel")}
          </TabTrigger>
          <TabTrigger value="settings" icon={CogSixTooth} color="#64748b">
            {t("negotiations.tabs.settings")}
          </TabTrigger>
          <TabTrigger value="guide" icon={BookOpen} color="#db2777">
            {t("negotiations.tabs.guide")}
          </TabTrigger>
        </PageTabs>
        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("negotiations.disabled.hint")} />}
      </Container>
      {s?.enabled && tab === "panel" && <Dashboard />}
      {s?.enabled && tab === "settings" && <Settings data={s} />}
      {tab === "guide" && <Guide />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "negotiations.title",
  translationNs: "translation",
  icon: navIcon(ChatBubbleLeftRight, BRAND_COLOR),
})

export default NegotiationsPage
