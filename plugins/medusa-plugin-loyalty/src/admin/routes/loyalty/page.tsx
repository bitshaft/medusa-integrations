import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BookOpen, ChartBar, CogSixTooth, Gift, Star, Users } from "@medusajs/icons"
import { Badge, Container } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { Customers } from "../../components/loyalty/customers"
import { Dashboard } from "../../components/loyalty/dashboard"
import { DemoBar, ResetDemoButton } from "../../components/loyalty/demo-bar"
import { Guide } from "../../components/loyalty/guide"
import { Rewards } from "../../components/loyalty/rewards"
import { Settings } from "../../components/loyalty/settings"
import { useSettings } from "../../lib/loyalty/api"
import { navIcon } from "../../lib/loyalty/kit/nav-icon"
import {
  DisabledNotice,
  LoadingBlock,
  OptionsCard,
  PageHeader,
  PageTabs,
  useTabParam,
} from "../../lib/loyalty/kit/page"
import { PageIcon, TabTrigger } from "../../lib/loyalty/kit/ui"

const BRAND_COLOR = "#d97706"

const TABS = ["panel", "rewards", "customers", "settings", "guide"] as const

/** The "Loyalty" page in the main menu. */
const LoyaltyPage = () => {
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
          icon={<PageIcon icon={Star} color={BRAND_COLOR} />}
          title={t("loyalty.title")}
          description={t("loyalty.description")}
          state={!s ? null : !s.enabled ? "off" : demo ? "demo" : "on"}
          // The program has its own switch in Settings: say when it is off.
          actions={
            s?.enabled && !s.settings.enabled ? (
              <Badge size="2xsmall" color="orange">
                {t("loyalty.programOff")}
              </Badge>
            ) : null
          }
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["loyalty"] })}
          refreshing={status.isFetching}
        />
        <PageTabs value={tab} onChange={setTab} actions={demo && <ResetDemoButton />}>
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
        </PageTabs>
        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("loyalty.disabled.hint")} />}
      </Container>

      {s?.enabled && tab === "panel" && <Dashboard />}
      {s?.enabled && tab === "rewards" && <Rewards tiers={s.settings.tiers.levels} currencyCode={s.currency_code} />}
      {s?.enabled && tab === "customers" && <Customers />}
      {s?.enabled && tab === "settings" && (
        <>
          <Settings settings={s.settings} defaults={s.defaults} storeCurrencies={s.store_currencies} />
          <OptionsCard
            version={s.version}
            rows={[
              ["timeZone", s.options.timeZone],
              ["defaultLocale", s.options.defaultLocale],
              ["demo", s.options.demo],
            ]}
          />
        </>
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
