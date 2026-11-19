import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SetupStepsFrom } from "../../lib/loyalty/kit/setup"

const SECTIONS = [
  "start",
  "earning",
  "actions",
  "rewards",
  "tiers",
  "expiry",
  "returns",
  "ledger",
  "storefront",
  "events",
] as const

/** "Guide": the installation steps with their status, then how the program works, in plain words for the store owner. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-y-3">
      <SetupStepsFrom
        path="/admin/loyalty/setup"
        text={(id, part, params) => t(`loyalty.setup.${id}.${part}`, params)}
      />
      <Container className="overflow-hidden flex flex-col gap-y-6 px-6 py-6">
        <div>
          <Heading level="h2">{t("loyalty.guide.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("loyalty.guide.subtitle")}
          </Text>
        </div>
        {SECTIONS.map((section) => (
          <section key={section} className="flex max-w-3xl flex-col gap-y-1">
            <Text weight="plus">{t(`loyalty.guide.${section}.title`)}</Text>
            <Text size="small" className="whitespace-pre-line text-ui-fg-subtle">
              {t(`loyalty.guide.${section}.text`)}
            </Text>
          </section>
        ))}
      </Container>
    </div>
  )
}
