import { useTranslation } from "react-i18next"

import { useApaczkaStatus, useShipments, useVariantsWithoutWeight } from "./api"
import apaczkaLogo from "./apaczka-logo.png"
import { type Brand, registerSignals } from "./kit/integrations"

/**
 * What Apaczka reports on Medusa's pages (kit overview cards): shipments
 * still to create, and products without a weight.
 */
const brand: Brand = { label: "Apaczka", logo: apaczkaLogo }

const useEnabled = () => useApaczkaStatus().data?.enabled === true

registerSignals("orders", {
  id: "apaczka",
  brand,
  order: 20,
  useSignals: () => {
    const { t } = useTranslation()
    const enabled = useEnabled()
    const pending = useShipments({ status: "pending", limit: 1, offset: 0 })
    const count = pending.data?.count ?? 0
    if (!enabled || !count) return []
    return [{ key: "pending", level: "warn", count, text: t("apaczka.signals.pending", { count }), href: "/apaczka" }]
  },
})

registerSignals("catalog", {
  id: "apaczka",
  brand,
  order: 20,
  useSignals: () => {
    const { t } = useTranslation()
    const enabled = useEnabled()
    const missing = useVariantsWithoutWeight(0, enabled)
    const count = missing.data?.count ?? 0
    if (!enabled || !count) return []
    return [{ key: "weight", level: "warn", count, text: t("apaczka.signals.noWeight", { count }), href: "/apaczka" }]
  },
})

registerSignals("product", {
  id: "apaczka",
  brand,
  order: 20,
  useSignals: ({ product }) => {
    const { t } = useTranslation()
    const enabled = useEnabled()
    const variants = ((product?.variants ?? []) as Array<{ weight?: number | null } | null>).filter(Boolean)
    const count = variants.filter((v) => !(typeof v!.weight === "number" && v!.weight > 0)).length
    if (!enabled || !count) return []
    return [{ key: "weight", level: "warn", count, row: true, text: t("apaczka.signals.variantsNoWeight", { count }) }]
  },
})
