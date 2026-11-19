import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SetupStepsFrom } from "../../lib/stripe/kit/setup"
import { Note } from "./shared"

/** Setup from a restricted key to the first test payment, each step with the status the checks detect. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-y-3">
      <Container className="overflow-hidden flex flex-col gap-y-2 p-6">
        <Heading level="h2">{t("stripe.guide.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("stripe.guide.intro")}
        </Text>
        <Note>{t("stripe.guide.readOnly")}</Note>
      </Container>
      <SetupStepsFrom
        path="/admin/stripe/setup"
        text={(id, part, params) =>
          t(`stripe.setup.${id}.${part}`, { ...params, interpolation: { escapeValue: false } })
        }
      />
    </div>
  )
}
