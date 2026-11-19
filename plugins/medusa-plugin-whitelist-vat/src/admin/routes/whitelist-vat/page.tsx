import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BookOpen, ChartBar, CogSixTooth, MagnifyingGlass, ShieldCheck } from "@medusajs/icons"
import { Container, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { Guide } from "../../components/whitelist-vat/guide"
import { Lookup } from "../../components/whitelist-vat/lookup"
import { Overview } from "../../components/whitelist-vat/overview"
import { Settings } from "../../components/whitelist-vat/settings"
import { DemoBar } from "../../components/whitelist-vat/shared"
import { useWhitelistVatStatus } from "../../lib/whitelist-vat/api"
import { navIcon } from "../../lib/whitelist-vat/kit/nav-icon"
import { DisabledNotice, LoadingBlock, PageHeader, PageTabs, useTabParam } from "../../lib/whitelist-vat/kit/page"
import { PageIcon, TabTrigger } from "../../lib/whitelist-vat/kit/ui"

const BRAND_COLOR = "#16a34a"
const TAB_ICONS = {
  panel: { icon: ChartBar, color: "#2563eb" },
  lookup: { icon: MagnifyingGlass, color: "#ea580c" },
  settings: { icon: CogSixTooth, color: "#64748b" },
  guide: { icon: BookOpen, color: "#db2777" },
} as const

const TABS = ["panel", "lookup", "settings", "guide"] as const

/**
 * The plugin's page under Extensions: an overview of the businesses
 * verified so far with the full history, manual lookups, the registers and
 * options in use, and the guide.
 */
const WhitelistVatPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useWhitelistVatStatus()
  const [tab, setTab] = useTabParam(TABS)
  const s = status.data
  const demo = Boolean(s?.enabled && s.demo)

  return (
    <div className="flex flex-col gap-y-3">
      {demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <PageHeader
          icon={<PageIcon icon={ShieldCheck} color={BRAND_COLOR} />}
          title={t("whitelist-vat.title")}
          description={t("whitelist-vat.description")}
          state={!s ? null : !s.enabled ? "off" : demo ? "demo" : "on"}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["whitelist-vat"] })}
          refreshing={status.isFetching}
        />
        <PageTabs value={tab} onChange={setTab}>
          {TABS.map((value) => (
            <TabTrigger key={value} value={value} icon={TAB_ICONS[value].icon} color={TAB_ICONS[value].color}>
              {t(`whitelist-vat.tabs.${value}`)}
            </TabTrigger>
          ))}
        </PageTabs>
        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {status.isError && (
          <Text size="small" className="text-ui-fg-error px-6 py-4">
            {t("whitelist-vat.loadError")}
          </Text>
        )}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("whitelist-vat.disabled.hint")} />}
      </Container>

      {s?.enabled && tab === "panel" && <Overview status={s} />}
      {s?.enabled && tab === "lookup" && <Lookup bankAccounts={s.registers.mf.enabled} />}
      {s?.enabled && tab === "settings" && <Settings status={s} />}
      {tab === "guide" && <Guide />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "whitelist-vat.title",
  translationNs: "translation",
  icon: navIcon(ShieldCheck, BRAND_COLOR),
})

export default WhitelistVatPage
