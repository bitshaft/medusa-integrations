import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, BookOpen, Cash, ChartBar, CreditCard, ExclamationCircle, ListCheckbox } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Skeleton, Tabs, Text, toast } from "@medusajs/ui"
import { useState } from "react"
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
import { navIcon } from "../../lib/stripe/kit/nav-icon"

type Tab = "panel" | "payments" | "payouts" | "disputes" | "checks" | "guide"

/** The "Stripe" page in the main menu. Read-only: payments and refunds stay with the official provider. */
const StripePage = () => {
  const { t } = useTranslation()
  const status = useStatus()
  const refresh = useRefresh()
  const s = status.data
  const [tab, setTab] = useState<Tab | null>(null)
  // Without data to show, open on Checks: that is where the setup is explained.
  const current: Tab = tab ?? (s && !s.enabled ? "checks" : "panel")
  const ready = Boolean(s?.enabled)

  return (
    <div className="flex flex-col gap-y-3">
      {s?.demo && <DemoBar />}
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-x-3">
            <CreditCard />
            <div>
              <div className="flex items-center gap-x-2">
                <Heading>Stripe</Heading>
                {s?.key && (
                  <Badge size="2xsmall" color={s.key.mode === "live" ? "green" : "orange"}>
                    {t(`stripe.keyKind.${s.key.kind}`)} · {s.key.mode} · …{s.key.last4}
                  </Badge>
                )}
              </div>
              <Text size="small" className="text-ui-fg-subtle">
                {t("stripe.description")}
              </Text>
            </div>
          </div>
          <Button
            size="small"
            variant="secondary"
            isLoading={refresh.isPending}
            onClick={() => refresh.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}
          >
            <ArrowPath />
            {t("stripe.refresh")}
          </Button>
        </div>
        <div className="overflow-x-auto px-6 py-3">
          <Tabs value={current} onValueChange={(v) => setTab(v as Tab)}>
            <Tabs.List>
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
              <TabTrigger value="checks" icon={ListCheckbox} color="#ea580c">
                {t("stripe.tabs.checks")}
              </TabTrigger>
              <TabTrigger value="guide" icon={BookOpen} color="#db2777">
                {t("stripe.tabs.guide")}
              </TabTrigger>
            </Tabs.List>
          </Tabs>
        </div>
        {status.isLoading && <Skeleton className="m-6 h-10" />}
        {s && !s.enabled && (
          <div className="px-6 py-4">
            <Text size="small" weight="plus" className="text-ui-fg-error">
              {t("stripe.disabled.title", { reason: s.disabled_reason })}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {t("stripe.disabled.hint")}
            </Text>
          </div>
        )}
      </Container>

      {ready && current === "panel" && <Overview />}
      {ready && current === "payments" && (
        <Payments demo={Boolean(s?.demo)} graceMinutes={s!.options.orphanGraceMinutes} />
      )}
      {ready && current === "payouts" && <Payouts demo={Boolean(s?.demo)} />}
      {ready && current === "disputes" && <Disputes demo={Boolean(s?.demo)} />}
      {s && current === "checks" && <Checks status={s} />}
      {current === "guide" && <Guide />}
      {s && !ready && !["checks", "guide"].includes(current) && (
        <Container className="p-6">
          <Text size="small" className="text-ui-fg-subtle">
            {t("stripe.disabled.hint")}
          </Text>
        </Container>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Stripe",
  icon: navIcon(CreditCard, "#635bff"),
})

export default StripePage
