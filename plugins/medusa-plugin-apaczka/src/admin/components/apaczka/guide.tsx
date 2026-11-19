import { useTranslation } from "react-i18next"

import { GuideSections } from "../../lib/apaczka/kit/page"

const SECTIONS = ["start", "options", "shipments", "labels", "tracking", "weight", "points", "demo"] as const

/** "Guide": how shipping with Apaczka works, in plain words for the store owner. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <GuideSections
      title={t("apaczka.guide.title")}
      subtitle={t("apaczka.guide.subtitle")}
      sections={SECTIONS.map((s) => ({ title: t(`apaczka.guide.${s}.title`), text: t(`apaczka.guide.${s}.text`) }))}
    />
  )
}
