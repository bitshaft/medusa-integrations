import { ChatBubbleLeftRight } from "@medusajs/icons"
import { useTranslation } from "react-i18next"

import { useSettings, useStats, useThreads } from "./api"
import { type Brand, registerSignals } from "./kit/integrations"

/**
 * What Negotiations reports on Medusa's pages (kit overview cards): price
 * requests waiting for the team. Imported for its side effects by the
 * plugin's overview widgets.
 */
const brand: Brand = { label: "negotiations.title", icon: ChatBubbleLeftRight, color: "#0891b2" }

const useWaiting = () => {
  const settings = useSettings()
  const enabled = settings.data?.enabled === true
  const stats = useStats()
  return enabled ? (stats.data?.stats.waiting ?? null) : null
}

registerSignals("orders", {
  id: "negotiations",
  brand,
  order: 50,
  useSignals: () => {
    const { t } = useTranslation()
    const waiting = useWaiting()
    if (waiting === null) return []
    return [
      {
        key: "waiting",
        level: waiting ? "warn" : "none",
        count: waiting,
        text: t("negotiations.signals.waiting", { count: waiting }),
        href: "/negotiations",
        tile: { label: t("negotiations.signals.tile"), hint: t("negotiations.signals.tileHint") },
      },
    ]
  },
})

registerSignals("catalog", {
  id: "negotiations",
  brand,
  order: 50,
  useSignals: () => {
    const { t } = useTranslation()
    const waiting = useWaiting()
    if (!waiting) return []
    return [
      {
        key: "waiting",
        level: "warn",
        count: waiting,
        text: t("negotiations.signals.waiting", { count: waiting }),
        href: "/negotiations",
      },
    ]
  },
})

registerSignals("product", {
  id: "negotiations",
  brand,
  order: 50,
  useSignals: ({ product }) => {
    const { t } = useTranslation()
    const settings = useSettings()
    const enabled = settings.data?.enabled === true && Boolean(product?.id)
    const all = useThreads({ product_id: product?.id, limit: 1 }, { enabled })
    if (!enabled || !all.data?.count) return []
    const waiting = all.data.counts.waiting ?? 0
    const active = (all.data.counts.open ?? 0) + (all.data.counts.countered ?? 0)
    return [
      waiting
        ? {
            key: "waiting",
            level: "warn",
            count: waiting,
            text: t("negotiations.signals.waiting", { count: waiting }),
            href: "/negotiations",
          }
        : active
          ? {
              key: "active",
              level: "info",
              count: active,
              text: t("negotiations.signals.active", { count: active }),
              href: "/negotiations",
            }
          : {
              key: "past",
              level: "none",
              count: all.data.count,
              text: t("negotiations.signals.past", { count: all.data.count }),
              href: "/negotiations",
            },
    ]
  },
})
