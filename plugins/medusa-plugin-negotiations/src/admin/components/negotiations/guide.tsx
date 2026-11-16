import { CheckCircleSolid, Clock, SquareTwoStack } from "@medusajs/icons"
import { Button, Container, Heading, Skeleton, StatusBadge, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useGuide } from "../../lib/negotiations/api"

const STATUS_COLOR = { done: "green", todo: "orange", optional: "grey" } as const

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

/** The "Rollout guide" tab: what the plugin does, how it connects, and the steps with their detected status. */
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

      <Container className="overflow-hidden flex flex-col gap-y-3 p-6">
        <Heading level="h2">{t("negotiations.guide.stepsTitle")}</Heading>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <ol className="flex flex-col gap-y-3">
            {(data?.steps ?? []).map((step, i) => (
              <li key={step.id} className="flex items-start gap-x-3 rounded-lg border border-ui-border-base px-4 py-3">
                <span className="mt-0.5 shrink-0">
                  {step.status === "done" ? (
                    <CheckCircleSolid className="text-ui-tag-green-icon" />
                  ) : (
                    <Clock className="text-ui-fg-muted" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text size="small" weight="plus">
                      {i + 1}. {t(`negotiations.guide.steps.${step.id}.title`)}
                    </Text>
                    <StatusBadge color={STATUS_COLOR[step.status]}>
                      {t(`negotiations.guide.status.${step.status}`)}
                    </StatusBadge>
                  </div>
                  <Text size="small" className="text-ui-fg-subtle">
                    {t(`negotiations.guide.steps.${step.id}.body`, step.params ?? {})}
                  </Text>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Container>

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
