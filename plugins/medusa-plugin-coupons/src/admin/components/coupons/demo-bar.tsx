import { ExclamationCircle } from "@medusajs/icons"
import { Button, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useResetCouponsDemo } from "../../lib/coupons/api"
import { errorMessage } from "../../lib/coupons/kit/format"

/** Shown above the page in demo mode, with "Restore test data". */
export const DemoBar = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const reset = useResetCouponsDemo()

  const restore = async () => {
    const confirmed = await prompt({
      title: t("coupons.demo.resetTitle"),
      description: t("coupons.demo.resetBody"),
      confirmText: t("coupons.demo.reset"),
      cancelText: t("coupons.demo.cancel"),
    })
    if (!confirmed) return
    reset.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(t("coupons.demo.restored"), {
          description: t("coupons.demo.restoredHint", { coupons: result.coupons, codes: result.codes }),
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
          {t("coupons.demo.title")}
        </Text>
        <Text size="xsmall" className="text-ui-tag-orange-text">
          {t("coupons.demo.body")}
        </Text>
      </div>
      <Button size="small" variant="secondary" isLoading={reset.isPending} onClick={restore}>
        {t("coupons.demo.reset")}
      </Button>
    </div>
  )
}
