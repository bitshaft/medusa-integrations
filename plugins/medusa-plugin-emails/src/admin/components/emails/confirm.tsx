import { usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

/**
 * Confirmations for the actions that send an email or stop one: one click
 * by mistake must not reach a customer.
 */
export function useEmailConfirm() {
  const { t } = useTranslation()
  const prompt = usePrompt()
  return {
    /** Before an email goes out again to the address it went to. */
    resend: (message: { recipient: string; subject: string | null }) =>
      prompt({
        title: t("emails.confirm.resendTitle"),
        description: message.subject
          ? t("emails.confirm.resendText", { subject: message.subject, to: message.recipient })
          : t("emails.confirm.resendTextNoSubject", { to: message.recipient }),
        confirmText: t("emails.log.resend"),
        cancelText: t("emails.reset.cancel"),
        variant: "confirmation",
      }),
    /** Before an email type is switched off (switching on needs no question). */
    disable: (name: string) =>
      prompt({
        title: t("emails.confirm.disableTitle", { name }),
        description: t("emails.confirm.disableText"),
        confirmText: t("emails.confirm.disable"),
        cancelText: t("emails.reset.cancel"),
        variant: "danger",
      }),
  }
}
