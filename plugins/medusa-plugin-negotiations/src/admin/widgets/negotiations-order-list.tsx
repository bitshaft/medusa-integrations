import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Button, Container, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useSettings, useStats } from "../lib/negotiations/api"
import { totals } from "../lib/negotiations/format"

/** Above the order list: negotiations waiting for the team, and what is being negotiated. */
const OrderListNegotiationsWidget = () => {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const enabled = Boolean(settings.data?.enabled)
  const stats = useStats()
  const s = stats.data?.stats
  if (!enabled || !s || (!s.waiting && !s.open && !s.countered)) return null
  return (
    <Container className="overflow-hidden flex flex-wrap items-center justify-between gap-3 px-6 py-3">
      <div className="flex items-center gap-x-3">
        <ChatBubbleLeftRight className="text-ui-fg-interactive" />
        <Text size="small">
          {t("negotiations.widgets.orders", {
            waiting: s.waiting,
            active: s.open + s.countered,
            value: totals(s.in_talks, i18n.language),
          })}
        </Text>
      </div>
      <Button size="small" variant="secondary" asChild>
        <Link to="/negotiations">{t("negotiations.widgets.open")}</Link>
      </Button>
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "order.list.before" })

export default OrderListNegotiationsWidget
