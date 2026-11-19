import { useTranslation } from "react-i18next"

import { GuideSections } from "../../lib/currency/kit/page"

const SECTIONS = ["what", "where", "rates", "rounding", "tax", "preview", "origin", "events", "demo", "limits"] as const

/** "Guide": how filling prices works, in plain words. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <GuideSections
      title={t("currency.guide.title")}
      subtitle={t("currency.guide.subtitle")}
      sections={SECTIONS.map((s) => ({ title: t(`currency.guide.${s}.title`), text: t(`currency.guide.${s}.text`) }))}
    />
  )
}
