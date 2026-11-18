import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowDownTray,
  ArrowPath,
  ArrowUpRightOnBox,
  BookOpen,
  ChartBar,
  CogSixTooth,
  Plus,
  ReceiptPercent,
  SquaresPlus,
} from "@medusajs/icons"
import { Badge, Button, Container, Heading, Skeleton, Tabs, Text } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Dashboard } from "../../components/coupons/dashboard"
import { Guide } from "../../components/coupons/guide"
import { Settings } from "../../components/coupons/settings"
import { CouponWizard } from "../../components/coupons/wizard"
import { DemoBar } from "../../components/coupons/demo-bar"
import { type CouponView, exportUrl, useSettings } from "../../lib/coupons/api"
import { adminLocale } from "../../lib/coupons/draft"
import { navIcon } from "../../lib/coupons/kit/nav-icon"
import { PageIcon, TabTrigger } from "../../lib/coupons/kit/ui"

const BRAND_COLOR = "#db2777"

type Tab = "panel" | "guide" | "settings"
type WizardState = { mode: "coupon" | "batch"; coupon: CouponView | null } | null

/** The "Coupons" page under Extensions. */
const CouponsPage = () => {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const status = useSettings()
  const [tab, setTab] = useState<Tab>("panel")
  const [wizard, setWizard] = useState<WizardState>(null)
  const s = status.data
  const currencyCode = s?.enabled ? s.settings.currencyCode : "pln"
  const exportLocale = s?.enabled ? s.settings.exportLocale : adminLocale(i18n.language)

  return (
    <div className="flex flex-col gap-y-3">
      {s?.enabled && s.options.demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-x-3">
            <PageIcon icon={ReceiptPercent} color={BRAND_COLOR} />
            <div>
              <div className="flex items-center gap-x-2">
                <Heading>{t("coupons.title")}</Heading>
                <Badge size="2xsmall" color="green">
                  {t("coupons.onPromotions")}
                </Badge>
              </div>
              <Text size="small" className="text-ui-fg-subtle">
                {t("coupons.description")}
              </Text>
            </div>
          </div>
          {s?.enabled && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="small"
                variant="secondary"
                isLoading={status.isFetching}
                onClick={() => queryClient.invalidateQueries({ queryKey: ["coupons"] })}
              >
                <ArrowPath />
                {t("coupons.refresh")}
              </Button>
              <Button size="small" variant="secondary" onClick={() => navigate("/promotions")}>
                <ArrowUpRightOnBox />
                {t("coupons.openPromotions")}
              </Button>
              <Button size="small" variant="secondary" asChild>
                <a href={exportUrl(exportLocale)} download>
                  <ArrowDownTray />
                  {t("coupons.export")}
                </a>
              </Button>
              <Button size="small" variant="secondary" onClick={() => setWizard({ mode: "batch", coupon: null })}>
                <SquaresPlus />
                {t("coupons.newBatch")}
              </Button>
              <Button size="small" onClick={() => setWizard({ mode: "coupon", coupon: null })}>
                <Plus />
                {t("coupons.newCoupon")}
              </Button>
            </div>
          )}
        </div>

        <div className="px-6 py-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <Tabs.List>
              <TabTrigger value="panel" icon={ChartBar} color="#2563eb">
                {t("coupons.tabs.panel")}
              </TabTrigger>
              <TabTrigger value="guide" icon={BookOpen} color="#db2777">
                {t("coupons.tabs.guide")}
              </TabTrigger>
              <TabTrigger value="settings" icon={CogSixTooth} color="#64748b">
                {t("coupons.tabs.settings")}
              </TabTrigger>
            </Tabs.List>
          </Tabs>
        </div>

        {status.isLoading && <Skeleton className="m-6 h-10" />}
        {s && !s.enabled && (
          <div className="px-6 py-4">
            <Text size="small" weight="plus" className="text-ui-fg-error">
              {t("coupons.disabled.title", { reason: s.disabled_reason })}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {t("coupons.disabled.hint")}
            </Text>
          </div>
        )}
      </Container>

      {s?.enabled && tab === "panel" && (
        <Dashboard
          currencyCode={currencyCode}
          onEdit={(coupon) => setWizard({ mode: coupon.batch_size != null ? "batch" : "coupon", coupon })}
        />
      )}
      {tab === "guide" && <Guide />}
      {s?.enabled && tab === "settings" && <Settings status={s} />}

      {s?.enabled && (
        <CouponWizard
          open={!!wizard}
          mode={wizard?.mode}
          coupon={wizard?.coupon}
          currencyCode={currencyCode}
          onClose={() => setWizard(null)}
        />
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "coupons.title",
  translationNs: "translation",
  icon: navIcon(ReceiptPercent, BRAND_COLOR),
})

export default CouponsPage
