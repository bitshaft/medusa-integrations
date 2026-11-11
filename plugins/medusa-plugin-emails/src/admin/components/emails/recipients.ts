const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** Splits text typed into a recipients field into valid and invalid addresses. */
export function parseRecipients(text: string): { valid: string[]; invalid: string[] } {
  const entries = text
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  return {
    valid: [...new Set(entries.filter((entry) => EMAIL.test(entry)).map((entry) => entry.toLowerCase()))],
    invalid: entries.filter((entry) => !EMAIL.test(entry)),
  }
}

export function formatRecipients(recipients: string[] | null | undefined): string {
  return (recipients ?? []).join("\n")
}
