import { InformationCircleSolid } from "@medusajs/icons"
import { Button, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useResetEmailsDemo } from "../../lib/emails/api"
import { errorMessage } from "../../lib/emails/kit/format"

/** Shown above the page in demo mode, with "Restore test data" for the send history. */
export const DemoBar = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const reset = useResetEmailsDemo()

  const restore = async () => {
    const confirmed = await prompt({
      title: t("emails.demoData.resetTitle"),
      description: t("emails.demoData.resetBody"),
      confirmText: t("emails.demoData.reset"),
      cancelText: t("emails.demoData.cancel"),
    })
    if (!confirmed) return
    reset.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(t("emails.demoData.restored"), {
          description: t("emails.demoData.restoredHint", { count: result.messages, orders: result.orders }),
        }),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-lg border border-ui-tag-blue-border bg-ui-tag-blue-bg px-4 py-3"
    >
      <InformationCircleSolid className="mt-0.5 shrink-0 text-ui-tag-blue-icon" />
      <div className="min-w-0 flex-1">
        <Text size="small" weight="plus" className="text-ui-tag-blue-text">
          {t("emails.demoData.title")}
        </Text>
        <Text size="xsmall" className="text-ui-tag-blue-text">
          {t("emails.demoData.body")}
        </Text>
      </div>
      <Button size="small" variant="secondary" isLoading={reset.isPending} onClick={restore}>
        {t("emails.demoData.reset")}
      </Button>
    </div>
  )
}
