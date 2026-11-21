import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BookOpen, CogSixTooth, ListBullet, Tag } from "@medusajs/icons"
import { Container, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { AdvertsTab } from "../../components/olx/adverts-tab"
import { Guide } from "../../components/olx/guide"
import { SettingsTab } from "../../components/olx/settings-tab"
import { BRAND_COLOR } from "../../components/olx/shared"
import { keys, useDemoReset, useOlxStatus } from "../../lib/olx/api"
import { DemoBar, DemoResetButton } from "../../lib/olx/kit/demo"
import { navIcon } from "../../lib/olx/kit/nav-icon"
import { DisabledNotice, LoadingBlock, OptionsCard, PageHeader, PageTabs, useTabParam } from "../../lib/olx/kit/page"
import { PageIcon, TabTrigger } from "../../lib/olx/kit/ui"

const TAB_ICONS = {
  adverts: { icon: ListBullet, color: "#16a34a" },
  settings: { icon: CogSixTooth, color: "#64748b" },
  guide: { icon: BookOpen, color: "#db2777" },
} as const

const TABS = ["adverts", "settings", "guide"] as const

/** The "OLX" page in the main menu: adverts, account and defaults, guide. */
const OlxPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useOlxStatus()
  const reset = useDemoReset()
  const [tab, setTab] = useTabParam(TABS)
  const s = status.data
  const demo = Boolean(s?.enabled && s.demo)
  const canWrite = Boolean(s?.enabled && s.connection.connected && !s.connection.needs_reconnect)

  return (
    <div className="flex flex-col gap-y-3">
      {demo && <DemoBar>{t("olx.demoHint")}</DemoBar>}
      <Container className="overflow-hidden divide-y p-0">
        <PageHeader
          icon={<PageIcon icon={Tag} color={BRAND_COLOR} />}
          title={t("olx.title")}
          description={t("olx.description")}
          state={!s ? null : !s.enabled ? "off" : demo ? "demo" : "on"}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: keys.all })}
          refreshing={status.isFetching}
        />
        {s && (
          <PageTabs
            value={tab}
            onChange={setTab}
            actions={
              demo ? (
                <DemoResetButton
                  description={t("olx.demoReset")}
                  onReset={async () => t("olx.demoRemoved", { count: (await reset.mutateAsync()).removed })}
                />
              ) : undefined
            }
          >
            {TABS.filter((value) => s.enabled || value === "guide").map((value) => (
              <TabTrigger key={value} value={value} icon={TAB_ICONS[value].icon} color={TAB_ICONS[value].color}>
                {t(`olx.tabs.${value}`)}
              </TabTrigger>
            ))}
          </PageTabs>
        )}
        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {status.isError && (
          <Text size="small" className="text-ui-fg-error px-6 py-4">
            {t("olx.loadError")}
          </Text>
        )}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("olx.disabledHint")} />}
      </Container>

      {s?.enabled && tab === "adverts" && <AdvertsTab canWrite={canWrite} />}
      {s?.enabled && tab === "settings" && (
        <>
          <SettingsTab connection={s.connection} demo={demo} />
          <OptionsCard
            version={s.version}
            rows={[
              ["clientId", s.options.client_id],
              ["redirectUri", s.options.redirect_uri],
              ["adminUrl", s.options.admin_url],
              ["baseUrl", s.options.base_url],
              ["timeoutMs", s.options.timeout_ms],
              ["demo", s.options.demo],
            ]}
          />
        </>
      )}
      {s && (tab === "guide" || !s.enabled) && <Guide />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "olx.title",
  translationNs: "translation",
  icon: navIcon(Tag, BRAND_COLOR),
})

export default OlxPage
