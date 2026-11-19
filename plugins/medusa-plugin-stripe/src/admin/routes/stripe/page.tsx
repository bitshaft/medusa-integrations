import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BookOpen, Cash, ChartBar, CreditCard, ExclamationCircle, CogSixTooth } from "@medusajs/icons"
import { Badge, Container, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { Checks } from "../../components/stripe/checks"
import { Disputes } from "../../components/stripe/disputes"
import { Guide } from "../../components/stripe/guide"
import { Overview } from "../../components/stripe/overview"
import { Payments } from "../../components/stripe/payments"
import { Payouts } from "../../components/stripe/payouts"
import { DemoBar, TabTrigger } from "../../components/stripe/shared"
import { useRefresh, useStatus } from "../../lib/stripe/api"
import { errorMessage } from "../../lib/stripe/format"
import { NAV_TILE_STYLE } from "../../lib/stripe/kit/nav-icon"
import stripeLogo from "../../lib/stripe/stripe-logo.png"
import { DisabledNotice, LoadingBlock, OptionsCard, PageHeader, PageTabs, useTabParam } from "../../lib/stripe/kit/page"
import { PageLogo } from "../../lib/stripe/kit/ui"

const TABS = ["panel", "payments", "payouts", "disputes", "settings", "guide"] as const

/** The "Stripe" page in the main menu. Read-only: payments and refunds stay with the official provider. */
const StripePage = () => {
  const { t } = useTranslation()
  const status = useStatus()
  const refresh = useRefresh()
  const s = status.data
  // Without data to show, open on Checks: that is where the setup is explained.
  const [current, setTab] = useTabParam(TABS, s && !s.enabled ? "settings" : "panel")
  const ready = Boolean(s?.enabled)

  return (
    <div className="flex flex-col gap-y-3">
      {s?.demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <PageHeader
          icon={<PageLogo src={stripeLogo} fill />}
          title="Stripe"
          description={t("stripe.description")}
          state={!s ? null : !s.enabled ? "off" : s.demo ? "demo" : "on"}
          actions={
            s?.key && (
              <Badge size="2xsmall" color={s.key.mode === "live" ? "green" : "orange"}>
                {t(`stripe.keyKind.${s.key.kind}`)} · {s.key.mode} · …{s.key.last4}
              </Badge>
            )
          }
          onRefresh={() => refresh.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}
          refreshing={refresh.isPending}
        />
        <PageTabs value={current} onChange={setTab}>
          <TabTrigger value="panel" icon={ChartBar} color="#635bff">
            {t("stripe.tabs.panel")}
          </TabTrigger>
          <TabTrigger value="payments" icon={CreditCard} color="#2563eb">
            {t("stripe.tabs.payments")}
          </TabTrigger>
          <TabTrigger value="payouts" icon={Cash} color="#16a34a">
            {t("stripe.tabs.payouts")}
          </TabTrigger>
          <TabTrigger value="disputes" icon={ExclamationCircle} color="#dc2626">
            {t("stripe.tabs.disputes")}
          </TabTrigger>
          <TabTrigger value="settings" icon={CogSixTooth} color="#64748b">
            {t("stripe.tabs.settings")}
          </TabTrigger>
          <TabTrigger value="guide" icon={BookOpen} color="#db2777">
            {t("stripe.tabs.guide")}
          </TabTrigger>
        </PageTabs>
        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("stripe.disabled.hint")} />}
      </Container>

      {ready && current === "panel" && <Overview />}
      {ready && current === "payments" && (
        <Payments demo={Boolean(s?.demo)} graceMinutes={s!.options.orphanGraceMinutes} />
      )}
      {ready && current === "payouts" && <Payouts demo={Boolean(s?.demo)} />}
      {ready && current === "disputes" && <Disputes demo={Boolean(s?.demo)} />}
      {s && current === "settings" && (
        <>
          <Checks status={s} />
          <OptionsCard
            version={s.version}
            rows={[
              ["apiKey", s.options.hasKey ? t("stripe.options.keySet") : null],
              ["providerId", s.options.providerId],
              ["mode", s.options.mode],
              ["backendUrl", s.options.backendUrl],
              ["storefrontDomains", s.options.storefrontDomains],
              ["cacheSeconds", s.options.cacheSeconds],
              ["orphanGraceMinutes", s.options.orphanGraceMinutes],
              ["demo", s.demo],
            ]}
          />
        </>
      )}
      {current === "guide" && <Guide />}
      {s && !ready && !["settings", "guide"].includes(current) && (
        <Container className="overflow-hidden p-6">
          <Text size="small" className="text-ui-fg-subtle">
            {t("stripe.disabled.hint")}
          </Text>
        </Container>
      )}
    </div>
  )
}

/** Sidebar icon: the Stripe logo (a coloured square) covering the whole sidebar tile. */
const StripeNavIcon = () => (
  <span style={{ ...NAV_TILE_STYLE, overflow: "hidden" }}>
    <img src={stripeLogo} alt="" style={{ width: 20, height: 20, display: "block" }} />
  </span>
)

export const config = defineRouteConfig({
  label: "Stripe",
  icon: StripeNavIcon,
})

export default StripePage
