import { useTranslation } from "react-i18next"

import { GuideSections } from "../../lib/back-in-stock/kit/page"
import { SetupStepsFrom } from "../../lib/back-in-stock/kit/setup"

const SECTIONS = ["start", "storefront", "consent", "restock", "emails", "privacy", "demo"] as const

/** "Guide": the installation steps with their status, then how notifications work in plain words. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-y-3">
      <SetupStepsFrom
        path="/admin/back-in-stock/setup"
        text={(id, part, params) => t(`back-in-stock.setup.${id}.${part}`, params)}
      />
      <GuideSections
        title={t("back-in-stock.guide.title")}
        subtitle={t("back-in-stock.guide.subtitle")}
        sections={SECTIONS.map((s) => ({
          title: t(`back-in-stock.guide.${s}.title`),
          text: t(`back-in-stock.guide.${s}.text`),
        }))}
      />
    </div>
  )
}
