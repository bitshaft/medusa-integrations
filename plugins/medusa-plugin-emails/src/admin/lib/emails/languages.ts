const languageOf = (code: string) => code.split(/[-_]/)[0].toLowerCase()

/**
 * Name of a store language in the admin's language: "Polish", or "English
 * (United States)" when another store language is also English, so the two
 * can be told apart. Falls back to the code.
 */
export function languageName(code: string, storeLocales: readonly string[], uiLanguage: string): string {
  const language = languageOf(code)
  const shared = storeLocales.filter((locale) => languageOf(locale) === language).length > 1
  try {
    const name = new Intl.DisplayNames([uiLanguage, "en"], { type: "language", languageDisplay: "standard" }).of(
      shared ? code : language
    )
    // Polish (and other languages) write language names in lower case.
    return name ? name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1) : code
  } catch {
    return code
  }
}
