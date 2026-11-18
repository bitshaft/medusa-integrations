import { ExclamationCircle } from "@medusajs/icons"
import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useApaczkaStatus } from "../../lib/apaczka/api"

/** Shown above the page in demo mode: nothing here comes from Apaczka. */
export const DemoBar = () => {
  const { t } = useTranslation()
  const status = useApaczkaStatus()
  if (!status.data?.enabled || !status.data.demo) {
    return null
  }
  return (
    <div
      role="status"
      className="flex items-start gap-x-3 rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg px-4 py-3"
    >
      <ExclamationCircle className="mt-0.5 shrink-0 text-ui-tag-orange-icon" />
      <div>
        <Text size="small" weight="plus" className="text-ui-tag-orange-text">
          {t("apaczka.demo.title")}
        </Text>
        <Text size="xsmall" className="text-ui-tag-orange-text">
          {t("apaczka.demo.body")}
        </Text>
      </div>
    </div>
  )
}
