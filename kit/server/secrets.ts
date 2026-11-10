/**
 * Secret masking for logs, error messages and admin API responses.
 *
 * Plugins register every secret they hold (API keys, tokens, signing
 * secrets) once, and pass all log output through the masker.
 */

/** Minimal logger shape; Medusa's logger and `console` both satisfy it. */
export type KitLogger = {
  debug?: (message: string) => void
  info?: (message: string) => void
  warn: (message: string) => void
  error?: (message: string) => void
}

const MASK = "****"
/** Shorter values are not masked: they would match ordinary words. */
const MIN_SECRET_LENGTH = 6

export type SecretMasker = (text: string) => string

/**
 * Returns a function that replaces every occurrence of the given secrets
 * (and their URL-encoded form) with `****`. Empty and very short values are
 * ignored.
 */
export function createSecretMasker(secrets: Array<string | null | undefined>): SecretMasker {
  const values = new Set<string>()
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
      continue
    }
    values.add(secret)
    values.add(encodeURIComponent(secret))
  }
  // Longest first, so a secret that contains another is masked whole.
  const sorted = [...values].sort((a, b) => b.length - a.length)

  return (text: string) => {
    let result = String(text)
    for (const value of sorted) {
      result = result.split(value).join(MASK)
    }
    return result
  }
}

/** Wraps a logger so every message goes through the masker first. */
export function createMaskedLogger(logger: KitLogger, mask: SecretMasker): Required<KitLogger> {
  const forward =
    (level: keyof KitLogger) =>
    (message: string): void => {
      const fn = logger[level] ?? (level === "error" ? logger.warn : undefined)
      fn?.call(logger, mask(message))
    }
  return {
    debug: forward("debug"),
    info: forward("info"),
    warn: forward("warn"),
    error: forward("error"),
  }
}

/**
 * Partial view of an identifier for admin screens, e.g. `abcd••••wxyz`.
 * Values of 8 characters or fewer are hidden completely. Never use this for
 * real secrets; leave them out of responses altogether.
 */
export function maskIdentifier(value: string | null | undefined): string {
  if (!value) {
    return ""
  }
  return value.length <= 8 ? "••••" : `${value.slice(0, 4)}••••${value.slice(-4)}`
}
