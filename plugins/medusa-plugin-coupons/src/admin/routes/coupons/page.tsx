import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowDownTray,
  ArrowUpRightOnBox,
  BookOpen,
  ChartBar,
  CogSixTooth,
  Plus,
  ReceiptPercent,
  SquaresPlus,
} from "@medusajs/icons"
import { Button, Container } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Dashboard } from "../../components/coupons/dashboard"
import { Guide } from "../../components/coupons/guide"
import { Settings } from "../../components/coupons/settings"
import { CouponWizard } from "../../components/coupons/wizard"
import { DemoBar, ResetDemoButton } from "../../components/coupons/demo-bar"
import { type CouponView, exportUrl, useSettings } from "../../lib/coupons/api"
import { adminLocale } from "../../lib/coupons/draft"
import { navIcon } from "../../lib/coupons/kit/nav-icon"
import { DisabledNotice, LoadingBlock, PageHeader, PageTabs, useTabParam } from "../../lib/coupons/kit/page"
import { PageIcon, TabTrigger } from "../../lib/coupons/kit/ui"

const BRAND_COLOR = "#db2777"

const TABS = ["panel", "settings", "guide"] as const
type WizardState = { mode: "coupon" | "batch"; coupon: CouponView | null } | null

/** The "Coupons" page under Extensions. */
const CouponsPage = () => {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const status = useSettings()
  const [tab, setTab] = useTabParam(TABS)
  const [wizard, setWizard] = useState<WizardState>(null)
  const s = status.data
  const demo = Boolean(s?.enabled && s.options.demo)
  const currencyCode = s?.enabled ? s.settings.currencyCode : "pln"
  const exportLocale = s?.enabled ? s.settings.exportLocale : adminLocale(i18n.language)

  return (
    <div className="flex flex-col gap-y-3">
      {demo && <DemoBar />}
      <Container className="overflow-hidden divide-y p-0">
        <PageHeader
          icon={<PageIcon icon={ReceiptPercent} color={BRAND_COLOR} />}
          title={t("coupons.title")}
          description={t("coupons.description")}
          state={!s ? null : !s.enabled ? "off" : demo ? "demo" : "on"}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["coupons"] })}
          refreshing={status.isFetching}
          actions={
            s?.enabled && (
              <div className="flex flex-wrap gap-2">
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
            )
          }
        />
        <PageTabs value={tab} onChange={setTab} actions={demo && <ResetDemoButton />}>
          <TabTrigger value="panel" icon={ChartBar} color="#2563eb">
            {t("coupons.tabs.panel")}
          </TabTrigger>
          <TabTrigger value="settings" icon={CogSixTooth} color="#64748b">
            {t("coupons.tabs.settings")}
          </TabTrigger>
          <TabTrigger value="guide" icon={BookOpen} color="#db2777">
            {t("coupons.tabs.guide")}
          </TabTrigger>
        </PageTabs>
        {status.isLoading && <LoadingBlock className="m-6 h-10" />}
        {s && !s.enabled && <DisabledNotice reason={s.disabled_reason} hint={t("coupons.disabled.hint")} />}
      </Container>

      {s?.enabled && tab === "panel" && (
        <Dashboard
          currencyCode={currencyCode}
          onEdit={(coupon) => setWizard({ mode: coupon.batch_size != null ? "batch" : "coupon", coupon })}
        />
      )}
      {s?.enabled && tab === "settings" && <Settings status={s} />}
      {tab === "guide" && <Guide />}

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
