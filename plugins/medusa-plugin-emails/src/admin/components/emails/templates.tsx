import { Badge, Button, Container, Heading, Skeleton, Switch, Text, toast, Tooltip } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  type EmailAudience,
  type EmailTypeSummary,
  useEmailsSettings,
  useEmailTypes,
  useUpdateEmailType,
} from "../../lib/emails/api"
import { errorMessage } from "../../lib/emails/kit/format"
import { languageName } from "../../lib/emails/languages"
import { useTypeText } from "../../lib/emails/type-text"
import { useEmailConfirm } from "./confirm"

const AUDIENCES: EmailAudience[] = ["customer", "account", "team"]

/** The "Templates" tab: every email type by audience, with its toggle and editor, and the shared labels. */
export const Templates = () => {
  const { t } = useTranslation()
  const settings = useEmailsSettings(true)
  const types = useEmailTypes(true)

  return (
    <div className="flex flex-col gap-y-3">
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
          </Container>
        )
      })}

      <Container className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-x-4 px-6 py-4">
          <div>
            <div className="flex items-center gap-x-2">
              <Text size="small" weight="plus">
                {t("emails.list.sharedTitle")}
              </Text>
              {types.data?.common_edited && <Badge size="2xsmall">{t("emails.list.edited")}</Badge>}
              {(types.data?.common_missing_translations ?? 0) > 0 && (
                <MissingBadge locales={types.data?.common_missing_locales ?? []} />
              )}
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
    </div>
  )
}

/** One email type: name, what triggers it, the on/off toggle and a link to its editor. */
const TypeRow = ({ type, hasRecipients }: { type: EmailTypeSummary; hasRecipients: boolean }) => {
  const { t } = useTranslation()
  const update = useUpdateEmailType(type.type)
  const confirm = useEmailConfirm()
  const text = useTypeText()(type.type, type.labels)

  return (
    <div className="flex items-center justify-between gap-x-4 px-6 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2">
          <Text size="small" weight="plus">
            {text.name}
          </Text>
          {type.custom && (
            <Tooltip content={t("emails.list.customHint")}>
              <Badge size="2xsmall">{text.source ?? t("emails.list.custom")}</Badge>
            </Tooltip>
          )}
          {type.edited && <Badge size="2xsmall">{t("emails.list.edited")}</Badge>}
          {type.missing_translations > 0 && <MissingBadge locales={type.missing_locales} />}
          {type.audience === "team" && type.enabled && !hasRecipients && (
            <Badge size="2xsmall" color="orange">
              {t("emails.list.noRecipients")}
            </Badge>
          )}
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          {text.description}
        </Text>
      </div>
      <div className="flex shrink-0 items-center gap-x-3">
        <Switch
          checked={type.enabled}
          disabled={update.isPending}
          aria-label={text.name}
          onCheckedChange={async (checked) => {
            if (!checked && !(await confirm.disable(text.name))) return
            update.mutate(
              { enabled: checked },
              { onError: (error) => toast.error(`${t("emails.list.toggleError")} ${errorMessage(error)}`) }
            )
          }}
        />
        <Button size="small" variant="secondary" asChild>
          <Link to={`/emails/${type.type}`}>{t("emails.list.edit")}</Link>
        </Button>
      </div>
    </div>
  )
}

/** "Missing translations", with the languages that still miss text in a tooltip. */
const MissingBadge = ({ locales }: { locales: string[] }) => {
  const { t, i18n } = useTranslation()
  const languages = locales.map((code) => languageName(code, locales, i18n.language)).join(", ")
  return (
    <Tooltip content={t("emails.list.missingIn", { languages })}>
      <Badge size="2xsmall">{t("emails.list.missingTranslations")}</Badge>
    </Tooltip>
  )
}
