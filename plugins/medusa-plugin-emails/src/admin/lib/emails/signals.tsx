import { Envelope } from "@medusajs/icons"
import { useTranslation } from "react-i18next"

import { useEmailMessages, useEmailsStatus } from "./api"
import { type Brand, registerSignals } from "./kit/integrations"

/** What Emails reports on Medusa's order list (kit overview card): emails that failed to send. */
const brand: Brand = { label: "emails.title", icon: Envelope, color: "#2563eb" }

registerSignals("orders", {
  id: "emails",
  brand,
  order: 60,
  useSignals: () => {
    const { t } = useTranslation()
    const status = useEmailsStatus()
    const enabled = status.data?.enabled === true
    const failed = useEmailMessages({ status: "failed", limit: 1, offset: 0 }, enabled)
    const count = failed.data?.count ?? 0
    if (!enabled || !count) return []
    return [{ key: "failed", level: "error", count, text: t("emails.signals.failed", { count }), href: "/emails" }]
  },
})
