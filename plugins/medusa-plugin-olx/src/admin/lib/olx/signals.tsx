import { useTranslation } from "react-i18next"

import { useOlxStatus, useProductState } from "./api"
import { registerSignals } from "./kit/integrations"
import { brand } from "./product-tab"

/** What OLX reports on Medusa's pages: live adverts, and those that need attention. */
registerSignals("catalog", {
  id: "olx",
  brand,
  order: 45,
  useSignals: () => {
    const { t } = useTranslation()
    const status = useOlxStatus().data
    if (!status?.enabled) return []
    const counts = status.counts
    const live = (counts.active ?? 0) + (counts.new ?? 0)
    const problems = (counts.failed ?? 0) + (counts.blocked ?? 0) + (counts.removed_by_moderator ?? 0)
    return [
      ...(live ? [{ key: "live", level: "ok" as const, count: live, text: t("olx.signals.live"), href: "/olx" }] : []),
      ...(problems
        ? [{ key: "problems", level: "error" as const, count: problems, text: t("olx.signals.problems"), href: "/olx" }]
        : []),
    ]
  },
})

registerSignals("product", {
  id: "olx",
  brand,
  order: 45,
  useSignals: ({ product }) => {
    const { t } = useTranslation()
    const enabled = useOlxStatus().data?.enabled === true
    const state = useProductState(product?.id, enabled)
    if (!enabled) return []
    const adverts = (state.data?.variants ?? []).flatMap((variant) => (variant.advert ? [variant.advert] : []))
    const live = adverts.filter((advert) => advert.status === "active" || advert.status === "new").length
    const failed = adverts.filter((advert) => advert.status === "failed").length
    return [
      ...(live ? [{ key: "live", level: "ok" as const, count: live, text: t("olx.signals.live") }] : []),
      ...(failed ? [{ key: "failed", level: "error" as const, count: failed, text: t("olx.signals.problems") }] : []),
    ]
  },
})
