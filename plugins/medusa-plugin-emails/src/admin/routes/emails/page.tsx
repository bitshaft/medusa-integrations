import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Envelope } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Skeleton,
  StatusBadge,
  Switch,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { formatRecipients, parseRecipients } from "../../components/emails/recipients"
import {
  type EmailAudience,
  type EmailsGeneralSettings,
  type EmailTypeSummary,
  useEmailsSettings,
  useEmailsStatus,
  useEmailTypes,
  useResetAllEmails,
  useUpdateEmailsSettings,
  useUpdateEmailType,
} from "../../lib/emails/api"
import { errorMessage } from "../../lib/emails/kit/format"
import { navIcon } from "../../lib/emails/kit/nav-icon"

const AUDIENCES: EmailAudience[] = ["customer", "account", "team"]

const EmailsSettingsPage = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const status = useEmailsStatus()
  const s = status.data
  const enabled = s?.enabled === true
  const settings = useEmailsSettings(enabled)
  const types = useEmailTypes(enabled)
  const resetAll = useResetAllEmails()

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
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("emails.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("emails.description")}
            </Text>
          </div>
          {enabled && (
            <div className="flex items-center gap-x-2">
              <Button size="small" variant="secondary" asChild>
                <Link to="/emails/log">{t("emails.log.open")}</Link>
              </Button>
              <Button size="small" variant="danger" isLoading={resetAll.isPending} onClick={onResetAll}>
                {t("emails.reset.everything")}
              </Button>
            </div>
          )}
        </div>

        {status.isLoading && (
          <div className="px-6 py-4">
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {status.isError && (
          <Text size="small" className="text-ui-fg-error px-6 py-4">
            {t("emails.loadError")}
          </Text>
        )}

        {s && !s.enabled && (
          <Section title={t("emails.status.title")}>
            <Row label={t("emails.status.state")}>
              <StatusBadge color="orange">{t("emails.status.disabled")}</StatusBadge>
            </Row>
            <div className="py-2">
              <Text size="small" className="text-ui-fg-error">
                {s.disabled_reason}
              </Text>
              <Text size="small" className="text-ui-fg-subtle mt-1">
                {t("emails.status.disabledHint")}
              </Text>
            </div>
            <Row label={t("emails.status.version")}>
              <Text size="small">{s.version}</Text>
            </Row>
          </Section>
        )}

        {s?.enabled && (
          <Section title={t("emails.status.title")}>
            <Row label={t("emails.status.state")}>
              {s.demo ? (
                <StatusBadge color="blue">{t("emails.status.demo")}</StatusBadge>
              ) : (
                <StatusBadge color="green">{t("emails.status.enabled")}</StatusBadge>
              )}
            </Row>
            {s.demo && <Note>{t("emails.status.demoHint")}</Note>}
            <Row label={t("emails.status.sender")}>
              <Text size="small">{s.from}</Text>
            </Row>
            {s.reply_to && (
              <Row label={t("emails.status.replyTo")}>
                <Text size="small">{s.reply_to}</Text>
              </Row>
            )}
            <Row label={t("emails.status.defaultLanguage")}>
              <Text size="small">{t(`emails.locale.${s.default_locale}`)}</Text>
            </Row>
            <Row label={t("emails.status.version")}>
              <Text size="small">{s.version}</Text>
            </Row>
            {!s.storefront_url && <Note>{t("emails.status.storefrontMissing")}</Note>}
            {!s.admin_url && <Note>{t("emails.status.adminMissing")}</Note>}
          </Section>
        )}
      </Container>

      {enabled && (
        <>
          {AUDIENCES.map((audience) => {
            const list = (types.data?.types ?? []).filter((type) => type.audience === audience)
            if (!types.isLoading && !list.length) {
              return null
            }
            return (
              <Container key={audience} className="divide-y p-0">
                <div className="px-6 py-4">
                  <Heading level="h2">{t(`emails.audience.${audience}`)}</Heading>
                </div>
                {types.isLoading && (
                  <div className="px-6 py-4">
                    <Skeleton className="h-16 w-full" />
                  </div>
                )}
                {list.map((type) => (
                  <TypeRow
                    key={type.type}
                    type={type}
                    hasRecipients={
                      Boolean(type.recipients?.length) || Boolean(settings.data?.settings.team_recipients.length)
                    }
                  />
                ))}
                {audience === "team" && settings.data && <GeneralSettings settings={settings.data.settings} />}
              </Container>
            )
          })}

          <Container className="p-0">
            <div className="flex items-center justify-between gap-x-4 px-6 py-4">
              <div>
                <div className="flex items-center gap-x-2">
                  <Text size="small" weight="plus">
                    {t("emails.list.sharedTitle")}
                  </Text>
                  {types.data?.common_edited && <Badge size="2xsmall">{t("emails.list.edited")}</Badge>}
                </div>
                <Text size="small" className="text-ui-fg-subtle">
                  {t("emails.list.sharedDescription")}
                </Text>
              </div>
              <Button size="small" variant="secondary" asChild>
                <Link to="/emails/common">{t("emails.list.edit")}</Link>
              </Button>
            </div>
          </Container>
        </>
      )}
    </div>
  )
}

/** One email type: name, what triggers it, the on/off toggle and a link to its editor. */
const TypeRow = ({ type, hasRecipients }: { type: EmailTypeSummary; hasRecipients: boolean }) => {
  const { t } = useTranslation()
  const update = useUpdateEmailType(type.type)

  return (
    <div className="flex items-center justify-between gap-x-4 px-6 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2">
          <Text size="small" weight="plus">
            {t(`emails.types.${type.type}.name`, { defaultValue: type.type })}
          </Text>
          {type.custom && <Badge size="2xsmall">{t("emails.list.custom")}</Badge>}
          {type.edited && <Badge size="2xsmall">{t("emails.list.edited")}</Badge>}
          {type.audience === "team" && type.enabled && !hasRecipients && (
            <Badge size="2xsmall" color="orange">
              {t("emails.list.noRecipients")}
            </Badge>
          )}
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          {t(`emails.types.${type.type}.description`, { defaultValue: "" })}
        </Text>
      </div>
      <div className="flex shrink-0 items-center gap-x-3">
        <Switch
          checked={type.enabled}
          disabled={update.isPending}
          aria-label={t(`emails.types.${type.type}.name`, { defaultValue: type.type })}
          onCheckedChange={(checked) =>
            update.mutate(
              { enabled: checked },
              { onError: (error) => toast.error(`${t("emails.list.toggleError")} ${errorMessage(error)}`) }
            )
          }
        />
        <Button size="small" variant="secondary" asChild>
          <Link to={`/emails/${type.type}`}>{t("emails.list.edit")}</Link>
        </Button>
      </div>
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

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="px-6 py-4">
    <Text size="small" weight="plus" className="mb-2">
      {title}
    </Text>
    <div className="flex flex-col">{children}</div>
  </div>
)

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-2 items-center gap-x-4 py-1.5">
    <Text size="small" className="text-ui-fg-subtle">
      {label}
    </Text>
    <div className="flex items-center gap-x-2">{children}</div>
  </div>
)

const Note = ({ children }: { children: ReactNode }) => (
  <Text size="small" className="text-ui-fg-subtle py-1.5">
    {children}
  </Text>
)

export const config = defineRouteConfig({
  label: "Emails",
  icon: navIcon(Envelope, "#2563eb"),
})

export default EmailsSettingsPage
