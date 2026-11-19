import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ThreadList } from "../../components/negotiations/thread-list"
import { useSettings, useThreads } from "./api"
import { registerTab } from "./kit/integrations"

/** The Negotiations tab of the product page's Integrations card: threads about the product (cart threads too). */
registerTab("product", {
  id: "negotiations",
  brand: { label: "negotiations.title", icon: ChatBubbleLeftRight, color: "#0891b2" },
  order: 50,
  useState: (product) => {
    const settings = useSettings()
    const enabled = settings.data?.enabled === true
    const threads = useThreads({ product_id: product.id, limit: 1 }, { enabled })
    if (!enabled || !threads.data?.count)
      return { visible: false, level: "none", loading: settings.isLoading || threads.isLoading }
    const waiting = threads.data.counts.waiting ?? 0
    const active = (threads.data.counts.open ?? 0) + (threads.data.counts.countered ?? 0)
    return { visible: true, level: waiting ? "warn" : active ? "info" : "none" }
  },
  Panel: ({ entity }) => <ProductThreads productId={entity.id} />,
})

const ProductThreads = ({ productId }: { productId: string }) => {
  const { t } = useTranslation()
  return (
    <div className="pb-2">
      <Text size="small" className="text-ui-fg-subtle px-6 pt-4">
        {t("negotiations.widgets.productHint")}
      </Text>
      <div className="pt-2">
        <ThreadList fixed={{ product_id: productId }} compact />
      </div>
    </div>
  )
}
