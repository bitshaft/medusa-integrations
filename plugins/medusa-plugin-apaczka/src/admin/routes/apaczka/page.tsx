import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Tabs, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { DemoBar } from "../../components/apaczka/demo-bar"
import { SettingsPanel } from "../../components/apaczka/settings-panel"
import { ShipmentsList } from "../../components/apaczka/shipments-list"
import apaczkaLogo from "../../lib/apaczka/apaczka-logo.png"
import { NAV_TILE_STYLE } from "../../lib/apaczka/kit/nav-icon"
import { PageLogo, TabTrigger } from "../../lib/apaczka/kit/ui"
import { ArchiveBox, CogSixTooth } from "@medusajs/icons"

const TAB_ICONS = {
  shipments: { icon: ArchiveBox, color: "#ea580c" },
  settings: { icon: CogSixTooth, color: "#64748b" },
} as const

const TABS = ["shipments", "settings"] as const
type Tab = (typeof TABS)[number]

/**
 * The plugin's page in the main menu: every Apaczka shipment (labels,
 * tracking, courier pickups, hand-over protocols) and the integration
 * settings.
 */
const ApaczkaPage = () => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>("shipments")

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="flex flex-col gap-y-3">
      <DemoBar />
      <Container className="overflow-hidden p-0">
        <div className="flex items-center gap-x-3 px-6 py-4">
          <PageLogo src={apaczkaLogo} />
          <div>
            <Heading>{t("apaczka.page.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("apaczka.page.subtitle")}
            </Text>
          </div>
        </div>
        <div className="px-6 pb-4">
          <Tabs.List>
            {TABS.map((key) => (
              <TabTrigger key={key} value={key} icon={TAB_ICONS[key].icon} color={TAB_ICONS[key].color}>
                {t(`apaczka.page.tabs.${key}`)}
              </TabTrigger>
            ))}
          </Tabs.List>
        </div>
      </Container>

      <Tabs.Content value="shipments">
        <Container className="overflow-hidden p-0">
          <ShipmentsList />
        </Container>
      </Tabs.Content>
      <Tabs.Content value="settings">
        <SettingsPanel />
      </Tabs.Content>
    </Tabs>
  )
}

/** Sidebar icon: the Apaczka logo on a white tile covering the whole sidebar square. */
const ApaczkaNavIcon = () => (
  <span style={{ ...NAV_TILE_STYLE, backgroundColor: "#ffffff" }}>
    <img src={apaczkaLogo} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
  </span>
)

export const config = defineRouteConfig({
  label: "Apaczka",
  icon: ApaczkaNavIcon,
})

export default ApaczkaPage
