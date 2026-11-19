import { useTranslation } from "react-i18next"

import { type TypeLabels, useEmailTypes } from "./api"

/** A value kept per admin language: the admin's, else English, else any. */
function pick(values: Partial<Record<string, string>> | undefined, language: string): string | undefined {
  if (!values) {
    return undefined
  }
  const short = language.split("-")[0].toLowerCase()
  const key =
    Object.keys(values).find((k) => k.toLowerCase() === language.toLowerCase()) ??
    Object.keys(values).find((k) => k.split("-")[0].toLowerCase() === short)
  return (key ? values[key] : undefined) ?? values.en ?? Object.values(values).find(Boolean)
}

/**
 * Name, description and source of an email type as the admin shows them:
 * built-in types from the translations, types added by other plugins from
 * their `name`, `description` and `source` (the type key only as a last resort).
 */
export function useTypeText() {
  const { t, i18n } = useTranslation()
  const types = useEmailTypes(true)
  return (type: string, labels?: TypeLabels | null) => {
    const own = labels ?? types.data?.types.find((summary) => summary.type === type)?.labels ?? null
    return {
      name: pick(own?.name, i18n.language) ?? t(`emails.types.${type}.name`, { defaultValue: type }),
      description: pick(own?.description, i18n.language) ?? t(`emails.types.${type}.description`, { defaultValue: "" }),
      /** The plugin that adds a custom type; `null` when it does not say. */
      source: pick(own?.source, i18n.language) ?? null,
    }
  }
}
