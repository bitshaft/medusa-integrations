import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

/**
 * Side column of Settings → Translations: email texts are not Medusa
 * translations (they have defaults, variables and a preview), so they are
 * translated on the Emails page. This points there.
 */
const EmailsTranslationList = () => {
  const { t } = useTranslation()

  return (
    <Container className="flex flex-col gap-y-3 px-6 py-4">
      <div>
        <Heading level="h2">{t("emails.translations.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("emails.translations.text")}
        </Text>
      </div>
      <div>
        <Button size="small" variant="secondary" asChild>
          <Link to="/emails">{t("emails.translations.open")}</Link>
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

export default EmailsTranslationList
