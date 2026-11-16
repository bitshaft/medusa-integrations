import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useSettings } from "../lib/compliance/api"
import { languageLabel } from "../lib/compliance/format"

/**
 * Side column of Settings → Translations: GPSR safety warnings and consent
 * texts are written per language on the Compliance page, not as Medusa
 * translations. This points there and lists the languages they follow.
 */
const ComplianceTranslationList = () => {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  if (!settings.data?.enabled) return null
  const languages = settings.data.store_languages.map((code) => languageLabel(code, i18n.language)).join(", ")

  return (
    <Container className="overflow-hidden flex flex-col gap-y-3 px-6 py-4">
      <div>
        <Heading level="h2">{t("compliance.translations.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("compliance.translations.text", { languages })}
        </Text>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="small" variant="secondary" asChild>
          <Link to="/compliance?tab=gpsr">{t("compliance.translations.gpsr")}</Link>
        </Button>
        <Button size="small" variant="secondary" asChild>
          <Link to="/compliance?tab=gdpr">{t("compliance.translations.consents")}</Link>
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  // @ts-expect-error -- Settings -> Translations has widget slots
  // ("translation.list.*") that admin-shared's zone list doesn't declare yet.
  // "side" is the column with Medusa's "Languages" card.
  zone: "translation.list.side.before",
})

export default ComplianceTranslationList
