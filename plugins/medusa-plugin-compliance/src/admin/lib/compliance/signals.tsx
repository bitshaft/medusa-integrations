import { DocumentText } from "@medusajs/icons"
import { useTranslation } from "react-i18next"

import { useDashboard, useProductSafety, useSettings } from "./api"
import { type Brand, registerSignals } from "./kit/integrations"

/**
 * What Compliance reports on Medusa's pages (kit overview cards): GDPR
 * requests near or past their deadline, and GPSR records.
 */
const brand: Brand = { label: "compliance.title", icon: DocumentText, color: "#0d9488" }

registerSignals("orders", {
  id: "compliance",
  brand,
  order: 70,
  useSignals: () => {
    const { t } = useTranslation()
    const settings = useSettings()
    const on = settings.data?.enabled === true && settings.data.settings.modules.gdpr
    const dashboard = useDashboard()
    const gdpr = on ? dashboard.data?.gdpr : undefined
    if (!gdpr) return []
    if (gdpr.overdue) {
      return [
        {
          key: "overdue",
          level: "error",
          count: gdpr.overdue,
          text: t("compliance.signals.overdue", { count: gdpr.overdue }),
          href: "/compliance?tab=gdpr",
        },
      ]
    }
    if (gdpr.due_soon) {
      return [
        {
          key: "due",
          level: "warn",
          count: gdpr.due_soon,
          text: t("compliance.signals.dueSoon", { count: gdpr.due_soon }),
          href: "/compliance?tab=gdpr",
        },
      ]
    }
    return []
  },
})

registerSignals("catalog", {
  id: "compliance",
  brand,
  order: 30,
  useSignals: () => {
    const { t } = useTranslation()
    const settings = useSettings()
    const on = settings.data?.enabled === true && settings.data.settings.modules.gpsr
    const dashboard = useDashboard()
    const incomplete = on ? (dashboard.data?.gpsr.incomplete ?? 0) : 0
    if (!incomplete) return []
    return [
      {
        key: "gpsr",
        level: "warn",
        count: incomplete,
        text: t("compliance.signals.gpsrIncomplete", { count: incomplete }),
        href: "/compliance?tab=gpsr",
      },
    ]
  },
})

registerSignals("product", {
  id: "compliance",
  brand,
  order: 30,
  useSignals: ({ product }) => {
    const { t } = useTranslation()
    const settings = useSettings()
    const on = settings.data?.enabled === true && settings.data.settings.modules.gpsr
    const safety = useProductSafety(product?.id ?? "", on && Boolean(product?.id))
    if (!on || !safety.data) return []
    const gaps = safety.data.gaps.length
    return [
      gaps
        ? {
            key: "gpsr",
            level: "warn",
            count: gaps,
            row: true,
            text: t("compliance.signals.gpsrGaps", { count: gaps }),
          }
        : { key: "gpsr", level: "ok", row: true, text: t("compliance.signals.gpsrComplete") },
    ]
  },
})
