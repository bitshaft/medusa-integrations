import { useTranslation } from "react-i18next"

import { DemoBar as KitDemoBar } from "../../lib/currency/kit/demo"

/** The demo bar every integration shares, with this plugin's hint. */
export const DemoBar = () => {
  const { t } = useTranslation()
  return <KitDemoBar>{t("currency.demoMode")}</KitDemoBar>
}
