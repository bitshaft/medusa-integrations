import { useTranslation } from "react-i18next"

import { useResetEmailsDemo } from "../../lib/emails/api"
import { DemoBar as KitDemoBar, DemoResetButton } from "../../lib/emails/kit/demo"

/** The demo bar every integration shares, with this plugin's hint. */
export const DemoBar = () => {
  const { t } = useTranslation()
  return <KitDemoBar>{t("emails.demoData.body")}</KitDemoBar>
}

/** "Restore test data", at the right end of the tab row. */
export const ResetDemoButton = () => {
  const { t } = useTranslation()
  const reset = useResetEmailsDemo()
  return (
    <DemoResetButton
      description={t("emails.demoData.resetBody")}
      onReset={async () => {
        const r = await reset.mutateAsync()
        return t("emails.demoData.restoredHint", { count: r.messages, orders: r.orders })
      }}
    />
  )
}
