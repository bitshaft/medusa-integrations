import { BellAlert } from "@medusajs/icons"
import { useTranslation } from "react-i18next"

import { useBackInStockStatus, useProductWaiting, useWanted } from "./api"
import { type Brand, registerSignals } from "./kit/integrations"

/** What Back in stock reports on Medusa's pages (kit overview cards): customers waiting for products. */
const brand: Brand = { label: "back-in-stock.title", icon: BellAlert, color: "#7c3aed" }

const useEnabled = () => useBackInStockStatus().data?.enabled === true

registerSignals("catalog", {
  id: "back-in-stock",
  brand,
  order: 40,
  useSignals: () => {
    const { t } = useTranslation()
    const enabled = useEnabled()
    const wanted = useWanted({ limit: 1, offset: 0 }, enabled)
    const count = wanted.data?.count ?? 0
    if (!enabled || !count) return []
    return [
      {
        key: "wanted",
        level: "info",
        count,
        text: t("back-in-stock.signals.wanted", { count }),
        href: "/back-in-stock",
      },
    ]
  },
})

registerSignals("product", {
  id: "back-in-stock",
  brand,
  order: 40,
  useSignals: ({ product }) => {
    const { t } = useTranslation()
    const enabled = useEnabled()
    const waiting = useProductWaiting(product?.id ?? "", enabled && Boolean(product?.id))
    const count = (waiting.data?.variants ?? []).reduce((sum, v) => sum + v.waiting, 0)
    if (!enabled || !count) return []
    return [
      {
        key: "waiting",
        level: "info",
        count,
        text: t("back-in-stock.signals.waiting", { count }),
        href: "/back-in-stock",
      },
    ]
  },
})
