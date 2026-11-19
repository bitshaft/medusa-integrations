import { useTranslation } from "react-i18next"

import { useResetCouponsDemo } from "../../lib/coupons/api"
import { DemoBar as KitDemoBar, DemoResetButton } from "../../lib/coupons/kit/demo"

/** The demo bar every integration shares, with this plugin's hint. */
export const DemoBar = () => {
  const { t } = useTranslation()
  return <KitDemoBar>{t("coupons.demo.body")}</KitDemoBar>
}

/** "Restore test data", at the right end of the tab row. */
export const ResetDemoButton = () => {
  const { t } = useTranslation()
  const reset = useResetCouponsDemo()
  return (
    <DemoResetButton
      description={t("coupons.demo.resetBody")}
      onReset={async () => {
        const r = await reset.mutateAsync()
        return t("coupons.demo.restoredHint", { coupons: r.coupons, codes: r.codes })
      }}
    />
  )
}
