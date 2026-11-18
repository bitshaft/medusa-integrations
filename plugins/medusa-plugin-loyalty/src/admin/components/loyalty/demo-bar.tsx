import { ExclamationCircle } from "@medusajs/icons"
import { Button, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useResetDemo } from "../../lib/loyalty/api"
import { errorMessage } from "../../lib/loyalty/kit/format"

/** Shown above the page in demo mode, with "Restore test data". */
export const DemoBar = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const reset = useResetDemo()

  const restore = async () => {
    const confirmed = await prompt({
      title: t("loyalty.demo.resetTitle"),
      description: t("loyalty.demo.resetBody"),
      confirmText: t("loyalty.demo.reset"),
      cancelText: t("loyalty.demo.cancel"),
    })
    if (!confirmed) return
    reset.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(t("loyalty.demo.restored"), {
          description: t("loyalty.demo.restoredHint", { customers: result.customers, entries: result.entries }),
        }),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg px-4 py-3"
    >
      <ExclamationCircle className="mt-0.5 shrink-0 text-ui-tag-orange-icon" />
      <div className="min-w-0 flex-1">
        <Text size="small" weight="plus" className="text-ui-tag-orange-text">
          {t("loyalty.demo.title")}
        </Text>
        <Text size="xsmall" className="text-ui-tag-orange-text">
          {t("loyalty.demo.body")}
        </Text>
      </div>
      <Button size="small" variant="secondary" isLoading={reset.isPending} onClick={restore}>
        {t("loyalty.demo.reset")}
      </Button>
    </div>
  )
}
