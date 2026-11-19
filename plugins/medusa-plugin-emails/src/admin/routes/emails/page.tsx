import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BookOpen, ClockSolid, CogSixTooth, DocumentText, Envelope, SwatchSolid } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { Appearance } from "../../components/emails/appearance"
import { DemoBar, ResetDemoButton } from "../../components/emails/demo-bar"
import { Guide } from "../../components/emails/guide"
import { MessageLog } from "../../components/emails/message-log"
import { Settings } from "../../components/emails/settings"
import { TabTrigger } from "../../components/emails/shared"
import { Templates } from "../../components/emails/templates"
import { useEmailsStatus } from "../../lib/emails/api"
import { navIcon } from "../../lib/emails/kit/nav-icon"
import { DisabledNotice, LoadingBlock, PageHeader, PageTabs, useTabParam } from "../../lib/emails/kit/page"
import { PageIcon } from "../../lib/emails/kit/ui"

const BRAND_COLOR = "#2563eb"

const TABS = ["history", "templates", "appearance", "settings", "guide"] as const

/**
 * "Emails" in the main menu: the send history first, then the templates,
 * their appearance, the settings and the rollout guide. The tab is kept in
 * the URL (`?tab=`), so going back from a template returns to the list.
 */
const EmailsPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useEmailsStatus()
  const s = status.data
  const [tab, setTab] = useTabParam(TABS)
  const demo = Boolean(s?.enabled && s.demo)

  return (
    <div className="flex flex-col gap-y-3">
      {demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <PageHeader
          icon={<PageIcon icon={Envelope} color={BRAND_COLOR} />}
          title={t("emails.title")}
          description={t("emails.description")}
          state={!s ? null : !s.enabled ? "off" : demo ? "demo" : "on"}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["emails"] })}
          refreshing={status.isFetching}
        />
        <PageTabs value={tab} onChange={setTab} actions={demo && <ResetDemoButton />}>
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
        </PageTabs>
        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {status.isError && (
          <Text size="small" className="text-ui-fg-error px-6 py-4">
            {t("emails.loadError")}
          </Text>
        )}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("emails.status.disabledHint")} />}
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
