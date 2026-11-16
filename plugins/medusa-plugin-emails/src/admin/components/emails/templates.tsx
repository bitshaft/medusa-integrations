import { Badge, Button, Container, Heading, Skeleton, Switch, Text, toast } from "@medusajs/ui"
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
                <Badge size="2xsmall">{t("emails.list.missingTranslations")}</Badge>
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

  return (
    <div className="flex items-center justify-between gap-x-4 px-6 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2">
          <Text size="small" weight="plus">
            {t(`emails.types.${type.type}.name`, { defaultValue: type.type })}
          </Text>
          {type.custom && <Badge size="2xsmall">{t("emails.list.custom")}</Badge>}
          {type.edited && <Badge size="2xsmall">{t("emails.list.edited")}</Badge>}
          {type.missing_translations > 0 && <Badge size="2xsmall">{t("emails.list.missingTranslations")}</Badge>}
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
