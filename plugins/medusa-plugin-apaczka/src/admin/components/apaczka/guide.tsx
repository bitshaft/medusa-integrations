import { useTranslation } from "react-i18next"

import { GuideSections } from "../../lib/apaczka/kit/page"
import { SetupStepsFrom } from "../../lib/apaczka/kit/setup"

const SECTIONS = ["start", "options", "shipments", "labels", "tracking", "weight", "points", "demo"] as const

/** "Guide": the installation steps with their status, then how shipping with Apaczka works in plain words. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-y-3">
      <SetupStepsFrom
        path="/admin/apaczka/setup"
        text={(id, part, params) => t(`apaczka.setup.${id}.${part}`, params)}
      />
      <GuideSections
        title={t("apaczka.guide.title")}
        subtitle={t("apaczka.guide.subtitle")}
        sections={SECTIONS.map((s) => ({ title: t(`apaczka.guide.${s}.title`), text: t(`apaczka.guide.${s}.text`) }))}
      />
    </div>
  )
}
