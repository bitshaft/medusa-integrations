import { useTranslation } from "react-i18next"

import { useDisputes, useStatus } from "./api"
import { type Brand, registerSignals } from "./kit/integrations"
import stripeLogo from "./stripe-logo.png"

/** What Stripe reports on Medusa's order list (kit overview card): open disputes. */
const brand: Brand = { label: "Stripe", logo: stripeLogo, logoFill: true }

registerSignals("orders", {
  id: "stripe",
  brand,
  order: 10,
  useSignals: () => {
    const { t } = useTranslation()
    const enabled = useStatus().data?.enabled === true
    const disputes = useDisputes(enabled)
    const list = disputes.data?.disputes ?? []
    if (!enabled || !list.length) return []
    const urgent = list.filter((d) => d.urgent).length
    return [
      {
        key: "disputes",
        level: urgent ? "error" : "warn",
        count: list.length,
        text: t("stripe.signals.disputes", { count: list.length }),
        href: "/stripe",
      },
    ]
  },
})
