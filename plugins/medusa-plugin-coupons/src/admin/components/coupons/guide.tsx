import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

const SECTIONS = [
  "start",
  "kinds",
  "who",
  "rules",
  "combining",
  "tiers",
  "batches",
  "checks",
  "storefront",
  "limits",
] as const

/** "Guide" tab: how coupons work, in plain words for the store owner. */
export const Guide = () => {
  const { t } = useTranslation()
  return (
    <Container className="flex flex-col gap-y-6 px-6 py-6">
      <div>
        <Heading level="h2">{t("coupons.guide.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("coupons.guide.subtitle")}
        </Text>
      </div>
      {SECTIONS.map((section) => (
        <section key={section} className="flex max-w-3xl flex-col gap-y-1">
          <Text weight="plus">{t(`coupons.guide.${section}.title`)}</Text>
          <Text size="small" className="whitespace-pre-line text-ui-fg-subtle">
            {t(`coupons.guide.${section}.text`)}
          </Text>
        </section>
      ))}
    </Container>
  )
}
