import { useTranslation } from "react-i18next"

import { GuideSections } from "../../lib/whitelist-vat/kit/page"
import { SetupStepsFrom } from "../../lib/whitelist-vat/kit/setup"

const SECTIONS = ["start", "registers", "verdicts", "orders", "checkout", "limits", "demo"] as const

/** "Guide": the installation steps with their status, then how the verification works in plain words. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-y-3">
      <SetupStepsFrom
        path="/admin/whitelist-vat/setup"
        text={(id, part, params) => t(`whitelist-vat.setup.${id}.${part}`, params)}
      />
      <GuideSections
        title={t("whitelist-vat.guide.title")}
        subtitle={t("whitelist-vat.guide.subtitle")}
        sections={SECTIONS.map((s) => ({
          title: t(`whitelist-vat.guide.${s}.title`),
          text: t(`whitelist-vat.guide.${s}.text`),
        }))}
      />
    </div>
  )
}
