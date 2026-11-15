import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { Note } from "./shared"

const STEPS = ["key", "permissions", "options", "provider", "webhook", "methods", "domains", "test", "live"] as const

/** Setup from a restricted key to the first test payment. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <div>
        <Heading level="h2">{t("stripe.guide.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("stripe.guide.intro")}
        </Text>
      </div>
      <ol className="flex flex-col gap-y-4">
        {STEPS.map((step, i) => (
          <li key={step} className="flex gap-x-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ui-bg-subtle txt-compact-small-plus">
              {i + 1}
            </span>
            <div className="flex flex-col gap-y-1">
              <Text size="small" weight="plus">
                {t(`stripe.guide.${step}.title`)}
              </Text>
              <Text size="small" className="text-ui-fg-subtle whitespace-pre-line">
                {t(`stripe.guide.${step}.body`, { interpolation: { escapeValue: false } })}
              </Text>
            </div>
          </li>
        ))}
      </ol>
      <Note>{t("stripe.guide.readOnly")}</Note>
    </Container>
  )
}
