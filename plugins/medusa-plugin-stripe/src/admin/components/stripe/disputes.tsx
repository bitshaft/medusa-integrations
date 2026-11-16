import { Badge, Container, Heading, Skeleton, Table, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useDisputes } from "../../lib/stripe/api"
import { date, errorMessage, money } from "../../lib/stripe/format"
import { Empty, ExternalLink, Incomplete, Note, OrderLink } from "./shared"

/** The Disputes tab: open disputes, nearest evidence deadline first; answered in the Stripe Dashboard. */
export const Disputes = ({ demo }: { demo: boolean }) => {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError, error } = useDisputes()
  const lang = i18n.language

  return (
    <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
      <div>
        <Heading level="h2">{t("stripe.disputes.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("stripe.disputes.hint")}
        </Text>
      </div>
      {isError && <Text className="text-ui-fg-error">{errorMessage(error)}</Text>}
      <Incomplete data={data} />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data?.disputes.length ? (
        <Empty>{t("stripe.disputes.empty")}</Empty>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("stripe.disputes.deadline")}</Table.HeaderCell>
              <Table.HeaderCell>{t("stripe.disputes.reason")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("stripe.amount")}</Table.HeaderCell>
              <Table.HeaderCell>{t("stripe.order")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.disputes.map((d) => (
              <Table.Row key={d.id}>
                <Table.Cell>
                  <div className="flex items-center gap-x-2">
                    <Text size="small">{date(d.due_by, lang)}</Text>
                    {d.days_left !== null && (
                      <Badge size="2xsmall" color={d.urgent ? "red" : d.days_left < 7 ? "orange" : "grey"}>
                        {d.urgent
                          ? t("stripe.disputes.urgent", { count: Math.max(0, d.days_left) })
                          : t("stripe.disputes.daysLeft", { count: d.days_left })}
                      </Badge>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  {t(`stripe.disputes.reasons.${d.reason}`, { defaultValue: d.reason.replace(/_/g, " ") })}
                </Table.Cell>
                <Table.Cell className="text-right">{money(d.amount, d.currency, lang)}</Table.Cell>
                <Table.Cell>
                  <OrderLink order={d.order} demo={demo} />
                </Table.Cell>
                <Table.Cell className="text-right">
                  <ExternalLink href={d.dashboard_url}>{t("stripe.disputes.respond")}</ExternalLink>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <Note>{t("stripe.disputes.note")}</Note>
    </Container>
  )
}
