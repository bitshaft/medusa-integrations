import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArchiveBox, BookOpen, CogSixTooth } from "@medusajs/icons"
import { Container } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { DemoBar } from "../../components/apaczka/demo-bar"
import { Guide } from "../../components/apaczka/guide"
import { SettingsPanel } from "../../components/apaczka/settings-panel"
import { ShipmentsList } from "../../components/apaczka/shipments-list"
import { useApaczkaStatus } from "../../lib/apaczka/api"
import apaczkaLogo from "../../lib/apaczka/apaczka-logo.png"
import { NavTile } from "../../lib/apaczka/kit/nav-icon"
import { DisabledNotice, LoadingBlock, PageHeader, PageTabs, useTabParam } from "../../lib/apaczka/kit/page"
import { PageLogo, TabTrigger } from "../../lib/apaczka/kit/ui"

const TAB_ICONS = {
  shipments: { icon: ArchiveBox, color: "#ea580c" },
  settings: { icon: CogSixTooth, color: "#64748b" },
  guide: { icon: BookOpen, color: "#db2777" },
} as const

const TABS = ["shipments", "settings", "guide"] as const

/**
 * The plugin's page in the main menu: every Apaczka shipment (labels,
 * tracking, courier pickups, hand-over protocols), the integration settings
 * and the guide.
 */
const ApaczkaPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useApaczkaStatus()
  const [tab, setTab] = useTabParam(TABS)
  const s = status.data
  const demo = Boolean(s?.enabled && s.demo)

  return (
    <div className="flex flex-col gap-y-3">
      <DemoBar />
      <Container className="overflow-hidden divide-y p-0">
        <PageHeader
          icon={<PageLogo src={apaczkaLogo} />}
          title={t("apaczka.page.title")}
          description={t("apaczka.page.subtitle")}
          state={!s ? null : !s.enabled ? "off" : demo ? "demo" : "on"}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["apaczka"] })}
          refreshing={status.isFetching}
        />
        <PageTabs value={tab} onChange={setTab}>
          {TABS.map((key) => (
            <TabTrigger key={key} value={key} icon={TAB_ICONS[key].icon} color={TAB_ICONS[key].color}>
              {t(`apaczka.page.tabs.${key}`)}
            </TabTrigger>
          ))}
        </PageTabs>
        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("apaczka.settings.disabledHint")} />}
      </Container>

      {s?.enabled && tab === "shipments" && (
        <Container className="overflow-hidden p-0">
          <ShipmentsList />
        </Container>
      )}
      {s?.enabled && tab === "settings" && <SettingsPanel />}
      {tab === "guide" && <Guide />}
    </div>
  )
}

/** Sidebar icon: the Apaczka logo on a white tile covering the whole sidebar square. */
const ApaczkaNavIcon = () => (
  <NavTile background="#ffffff">
    <img src={apaczkaLogo} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
  </NavTile>
)

export const config = defineRouteConfig({
  label: "Apaczka",
  icon: ApaczkaNavIcon,
})

export default ApaczkaPage
