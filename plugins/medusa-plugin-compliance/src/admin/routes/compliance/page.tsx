import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, BookOpen, ChartBar, CogSixTooth, CurrencyDollar, DocumentText, Tag, User } from "@medusajs/icons"
import { Button, Container, Heading, Skeleton, Tabs, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Dashboard } from "../../components/compliance/dashboard"
import { Gdpr } from "../../components/compliance/gdpr"
import { Gpsr } from "../../components/compliance/gpsr"
import { Guide } from "../../components/compliance/guide"
import { Omnibus } from "../../components/compliance/omnibus"
import { Settings } from "../../components/compliance/settings"
import { DemoBar } from "../../components/compliance/shared"
import { keys, useSettings } from "../../lib/compliance/api"
import { navIcon } from "../../lib/compliance/kit/nav-icon"

type Tab = "panel" | "gpsr" | "gdpr" | "omnibus" | "settings" | "guide"

/** The "Compliance" page in the main menu: GPSR, GDPR and Omnibus in one place. */
const CompliancePage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useSettings()
  const [tab, setTab] = useState<Tab>("panel")
  const s = status.data
  const demo = Boolean(s?.settings.demo)

  return (
    <div className="flex flex-col gap-y-3">
      {demo && <DemoBar />}
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-x-3">
            <DocumentText />
            <div>
              <Heading>{t("compliance.title")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("compliance.description")}
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
            {t("compliance.refresh")}
          </Button>
        </div>
        <div className="overflow-x-auto px-6 py-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <Tabs.List>
              <Tabs.Trigger value="panel">
                <ChartBar />
                {t("compliance.tabs.panel")}
              </Tabs.Trigger>
              <Tabs.Trigger value="gpsr">
                <Tag />
                {t("compliance.tabs.gpsr")}
              </Tabs.Trigger>
              <Tabs.Trigger value="gdpr">
                <User />
                {t("compliance.tabs.gdpr")}
              </Tabs.Trigger>
              <Tabs.Trigger value="omnibus">
                <CurrencyDollar />
                {t("compliance.tabs.omnibus")}
              </Tabs.Trigger>
              <Tabs.Trigger value="settings">
                <CogSixTooth />
                {t("compliance.tabs.settings")}
              </Tabs.Trigger>
              <Tabs.Trigger value="guide">
                <BookOpen />
                {t("compliance.tabs.guide")}
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs>
        </div>
        {status.isLoading && <Skeleton className="m-6 h-10" />}
        {s && !s.enabled && (
          <div className="px-6 py-4">
            <Text size="small" weight="plus" className="text-ui-fg-error">
              {t("compliance.disabled.title", { reason: s.disabled_reason })}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {t("compliance.disabled.hint")}
            </Text>
          </div>
        )}
      </Container>

      {s?.enabled && tab === "panel" && <Dashboard onOpen={setTab} />}
      {s?.enabled &&
        tab === "gpsr" &&
        (s.settings.modules.gpsr ? <Gpsr demo={demo} /> : <ModuleOff onOpen={() => setTab("settings")} />)}
      {s?.enabled &&
        tab === "gdpr" &&
        (s.settings.modules.gdpr ? (
          <Gdpr demo={demo} warnDays={s.settings.gdpr.warn_days} placeholder={s.lawyer_placeholder} />
        ) : (
          <ModuleOff onOpen={() => setTab("settings")} />
        ))}
      {s?.enabled &&
        tab === "omnibus" &&
        (s.settings.modules.omnibus ? <Omnibus demo={demo} /> : <ModuleOff onOpen={() => setTab("settings")} />)}
      {s?.enabled && tab === "settings" && <Settings data={s} />}
      {tab === "guide" && <Guide />}
    </div>
  )
}

const ModuleOff = ({ onOpen }: { onOpen: () => void }) => {
  const { t } = useTranslation()
  return (
    <Container className="flex flex-wrap items-center justify-between gap-3 p-6">
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
  icon: navIcon(DocumentText, "#0d9488"),
})

export default CompliancePage
