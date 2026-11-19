import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, BookOpen, Cash, ClockSolid, CogSixTooth, Sparkles } from "@medusajs/icons"
import { Container, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { DemoBar } from "../../components/currency/demo-bar"
import { FillTab } from "../../components/currency/fill-tab"
import { Guide } from "../../components/currency/guide"
import { HistoryTab } from "../../components/currency/history-tab"
import { RatesTab } from "../../components/currency/rates-tab"
import { SettingsTab } from "../../components/currency/settings-tab"
import { BRAND_COLOR } from "../../components/currency/shared"
import { keys, useCurrencyStatus } from "../../lib/currency/api"
import { navIcon } from "../../lib/currency/kit/nav-icon"
import {
  DisabledNotice,
  LoadingBlock,
  OptionsCard,
  PageHeader,
  PageTabs,
  useTabParam,
} from "../../lib/currency/kit/page"
import { PageIcon, TabTrigger } from "../../lib/currency/kit/ui"

const TAB_ICONS = {
  fill: { icon: Sparkles, color: "#16a34a" },
  rates: { icon: ArrowPath, color: "#2563eb" },
  history: { icon: ClockSolid, color: "#ea580c" },
  settings: { icon: CogSixTooth, color: "#64748b" },
  guide: { icon: BookOpen, color: "#db2777" },
} as const

const TABS = ["fill", "rates", "history", "settings", "guide"] as const

/** The "Currencies" page in the main menu: fill prices, rates, history, settings. */
const CurrencyPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useCurrencyStatus()
  const [tab, setTab] = useTabParam(TABS)
  const s = status.data
  const demo = Boolean(s?.enabled && s.demo)

  return (
    <div className="flex flex-col gap-y-3">
      {demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <PageHeader
          icon={<PageIcon icon={Cash} color={BRAND_COLOR} />}
          title={t("currency.title")}
          description={t("currency.description")}
          state={!s ? null : !s.enabled ? "off" : demo ? "demo" : "on"}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: keys.all })}
          refreshing={status.isFetching}
        />
        {s?.enabled && (
          <PageTabs value={tab} onChange={setTab}>
            {TABS.map((value) => (
              <TabTrigger key={value} value={value} icon={TAB_ICONS[value].icon} color={TAB_ICONS[value].color}>
                {t(`currency.tabs.${value}`)}
              </TabTrigger>
            ))}
          </PageTabs>
        )}
        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {status.isError && (
          <Text size="small" className="text-ui-fg-error px-6 py-4">
            {t("currency.loadError")}
          </Text>
        )}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("currency.disabled.hint")} />}
      </Container>

      {s?.enabled && tab === "fill" && <FillTab demo={demo} />}
      {s?.enabled && tab === "rates" && <RatesTab />}
      {s?.enabled && tab === "history" && <HistoryTab />}
      {s?.enabled && tab === "settings" && (
        <>
          <SettingsTab />
          <OptionsCard
            version={s.version}
            rows={[
              ["provider", s.options.provider],
              ["nbp.baseUrl", s.options.nbp_base_url],
              ["nbp.timeoutMs", s.options.nbp_timeout_ms],
              ["maxVariants", s.options.max_variants],
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
  label: "currency.title",
  translationNs: "translation",
  icon: navIcon(Cash, BRAND_COLOR),
})

export default CurrencyPage
