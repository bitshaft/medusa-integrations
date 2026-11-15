import { CheckCircleSolid, Clock, SquareTwoStack } from "@medusajs/icons"
import { Button, Container, Heading, Skeleton, StatusBadge, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useEmailsGuide } from "../../lib/emails/api"

const STATUS_COLOR = { done: "green", todo: "orange", optional: "grey" } as const

/** Paste into Claude Code, Cursor or another assistant in the Medusa backend project. Kept in English on purpose. */
export const AI_PROMPT = `Install and configure @bitshaft/medusa-plugin-emails in this Medusa v2 project.

1. Run: npm install @bitshaft/medusa-plugin-emails
2. In medusa-config.ts add the plugin to \`plugins\`:
   {
     resolve: "@bitshaft/medusa-plugin-emails",
     options: {
       from: "My Shop <orders@myshop.pl>",          // the store's sender address
       storefrontUrl: process.env.STOREFRONT_URL,
       adminUrl: process.env.MEDUSA_ADMIN_URL,
       team: { recipients: [/* store team addresses for alerts */] },
     },
   }
   and register one sending provider for the "email" channel in the notification module:
   the Resend provider (@bitshaft/medusa-plugin-emails/providers/resend, needs RESEND_API_KEY)
   or the SMTP provider (@bitshaft/medusa-plugin-emails/providers/smtp). See the plugin README.
3. Add RESEND_API_KEY (or SMTP_HOST, SMTP_USER, SMTP_PASSWORD), STOREFRONT_URL and MEDUSA_ADMIN_URL
   to .env.template (empty in .env); never invent or commit a key.
4. Run: npx medusa db:migrate
5. Run the type check and build the project.
Then tell me to open Admin → Emails → Rollout guide, set the look on the Appearance tab and send a test email.`

/** The "Rollout guide" tab: what the plugin does, how it connects, and the steps with their detected status. */
export const Guide = () => {
  const { t } = useTranslation()
  const { data, isLoading } = useEmailsGuide()
  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-col gap-y-3 p-6">
        <Heading level="h2">{t("emails.guide.whatTitle")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("emails.guide.what")}
        </Text>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-ui-bg-subtle p-4">
          {(["events", "plugin", "provider", "inbox"] as const).map((box, index) => (
            <div key={box} className="flex items-center gap-2">
              {index > 0 && (
                <Text size="small" className="text-ui-fg-muted" aria-hidden>
                  →
                </Text>
              )}
              <div
                className={
                  box === "plugin"
                    ? "rounded-md border border-ui-tag-blue-border bg-ui-tag-blue-bg px-3 py-2 text-ui-tag-blue-text"
                    : "rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2"
                }
              >
                <Text size="xsmall" weight="plus">
                  {t(`emails.guide.diagram.${box}`)}
                </Text>
              </div>
            </div>
          ))}
        </div>
      </Container>

      <Container className="flex flex-col gap-y-3 p-6">
        <Heading level="h2">{t("emails.guide.stepsTitle")}</Heading>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <ol className="flex flex-col gap-y-3">
            {(data?.steps ?? []).map((step, index) => (
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
                      {index + 1}. {t(`emails.guide.steps.${step.id}.title`)}
                    </Text>
                    <StatusBadge color={STATUS_COLOR[step.status]}>
                      {t(`emails.guide.status.${step.status}`)}
                    </StatusBadge>
                  </div>
                  <Text size="small" className="text-ui-fg-subtle">
                    {t(`emails.guide.steps.${step.id}.body`, step.params ?? {})}
                  </Text>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Container>

      <Container className="flex flex-col gap-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Heading level="h2">{t("emails.guide.promptTitle")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("emails.guide.promptHint")}
            </Text>
          </div>
          <Button
            size="small"
            variant="secondary"
            onClick={() => navigator.clipboard.writeText(AI_PROMPT).then(() => toast.success(t("emails.guide.copied")))}
          >
            <SquareTwoStack />
            {t("emails.guide.copy")}
          </Button>
        </div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-ui-bg-subtle p-4 font-mono text-xs text-ui-fg-base">
          {AI_PROMPT}
        </pre>
      </Container>
    </div>
  )
}
