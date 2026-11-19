import { useTranslation } from "react-i18next"

import { useCurrencyStatus, useProductPrices } from "./api"
import { registerSignals } from "./kit/integrations"
import { brand } from "./product-tab"

/** What Currencies reports on Medusa's pages (kit overview cards): a product missing prices in a currency. */
registerSignals("product", {
  id: "currency",
  brand,
  order: 35,
  useSignals: ({ product }) => {
    const { t } = useTranslation()
    const enabled = useCurrencyStatus().data?.enabled === true
    const prices = useProductPrices(enabled ? product?.id : null)
    const missing = Object.entries(prices.data?.missing ?? {}).filter(([, count]) => count > 0)
    if (!enabled || !missing.length) return []
    return missing.map(([code, count]) => ({
      key: `missing-${code}`,
      level: "warn" as const,
      count,
      text: t("currency.signals.missing", { count, code: code.toUpperCase() }),
    }))
  },
})
