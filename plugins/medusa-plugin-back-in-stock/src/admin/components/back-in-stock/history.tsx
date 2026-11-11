import { Container, Heading, Skeleton, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useNotifications } from "../../lib/back-in-stock/api"
import { formatDateTime } from "../../lib/back-in-stock/kit/format"
import { DemoBadge, NotificationBadge, Pager, VariantCell } from "./shared"

const PAGE = 20

/** Every back-in-stock and confirmation email, newest first. */
export const History = () => {
  const { t, i18n } = useTranslation()
  const [offset, setOffset] = useState(0)
  const { data, isLoading, isError } = useNotifications({ limit: PAGE, offset }, true)
  const rows = data?.notifications ?? []

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("back-in-stock.history.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("back-in-stock.history.subtitle")}
        </Text>
      </div>
      {isLoading && (
        <div className="px-6 py-4">
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {isError && (
        <Text size="small" className="text-ui-fg-error px-6 py-4">
          {t("back-in-stock.loadError")}
        </Text>
      )}
      {!isLoading && !isError && !rows.length && (
        <Text size="small" className="text-ui-fg-subtle px-6 py-4">
          {t("back-in-stock.history.empty")}
        </Text>
      )}
      {rows.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("back-in-stock.history.when")}</Table.HeaderCell>
              <Table.HeaderCell>{t("back-in-stock.history.email")}</Table.HeaderCell>
              <Table.HeaderCell>{t("back-in-stock.history.variant")}</Table.HeaderCell>
              <Table.HeaderCell>{t("back-in-stock.history.kind")}</Table.HeaderCell>
              <Table.HeaderCell>{t("back-in-stock.history.status")}</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    {formatDateTime(row.sent_at ?? row.created_at, i18n.language)}
                  </Text>
                </Table.Cell>
                <Table.Cell className="py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <Text size="small">{row.email ?? t("back-in-stock.anonymized")}</Text>
                    {row.demo && <DemoBadge />}
                  </div>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {row.sales_channel_name}
                  </Text>
                </Table.Cell>
                <Table.Cell className="max-w-[320px] py-2">
                  <VariantCell product={row.product} />
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{t(`back-in-stock.kind.${row.kind}`)}</Text>
                  {row.via && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {t(`back-in-stock.history.via.${row.via}`, { defaultValue: row.via })}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell className="max-w-[280px] py-2">
                  <NotificationBadge status={row.status} />
                  {row.error && (
                    <Text size="xsmall" className="text-ui-fg-subtle mt-1 whitespace-normal break-words">
                      {row.error}
                    </Text>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <Pager offset={offset} limit={PAGE} count={data?.count ?? 0} onChange={setOffset} />
    </Container>
  )
}
