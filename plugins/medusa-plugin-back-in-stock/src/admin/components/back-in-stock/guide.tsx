import { useTranslation } from "react-i18next"

import { GuideSections } from "../../lib/back-in-stock/kit/page"

const SECTIONS = ["start", "storefront", "consent", "restock", "emails", "privacy", "demo"] as const

/** "Guide": how back in stock notifications work, in plain words for the store owner. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <GuideSections
      title={t("back-in-stock.guide.title")}
      subtitle={t("back-in-stock.guide.subtitle")}
      sections={SECTIONS.map((s) => ({
        title: t(`back-in-stock.guide.${s}.title`),
        text: t(`back-in-stock.guide.${s}.text`),
      }))}
    />
  )
}
