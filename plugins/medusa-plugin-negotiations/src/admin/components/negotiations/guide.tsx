import { SquareTwoStack } from "@medusajs/icons"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useGuide } from "../../lib/negotiations/api"
import { SetupSteps } from "../../lib/negotiations/kit/setup"

/** Paste into Claude Code, Cursor or another assistant in the Medusa backend project. Kept in English on purpose. */
export const AI_PROMPT = `Install and configure @bitshaft/medusa-plugin-negotiations in this Medusa v2 project.

1. Run: npm install @bitshaft/medusa-plugin-negotiations
2. In medusa-config.ts add to \`plugins\`:
   {
     resolve: "@bitshaft/medusa-plugin-negotiations",
     options: {
       expiryDays: 14,
       allowedCustomerGroups: [/* B2B customer group ids or names; empty = every signed-in customer */],
       writers: { draftOrders: false, cart: false },
     },
   }
3. Run: npx medusa db:migrate
4. In the storefront, for signed-in customers, add "Ask for a price" on the product page
   (POST /store/negotiations with kind "product", variant_id, quantity, target_unit_price in minor units)
   and on the cart page (kind "cart", cart_id, target_total), plus an account page listing
   GET /store/negotiations with a thread view (messages, accept, withdraw, add to cart).
   Prices are integers in the smallest currency unit (grosze). Send the version you showed with every move;
   on 409 show the returned negotiation instead.
5. Subscribe to negotiation.* events for e-mails; use only the payload's "customer" field in customer e-mails.
Then tell me to open Admin → Negotiations → Rollout guide.`

/** The "Guide" tab: what the plugin does, how it connects, and the installation steps with their detected status. */
export const Guide = () => {
  const { t } = useTranslation()
  const { data, isLoading } = useGuide()
  return (
    <div className="flex flex-col gap-y-3">
      <Container className="overflow-hidden flex flex-col gap-y-3 p-6">
        <Heading level="h2">{t("negotiations.guide.whatTitle")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("negotiations.guide.what")}
        </Text>
        <Diagram />
      </Container>

      <SetupSteps
        steps={data?.steps}
        loading={isLoading}
        text={(id, part, params) => t(`negotiations.setup.${id}.${part}`, params)}
      />

      <Container className="overflow-hidden flex flex-col gap-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Heading level="h2">{t("negotiations.guide.promptTitle")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("negotiations.guide.promptHint")}
            </Text>
          </div>
          <Button
            size="small"
            variant="secondary"
            onClick={() =>
              navigator.clipboard.writeText(AI_PROMPT).then(() => toast.success(t("negotiations.guide.copied")))
            }
          >
            <SquareTwoStack />
            {t("negotiations.guide.copy")}
          </Button>
        </div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-ui-bg-subtle p-4 font-mono text-xs text-ui-fg-base">
          {AI_PROMPT}
        </pre>
      </Container>
    </div>
  )
}

const Box = ({ children, accent }: { children: string; accent?: boolean }) => (
  <div
    className={`rounded-md border px-3 py-2 text-center ${accent ? "border-ui-tag-blue-border bg-ui-tag-blue-bg text-ui-tag-blue-text" : "border-ui-border-base bg-ui-bg-base"}`}
  >
    <Text size="xsmall" weight="plus">
      {children}
    </Text>
  </div>
)

const Arrow = () => (
  <Text size="small" className="text-ui-fg-muted" aria-hidden>
    →
  </Text>
)

const Diagram = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-y-3 rounded-lg bg-ui-bg-subtle p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Box>{t("negotiations.guide.diagram.store")}</Box>
        <Arrow />
        <Box>Store API</Box>
        <Arrow />
        <Box accent>{t("negotiations.guide.diagram.plugin")}</Box>
        <Arrow />
        <Box>Admin API</Box>
        <Arrow />
        <Box>{t("negotiations.guide.diagram.panel")}</Box>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Box accent>{t("negotiations.guide.diagram.plugin")}</Box>
        <Arrow />
        <Box>{t("negotiations.guide.diagram.events")}</Box>
        <Arrow />
        <Box>{t("negotiations.guide.diagram.consumers")}</Box>
      </div>
    </div>
  )
}
