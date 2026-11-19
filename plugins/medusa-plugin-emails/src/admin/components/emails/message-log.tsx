import { Badge, Button, Input, Select, Skeleton, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { type EmailMessage, type MessageStatus, useEmailMessages, useResendEmail } from "../../lib/emails/api"
import { errorMessage, formatDateTime } from "../../lib/emails/kit/format"
import { Empty, Pager } from "../../lib/emails/kit/page"

const STATUS_COLORS: Record<MessageStatus, "green" | "red" | "orange" | "blue"> = {
  sent: "green",
  failed: "red",
  pending: "orange",
  demo: "blue",
}

const STATUSES: MessageStatus[] = ["sent", "failed", "pending", "demo"]
const ALL = "all"

type Props = {
  /** Show only the emails of one order or customer. */
  orderId?: string
  customerId?: string
  pageSize?: number
  /** Search and status filter, for the full log. */
  filters?: boolean
}

/** The send log as a table, with a resend button per email. */
export const MessageLog = ({ orderId, customerId, pageSize = 10, filters = false }: Props) => {
  const { t, i18n } = useTranslation()
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string>(ALL)

  const { data, isLoading, isError } = useEmailMessages({
    order_id: orderId,
    customer_id: customerId,
    q: search.trim() || undefined,
    status: status === ALL ? undefined : (status as MessageStatus),
    limit: pageSize,
    offset,
  })
  const resend = useResendEmail()

  const onResend = (message: EmailMessage) => {
    resend.mutate(message.id, {
      onSuccess: (outcome) => {
        if (outcome.status === "sent") {
          toast.success(t("emails.log.resendDone", { to: message.recipient }))
        } else if (outcome.status === "demo") {
          toast.info(t("emails.log.resendDemo"))
        } else {
          toast.error(t("emails.log.resendFailed", { error: outcome.error ?? outcome.reason ?? outcome.status }))
        }
      },
      onError: (error) => toast.error(t("emails.log.resendFailed", { error: errorMessage(error) })),
    })
  }

  const messages = data?.messages ?? []
  const count = data?.count ?? 0

  return (
    <div className="flex flex-col">
      {filters && (
        <div className="flex items-center gap-x-2 px-6 py-3">
          <div className="w-64">
            <Input
              size="small"
              type="search"
              placeholder={t("emails.log.search")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setOffset(0)
              }}
            />
          </div>
          <div className="w-48">
            <Select
              size="small"
              value={status}
              onValueChange={(value) => {
                setStatus(value)
                setOffset(0)
              }}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ALL}>{t("emails.log.allStatuses")}</Select.Item>
                {STATUSES.map((value) => (
                  <Select.Item key={value} value={value}>
                    {t(`emails.log.statuses.${value}`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="px-6 py-4">
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {isError && (
        <Text size="small" className="text-ui-fg-error px-6 py-4">
          {t("emails.log.loadError")}
        </Text>
      )}
      {!isLoading && !isError && !messages.length && (
        <div className="px-6 py-4">
          <Empty>{t("emails.log.empty")}</Empty>
        </div>
      )}

      {messages.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("emails.log.email")}</Table.HeaderCell>
              <Table.HeaderCell>{t("emails.log.recipient")}</Table.HeaderCell>
              <Table.HeaderCell>{t("emails.log.status")}</Table.HeaderCell>
              <Table.HeaderCell>{t("emails.log.date")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {messages.map((message) => (
              <Table.Row key={message.id}>
                <Table.Cell className="max-w-[320px] py-2">
                  <div className="flex items-center gap-x-2">
                    <Text size="small" weight="plus">
                      {t(`emails.types.${message.type}.name`, { defaultValue: message.type })}
                    </Text>
                    {message.trigger_type === "test" && <Badge size="2xsmall">{t("emails.log.test")}</Badge>}
                    {message.original_message_id && <Badge size="2xsmall">{t("emails.log.resent")}</Badge>}
                  </div>
                  {message.subject && (
                    <Text size="small" className="text-ui-fg-subtle truncate">
                      {message.subject}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{message.recipient}</Text>
                </Table.Cell>
                <Table.Cell className="max-w-[280px] py-2">
                  <StatusBadge color={STATUS_COLORS[message.status]}>
                    {t(`emails.log.statuses.${message.status}`)}
                  </StatusBadge>
                  {message.status === "failed" && (
                    <div className="mt-1">
                      {message.error && (
                        <Text size="xsmall" className="text-ui-fg-error whitespace-normal break-words">
                          {message.error}
                        </Text>
                      )}
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {t("emails.log.attempts", { count: message.attempts })}
                        {" · "}
                        {message.retryable && message.next_retry_at
                          ? t("emails.log.nextRetry", { date: formatDateTime(message.next_retry_at, i18n.language) })
                          : t("emails.log.noRetry")}
                      </Text>
                    </div>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    {formatDateTime(message.sent_at ?? message.created_at, i18n.language)}
                  </Text>
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Button
                    size="small"
                    variant="transparent"
                    disabled={!message.resendable || message.status === "pending"}
                    title={message.resendable ? undefined : t("emails.log.notResendable")}
                    isLoading={resend.isPending && resend.variables === message.id}
                    onClick={() => onResend(message)}
                  >
                    {t("emails.log.resend")}
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      <Pager offset={offset} limit={pageSize} count={count} onChange={setOffset} />
    </div>
  )
}
