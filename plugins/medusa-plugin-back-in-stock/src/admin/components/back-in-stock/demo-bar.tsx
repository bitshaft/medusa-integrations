import { useTranslation } from "react-i18next"

import { useDeleteDemo, useSeedDemo } from "../../lib/back-in-stock/api"
import { DemoBar as KitDemoBar, DemoResetButton } from "../../lib/back-in-stock/kit/demo"

/** Sample subscribers for "Restore test data"; demo emails are only logged, never sent. */
const DEMO_EMAILS = ["anna.nowak@example.com", "piotr.zielinski@example.com", "marta.kowalczyk@example.com"]

/** The demo bar every integration shares, with this plugin's hint. */
export const DemoBar = () => {
  const { t } = useTranslation()
  return <KitDemoBar>{t("back-in-stock.demoMode")}</KitDemoBar>
}

/** "Restore test data": deletes the demo subscriptions and creates a fresh set. */
export const ResetDemoButton = () => {
  const { t, i18n } = useTranslation()
  const remove = useDeleteDemo()
  const seed = useSeedDemo()
  return (
    <DemoResetButton
      description={t("back-in-stock.demoReset.body")}
      onReset={async () => {
        await remove.mutateAsync()
        const result = await seed.mutateAsync({
          emails: DEMO_EMAILS,
          count: 5,
          locale: i18n.language?.startsWith("pl") ? "pl" : "en",
        })
        return t("back-in-stock.demoTools.seeded", { count: result.created })
      }}
    />
  )
}
