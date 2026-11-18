import { ShieldCheck } from "@medusajs/icons"
import { useTranslation } from "react-i18next"

import { useSubjects, useWhitelistVatStatus } from "./api"
import { type Brand, registerSignals } from "./kit/integrations"

/** What the VAT white list reports on Medusa's order list (kit overview card): businesses with a problem. */
const brand: Brand = { label: "whitelist-vat.title", icon: ShieldCheck, color: "#16a34a" }

registerSignals("orders", {
  id: "whitelist-vat",
  brand,
  order: 80,
  useSignals: () => {
    const { t } = useTranslation()
    const enabled = useWhitelistVatStatus().data?.enabled === true
    const problems = useSubjects({ filter: "problem", limit: 1, offset: 0 }, enabled)
    const count = problems.data?.count ?? 0
    if (!enabled || !count) return []
    return [
      {
        key: "problem",
        level: "error",
        count,
        text: t("whitelist-vat.signals.problem", { count }),
        href: "/whitelist-vat",
      },
    ]
  },
})
