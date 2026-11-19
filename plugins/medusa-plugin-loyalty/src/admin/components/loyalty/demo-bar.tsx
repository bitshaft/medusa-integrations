import { useTranslation } from "react-i18next"

import { useResetDemo } from "../../lib/loyalty/api"
import { DemoBar as KitDemoBar, DemoResetButton } from "../../lib/loyalty/kit/demo"

/** The demo bar every integration shares, with this plugin's hint. */
export const DemoBar = () => {
  const { t } = useTranslation()
  return <KitDemoBar>{t("loyalty.demo.body")}</KitDemoBar>
}

/** "Restore test data", at the right end of the tab row. */
export const ResetDemoButton = () => {
  const { t } = useTranslation()
  const reset = useResetDemo()
  return (
    <DemoResetButton
      description={t("loyalty.demo.resetBody")}
      onReset={async () => {
        const r = await reset.mutateAsync()
        return t("loyalty.demo.restoredHint", { customers: r.customers, entries: r.entries })
      }}
    />
  )
}
