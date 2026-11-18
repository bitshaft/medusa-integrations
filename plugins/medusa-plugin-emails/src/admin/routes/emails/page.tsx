import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BookOpen, ClockSolid, CogSixTooth, DocumentText, Envelope, SwatchSolid } from "@medusajs/icons"
import { Container, Heading, Skeleton, StatusBadge, Tabs, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"

import { Appearance } from "../../components/emails/appearance"
import { DemoBar } from "../../components/emails/demo-bar"
import { Guide } from "../../components/emails/guide"
import { MessageLog } from "../../components/emails/message-log"
import { Settings } from "../../components/emails/settings"
import { TabTrigger } from "../../components/emails/shared"
import { Templates } from "../../components/emails/templates"
import { useEmailsStatus } from "../../lib/emails/api"
import { navIcon } from "../../lib/emails/kit/nav-icon"
import { PageIcon } from "../../lib/emails/kit/ui"

const BRAND_COLOR = "#2563eb"

const TABS = ["history", "templates", "appearance", "settings", "guide"] as const
type Tab = (typeof TABS)[number]

/**
 * "Emails" in the main menu: the send history first, then the templates,
 * their appearance, the settings and the rollout guide. The tab is kept in
 * the URL (`?tab=`), so going back from a template returns to the list.
 */
const EmailsPage = () => {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const status = useEmailsStatus()
  const s = status.data
  const requested = params.get("tab") as Tab | null
  const tab: Tab = requested && TABS.includes(requested) ? requested : "history"
  const setTab = (next: Tab) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        if (next === "history") copy.delete("tab")
        else copy.set("tab", next)
        return copy
      },
      { replace: true }
    )

  return (
    <div className="flex flex-col gap-y-3">
      {s?.enabled && s.demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-x-3">
            <PageIcon icon={Envelope} color={BRAND_COLOR} />
            <div>
              <Heading>{t("emails.title")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("emails.description")}
              </Text>
            </div>
          </div>
          {s?.enabled && (
            <StatusBadge color={s.demo ? "blue" : "green"}>
              {s.demo ? t("emails.status.demo") : t("emails.status.enabled")}
            </StatusBadge>
          )}
        </div>
        <div className="overflow-x-auto px-6 py-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <Tabs.List>
              <TabTrigger value="history" icon={ClockSolid} color="#2563eb">
                {t("emails.tabs.history")}
              </TabTrigger>
              <TabTrigger value="templates" icon={DocumentText} color="#ea580c">
                {t("emails.tabs.templates")}
              </TabTrigger>
              <TabTrigger value="appearance" icon={SwatchSolid} color="#7c3aed">
                {t("emails.tabs.appearance")}
              </TabTrigger>
              <TabTrigger value="settings" icon={CogSixTooth} color="#64748b">
                {t("emails.tabs.settings")}
              </TabTrigger>
              <TabTrigger value="guide" icon={BookOpen} color="#db2777">
                {t("emails.tabs.guide")}
              </TabTrigger>
            </Tabs.List>
          </Tabs>
        </div>
        {status.isLoading && (
          <div className="px-6 py-4">
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {status.isError && (
          <Text size="small" className="text-ui-fg-error px-6 py-4">
            {t("emails.loadError")}
          </Text>
        )}
        {s && !s.enabled && (
          <div className="px-6 py-4">
            <Text size="small" weight="plus" className="text-ui-fg-error">
              {t("emails.status.disabled")}: {s.disabled_reason}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {t("emails.status.disabledHint")}
            </Text>
          </div>
        )}
      </Container>

      {s?.enabled && tab === "history" && (
        <Container className="overflow-hidden divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("emails.log.allTitle")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("emails.log.allSubtitle")}
            </Text>
          </div>
          <MessageLog pageSize={20} filters />
        </Container>
      )}
      {s?.enabled && tab === "templates" && <Templates />}
      {s?.enabled && tab === "appearance" && <Appearance locale={s.default_locale} />}
      {s?.enabled && tab === "settings" && <Settings status={s} />}
      {tab === "guide" && <Guide />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "emails.title",
  translationNs: "translation",
  icon: navIcon(Envelope, BRAND_COLOR),
})

export default EmailsPage
