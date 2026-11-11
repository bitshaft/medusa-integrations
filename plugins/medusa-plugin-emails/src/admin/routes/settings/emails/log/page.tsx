import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { MessageLog } from "../../../../components/emails/message-log"
import { useEmailsStatus } from "../../../../lib/emails/api"

/** The whole send log, with search by recipient and a status filter. */
const EmailsLogPage = () => {
  const { t } = useTranslation()
  const status = useEmailsStatus()

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-x-4 px-6 py-4">
        <div>
          <Link to="/settings/emails" className="text-ui-fg-subtle txt-small hover:text-ui-fg-base">
            ← {t("emails.editor.back")}
          </Link>
          <Heading className="mt-1">{t("emails.log.allTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("emails.log.allSubtitle")}
          </Text>
        </div>
        <Button size="small" variant="secondary" asChild>
          <Link to="/settings/emails">{t("emails.title")}</Link>
        </Button>
      </div>
      {status.data && !status.data.enabled ? (
        <Text size="small" className="text-ui-fg-error px-6 py-4">
          {status.data.disabled_reason}
        </Text>
      ) : (
        <MessageLog pageSize={20} filters />
      )}
    </Container>
  )
}

export default EmailsLogPage
