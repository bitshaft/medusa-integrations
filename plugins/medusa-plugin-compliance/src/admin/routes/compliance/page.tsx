import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BookOpen, ChartBar, CogSixTooth, CurrencyDollar, DocumentText, Tag, User } from "@medusajs/icons"
import { Button, Container, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { Dashboard } from "../../components/compliance/dashboard"
import { Gdpr } from "../../components/compliance/gdpr"
import { Gpsr } from "../../components/compliance/gpsr"
import { Guide } from "../../components/compliance/guide"
import { Omnibus } from "../../components/compliance/omnibus"
import { Settings } from "../../components/compliance/settings"
import { DemoBar, TabTrigger } from "../../components/compliance/shared"
import { keys, useSettings } from "../../lib/compliance/api"
import { navIcon } from "../../lib/compliance/kit/nav-icon"
import {
  DisabledNotice,
  LoadingBlock,
  OptionsCard,
  PageHeader,
  PageTabs,
  useTabParam,
} from "../../lib/compliance/kit/page"
import { PageIcon } from "../../lib/compliance/kit/ui"

const BRAND_COLOR = "#0d9488"

const TABS = ["panel", "gpsr", "gdpr", "omnibus", "settings", "guide"] as const

/** The "Compliance" page in the main menu: GPSR, GDPR and Omnibus in one place. */
const CompliancePage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useSettings()
  // The tab is kept in the URL (`?tab=gpsr`), so other pages can link straight to it.
  const [tab, setTab] = useTabParam(TABS)
  const s = status.data
  const demo = Boolean(s?.settings.demo)

  return (
    <div className="flex flex-col gap-y-3">
      {demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <PageHeader
          icon={<PageIcon icon={DocumentText} color={BRAND_COLOR} />}
          title={t("compliance.title")}
          description={t("compliance.description")}
          state={!s ? null : !s.enabled ? "off" : demo ? "demo" : "on"}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: keys.all })}
          refreshing={status.isFetching}
        />
        <PageTabs value={tab} onChange={setTab}>
          <TabTrigger value="panel" icon={ChartBar} color="#2563eb">
            {t("compliance.tabs.panel")}
          </TabTrigger>
          <TabTrigger value="gpsr" icon={Tag} color="#ea580c">
            {t("compliance.tabs.gpsr")}
          </TabTrigger>
          <TabTrigger value="gdpr" icon={User} color="#7c3aed">
            {t("compliance.tabs.gdpr")}
          </TabTrigger>
          <TabTrigger value="omnibus" icon={CurrencyDollar} color="#16a34a">
            {t("compliance.tabs.omnibus")}
          </TabTrigger>
          <TabTrigger value="settings" icon={CogSixTooth} color="#64748b">
            {t("compliance.tabs.settings")}
          </TabTrigger>
          <TabTrigger value="guide" icon={BookOpen} color="#db2777">
            {t("compliance.tabs.guide")}
          </TabTrigger>
        </PageTabs>
        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("compliance.disabled.hint")} />}
      </Container>

      {s?.enabled && tab === "panel" && <Dashboard onOpen={setTab} />}
      {s?.enabled &&
        tab === "gpsr" &&
        (s.settings.modules.gpsr ? <Gpsr demo={demo} /> : <ModuleOff onOpen={() => setTab("settings")} />)}
      {s?.enabled &&
        tab === "gdpr" &&
        (s.settings.modules.gdpr ? (
          <Gdpr
            demo={demo}
            warnDays={s.settings.gdpr.warn_days}
            placeholder={s.lawyer_placeholder}
            languages={s.store_languages}
          />
        ) : (
          <ModuleOff onOpen={() => setTab("settings")} />
        ))}
      {s?.enabled &&
        tab === "omnibus" &&
        (s.settings.modules.omnibus ? <Omnibus demo={demo} /> : <ModuleOff onOpen={() => setTab("settings")} />)}
      {s?.enabled && tab === "settings" && (
        <>
          <Settings data={s} />
          <OptionsCard
            version={s.version}
            rows={[
              ["timeZone", s.options.timeZone],
              ["defaultLocale", s.options.defaultLocale],
              ["dataProviders", s.options.dataProviders],
            ]}
          />
        </>
      )}
      {tab === "guide" && <Guide />}
    </div>
  )
}

const ModuleOff = ({ onOpen }: { onOpen: () => void }) => {
  const { t } = useTranslation()
  return (
    <Container className="overflow-hidden flex flex-wrap items-center justify-between gap-3 p-6">
      <Text size="small" className="text-ui-fg-subtle">
        {t("compliance.moduleOff")}
      </Text>
      <Button size="small" variant="secondary" onClick={onOpen}>
        {t("compliance.tabs.settings")}
      </Button>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "compliance.title",
  translationNs: "translation",
  icon: navIcon(DocumentText, BRAND_COLOR),
})

export default CompliancePage
