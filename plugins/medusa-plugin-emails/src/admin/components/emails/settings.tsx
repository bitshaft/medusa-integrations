import { Button, Container, Heading, Input, Label, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type EmailsGeneralSettings,
  type EmailsStatus,
  useEmailsSettings,
  useResetAllEmails,
  useUpdateEmailsSettings,
} from "../../lib/emails/api"
import { errorMessage } from "../../lib/emails/kit/format"
import { OptionsCard } from "../../lib/emails/kit/page"
import { languageName } from "../../lib/emails/languages"
import { formatRecipients, parseRecipients } from "./recipients"

/** The "Settings" tab: how the plugin is configured, store team recipients, the low stock threshold, reset. */
export const Settings = ({ status }: { status: Extract<EmailsStatus, { enabled: true }> }) => {
  const { t, i18n } = useTranslation()
  const prompt = usePrompt()
  const settings = useEmailsSettings(true)
  const resetAll = useResetAllEmails()
  const s = status

  const onResetAll = async () => {
    const confirmed = await prompt({
      title: t("emails.reset.everythingTitle"),
      description: t("emails.reset.everythingDescription"),
      verificationText: "RESET",
      confirmText: t("emails.reset.confirm"),
      cancelText: t("emails.reset.cancel"),
      variant: "danger",
    })
    if (!confirmed) {
      return
    }
    resetAll.mutate(undefined, {
      onSuccess: () => toast.success(t("emails.reset.done")),
      onError: (error) => toast.error(`${t("emails.reset.error")} ${errorMessage(error)}`),
    })
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="overflow-hidden divide-y p-0">
        {(!s.storefront_url || !s.admin_url) && (
          <div className="flex flex-col gap-y-2 px-6 py-4">
            {!s.storefront_url && <Note>{t("emails.status.storefrontMissing")}</Note>}
            {!s.admin_url && <Note>{t("emails.status.adminMissing")}</Note>}
          </div>
        )}
        {settings.data && <GeneralSettings settings={settings.data.settings} />}
      </Container>

      <Container className="overflow-hidden flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">{t("emails.reset.everything")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("emails.reset.everythingDescription")}
          </Text>
        </div>
        <Button size="small" variant="danger" isLoading={resetAll.isPending} onClick={onResetAll}>
          {t("emails.reset.everything")}
        </Button>
      </Container>

      <OptionsCard
        version={s.version}
        rows={[
          ["from", s.from],
          ["replyTo", s.reply_to],
          ["channel", s.channel],
          ["defaultLocale", languageName(s.default_locale, s.locales, i18n.language)],
          ["storefrontUrl", s.storefront_url],
          ["adminUrl", s.admin_url],
          ["retries.maxAttempts", s.max_attempts],
          ["demo", s.demo],
        ]}
      />
    </div>
  )
}

/** Store team recipients and the low stock threshold. */
const GeneralSettings = ({ settings }: { settings: EmailsGeneralSettings }) => {
  const { t } = useTranslation()
  const update = useUpdateEmailsSettings()
  const [recipients, setRecipients] = useState(formatRecipients(settings.team_recipients))
  const [threshold, setThreshold] = useState(String(settings.low_stock_threshold))

  useEffect(() => {
    setRecipients(formatRecipients(settings.team_recipients))
    setThreshold(String(settings.low_stock_threshold))
  }, [settings])

  const parsed = parseRecipients(recipients)
  const thresholdValue = Number(threshold)
  const thresholdValid = threshold.trim() !== "" && Number.isInteger(thresholdValue) && thresholdValue >= 0
  const dirty =
    formatRecipients(parsed.valid) !== formatRecipients(settings.team_recipients) ||
    (thresholdValid && thresholdValue !== settings.low_stock_threshold)

  const save = (body: Parameters<typeof update.mutate>[0]) =>
    update.mutate(body, {
      onSuccess: () => toast.success(t("emails.general.saved")),
      onError: (error) => toast.error(`${t("emails.general.saveError")} ${errorMessage(error)}`),
    })

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4">
      <div>
        <Text size="small" weight="plus">
          {t("emails.general.title")}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {t("emails.general.description")}
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-y-1">
          <Label size="small" htmlFor="emails-team-recipients">
            {t("emails.general.recipients")}
          </Label>
          <Textarea
            id="emails-team-recipients"
            rows={3}
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
          />
          <Text size="xsmall" className={parsed.invalid.length ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
            {parsed.invalid.length
              ? t("emails.general.recipientsInvalid", { addresses: parsed.invalid.join(", ") })
              : t("emails.general.recipientsHint")}
          </Text>
          <DefaultState
            overridden={settings.team_recipients_overridden}
            onRestore={() => save({ team_recipients: null })}
          />
        </div>

        <div className="flex flex-col gap-y-1">
          <Label size="small" htmlFor="emails-low-stock-threshold">
            {t("emails.general.threshold")}
          </Label>
          <Input
            id="emails-low-stock-threshold"
            type="number"
            min={0}
            step={1}
            value={threshold}
            aria-invalid={!thresholdValid}
            onChange={(event) => setThreshold(event.target.value)}
          />
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("emails.general.thresholdHint")}
          </Text>
          <DefaultState
            overridden={settings.low_stock_threshold_overridden}
            onRestore={() => save({ low_stock_threshold: null })}
          />
        </div>
      </div>

      <div>
        <Button
          size="small"
          disabled={!dirty || parsed.invalid.length > 0 || !thresholdValid}
          isLoading={update.isPending}
          onClick={() => save({ team_recipients: parsed.valid, low_stock_threshold: thresholdValue })}
        >
          {t("emails.general.save")}
        </Button>
      </div>
    </div>
  )
}

const DefaultState = ({ overridden, onRestore }: { overridden: boolean; onRestore: () => void }) => {
  const { t } = useTranslation()
  return overridden ? (
    <div>
      <Button size="small" variant="transparent" onClick={onRestore}>
        {t("emails.general.restoreDefault")}
      </Button>
    </div>
  ) : (
    <Text size="xsmall" className="text-ui-fg-muted">
      {t("emails.general.usingDefault")}
    </Text>
  )
}

const Note = ({ children }: { children: ReactNode }) => (
  <Text size="small" className="text-ui-fg-subtle py-1.5">
    {children}
  </Text>
)
