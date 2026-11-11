/**
 * Marker providers put in an error message when they cannot tell whether
 * the email was sent (for example a timeout after the message was handed to
 * the SMTP server). Such emails are not retried automatically, because a
 * retry could deliver the same email twice.
 */
export const OUTCOME_UNKNOWN = "[emails:outcome-unknown]"

export function isOutcomeUnknown(error: unknown): boolean {
  return error instanceof Error && error.message.includes(OUTCOME_UNKNOWN)
}

/** One line, without the marker, short enough for the send log. */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(OUTCOME_UNKNOWN, "").replace(/\s+/g, " ").trim().slice(0, 1000)
}
