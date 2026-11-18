import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, BookOpen, ChartBar, ChatBubbleLeftRight, CogSixTooth } from "@medusajs/icons"
import { Button, Container, Heading, Skeleton, Tabs, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Dashboard } from "../../components/negotiations/dashboard"
import { Guide } from "../../components/negotiations/guide"
import { Settings } from "../../components/negotiations/settings"
import { DemoBar, TabTrigger } from "../../components/negotiations/shared"
import { keys, useSettings } from "../../lib/negotiations/api"
import { navIcon } from "../../lib/negotiations/kit/nav-icon"
import { PageIcon } from "../../lib/negotiations/kit/ui"

const BRAND_COLOR = "#0891b2"

type Tab = "panel" | "guide" | "settings"

/** "Negotiations" in the main menu: the dashboard and thread list, the rollout guide and the settings. */
const NegotiationsPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useSettings()
  const [tab, setTab] = useState<Tab>("panel")
  const s = status.data
  return (
    <div className="flex flex-col gap-y-3">
      {s?.options.demo && <DemoBar reset />}
      <Container className="overflow-hidden divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-x-3">
            <PageIcon icon={ChatBubbleLeftRight} color={BRAND_COLOR} />
            <div>
              <Heading>{t("negotiations.title")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("negotiations.description")}
              </Text>
            </div>
          </div>
          <Button
            size="small"
            variant="secondary"
            isLoading={status.isFetching}
            onClick={() => queryClient.invalidateQueries({ queryKey: keys.all })}
          >
            <ArrowPath />
            {t("negotiations.refresh")}
          </Button>
        </div>
        <div className="overflow-x-auto px-6 py-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <Tabs.List>
              <TabTrigger value="panel" icon={ChartBar} color="#0891b2">
                {t("negotiations.tabs.panel")}
              </TabTrigger>
              <TabTrigger value="guide" icon={BookOpen} color="#db2777">
                {t("negotiations.tabs.guide")}
              </TabTrigger>
              <TabTrigger value="settings" icon={CogSixTooth} color="#64748b">
                {t("negotiations.tabs.settings")}
              </TabTrigger>
            </Tabs.List>
          </Tabs>
        </div>
        {status.isLoading && <Skeleton className="m-6 h-10" />}
        {s && !s.enabled && (
          <div className="px-6 py-4">
            <Text size="small" weight="plus" className="text-ui-fg-error">
              {t("negotiations.disabled.title", { reason: s.disabled_reason })}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {t("negotiations.disabled.hint")}
            </Text>
          </div>
        )}
      </Container>
      {s?.enabled && tab === "panel" && <Dashboard />}
      {tab === "guide" && <Guide />}
      {s?.enabled && tab === "settings" && <Settings data={s} />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "negotiations.title",
  translationNs: "translation",
  icon: navIcon(ChatBubbleLeftRight, BRAND_COLOR),
})

export default NegotiationsPage
