import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { LegalNote, Section } from "./shared"

const MODULES = ["gpsr", "gdpr", "omnibus"] as const
const PARTS = ["does", "store", "check"] as const

/**
 * What each module does, what the store must do outside the plugin, and
 * which settings to check with a lawyer. A tool, not legal advice.
 */
export const Guide = () => {
  const { t } = useTranslation()
  const list = (key: string) => {
    const value = t(key, { returnObjects: true })
    return Array.isArray(value) ? (value as string[]) : []
  }
  return (
    <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
      <div>
        <Heading level="h2">{t("compliance.guide.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("compliance.guide.intro")}
        </Text>
      </div>
      <LegalNote>{t("compliance.legal.full")}</LegalNote>
      {MODULES.map((module) => (
        <Section key={module} title={t(`compliance.modules.${module}`)} hint={t(`compliance.guide.${module}.summary`)}>
          {PARTS.map((part) => (
            <div key={part} className="flex flex-col gap-y-1">
              <Text size="small" weight="plus">
                {t(`compliance.guide.parts.${part}`)}
              </Text>
              <ul className="flex list-disc flex-col gap-y-1 pl-5">
                {list(`compliance.guide.${module}.${part}`).map((item) => (
                  <li key={item}>
                    <Text size="small" as="span">
                      {item}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      ))}
      <Section title={t("compliance.guide.demo.title")}>
        <Text size="small">{t("compliance.guide.demo.body")}</Text>
      </Section>
    </Container>
  )
}
