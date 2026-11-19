import { useTranslation } from "react-i18next"

import { useApaczkaStatus } from "../../lib/apaczka/api"
import { DemoBar as KitDemoBar } from "../../lib/apaczka/kit/demo"

/** The demo bar every integration shares, shown while nothing comes from Apaczka. */
export const DemoBar = () => {
  const { t } = useTranslation()
  const status = useApaczkaStatus()
  if (!status.data?.enabled || !status.data.demo) return null
  return <KitDemoBar>{t("apaczka.demo.body")}</KitDemoBar>
}
