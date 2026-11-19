import { useTranslation } from "react-i18next"

import { GuideSections } from "../../lib/whitelist-vat/kit/page"

const SECTIONS = ["start", "registers", "verdicts", "orders", "checkout", "limits", "demo"] as const

/** "Guide": how the verification works, in plain words for the store owner. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <GuideSections
      title={t("whitelist-vat.guide.title")}
      subtitle={t("whitelist-vat.guide.subtitle")}
      sections={SECTIONS.map((s) => ({
        title: t(`whitelist-vat.guide.${s}.title`),
        text: t(`whitelist-vat.guide.${s}.text`),
      }))}
    />
  )
}
