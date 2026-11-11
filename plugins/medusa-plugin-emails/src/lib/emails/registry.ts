import { COMMON_GROUP, type CopyGroup, DEFAULT_COPY } from "./copy"
import type { EmailLocale } from "./locales"
import type { EmailsPluginOptions } from "./options"
import { BUILT_IN_TEMPLATES, GenericEmail } from "./templates/built-in"
import { BUILT_IN_TYPES, COMMON_VARIABLES, type EmailTemplate, type EmailTypeDefinition } from "./types"

type TemplateOptions = Pick<EmailsPluginOptions, "templates" | "disabledTypes">

/** Built-in email types followed by the custom ones from the `templates` option. */
export function listDefinitions(options: TemplateOptions): EmailTypeDefinition[] {
  const builtIn = BUILT_IN_TYPES.map((definition) => ({
    ...definition,
    defaultEnabled:
      !options.disabledTypes.includes(definition.type) && (options.templates[definition.type]?.enabled ?? true),
  }))
  const known = new Set(builtIn.map((definition) => definition.type))
  const custom = Object.entries(options.templates)
    .filter(([type]) => !known.has(type) && type !== COMMON_GROUP)
    .map(([type, template]): EmailTypeDefinition => ({
      type,
      audience: template.audience ?? "customer",
      sensitive: false,
      variables: template.variables ?? null,
      custom: true,
      defaultEnabled: !options.disabledTypes.includes(type) && (template.enabled ?? true),
    }))
  return [...builtIn, ...custom]
}

export function getDefinition(options: TemplateOptions, type: string): EmailTypeDefinition | undefined {
  return listDefinitions(options).find((definition) => definition.type === type)
}

export function templateFor(options: TemplateOptions, type: string): EmailTemplate {
  return options.templates[type]?.component ?? BUILT_IN_TEMPLATES[type] ?? GenericEmail
}

export function customCopyFor(
  options: TemplateOptions,
  type: string
): Partial<Record<EmailLocale, CopyGroup>> | undefined {
  return options.templates[type]?.copy
}

/** Editable fields of a group (an email type or `common`), in display order. */
export function copyKeys(options: TemplateOptions, group: string): string[] {
  const keys = new Set(Object.keys(DEFAULT_COPY.en[group] ?? {}))
  for (const copy of Object.values(customCopyFor(options, group) ?? {})) {
    for (const key of Object.keys(copy ?? {})) {
      keys.add(key)
    }
  }
  return [...keys]
}

/** Variables the copy of a group may use; `null` allows any. */
export function copyVariables(options: TemplateOptions, group: string): string[] | null {
  if (group === COMMON_GROUP) {
    return COMMON_VARIABLES
  }
  return getDefinition(options, group)?.variables ?? null
}

/** True for `common` and for every known email type. */
export function isCopyGroup(options: TemplateOptions, group: string): boolean {
  return group === COMMON_GROUP || Boolean(getDefinition(options, group))
}
