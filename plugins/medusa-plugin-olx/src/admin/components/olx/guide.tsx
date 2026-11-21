import { useTranslation } from "react-i18next"

import { GuideSections } from "../../lib/olx/kit/page"
import { SetupStepsFrom } from "../../lib/olx/kit/setup"

const SECTIONS = ["what", "publish", "sold", "paid", "limits", "demo"] as const

/** "Guide": the installation steps and how the plugin works, in plain words. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <>
      <SetupStepsFrom path="/admin/olx/setup" text={(id, part, params) => t(`olx.setup.${id}.${part}`, params)} />
      <GuideSections
        title={t("olx.guide.title")}
        subtitle={t("olx.guide.subtitle")}
        sections={SECTIONS.map((s) => ({ title: t(`olx.guide.${s}.title`), text: t(`olx.guide.${s}.text`) }))}
      />
    </>
  )
}
