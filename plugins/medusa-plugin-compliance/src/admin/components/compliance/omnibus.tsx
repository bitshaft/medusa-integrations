import { ArrowPath } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Skeleton, Table, Tabs, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { type OmnibusRow, useDiscounts, useRecordPrices } from "../../lib/compliance/api"
import { errorMessage, money, shortDate } from "../../lib/compliance/format"
import { Empty, LegalNote } from "./shared"

/** Badges that explain a lowest price: incomplete history, short sales, exemption. */
export const OmnibusFlags = ({ row }: { row: Pick<OmnibusRow, "history_incomplete" | "sold_since" | "exempt"> }) => {
  const { t, i18n } = useTranslation()
  return (
    <div className="flex flex-wrap gap-1">
      {row.history_incomplete && (
        <Badge size="2xsmall" color="orange">
          {t("compliance.omnibus.incomplete")}
        </Badge>
      )}
      {row.sold_since && (
        <Badge size="2xsmall" color="blue">
          {t("compliance.omnibus.soldSince", { date: shortDate(row.sold_since, i18n.language) })}
        </Badge>
      )}
      {row.exempt && (
        <Badge size="2xsmall" color="grey">
          {t("compliance.omnibus.exempt")}
        </Badge>
      )}
    </div>
  )
}

/** The Omnibus tab: discounts with their lowest prior price, and discounts whose history is too short. */
export const Omnibus = ({ demo }: { demo: boolean }) => {
  const { t, i18n } = useTranslation()
  const discounts = useDiscounts()
  const record = useRecordPrices()
  const [tab, setTab] = useState("discounts")
  const rows = discounts.data?.discounts ?? []
  const shown = tab === "incomplete" ? rows.filter((r) => r.history_incomplete) : rows

  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">{t("compliance.omnibus.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {discounts.data?.started_at
              ? t("compliance.omnibus.recordingSince", {
                  date: shortDate(discounts.data.started_at, i18n.language),
                  days: discounts.data.period_days,
                })
              : t("compliance.omnibus.notStarted")}
          </Text>
        </div>
        <Button
          size="small"
          variant="secondary"
          disabled={demo}
          isLoading={record.isPending}
          onClick={() =>
            record.mutate(undefined, {
              onSuccess: (r) => toast.success(t("compliance.omnibus.recorded", { count: r.recorded })),
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          <ArrowPath />
          {t("compliance.omnibus.recordNow")}
        </Button>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List>
          <Tabs.Trigger value="discounts">
            {t("compliance.omnibus.discounts")} ({rows.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="incomplete">
            {t("compliance.omnibus.incompleteList")} ({rows.filter((r) => r.history_incomplete).length})
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs>
      {tab === "incomplete" && (
        <Text size="small" className="text-ui-fg-subtle">
          {t("compliance.omnibus.incompleteHint")}
        </Text>
      )}
      {discounts.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !shown.length ? (
        <Empty>
          {tab === "incomplete" ? t("compliance.omnibus.noIncomplete") : t("compliance.omnibus.noDiscounts")}
        </Empty>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("compliance.omnibus.product")}</Table.HeaderCell>
              <Table.HeaderCell>{t("compliance.omnibus.region")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("compliance.omnibus.price")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("compliance.omnibus.regular")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("compliance.omnibus.lowest")}</Table.HeaderCell>
              <Table.HeaderCell>{t("compliance.omnibus.since")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {shown.map((r) => (
              <Table.Row key={`${r.variant_id}-${r.region_id}-${r.currency_code}`}>
                <Table.Cell>
                  {demo ? (
                    <Text size="small">{r.product_title}</Text>
                  ) : (
                    <Link
                      to={`/products/${r.product_id}`}
                      className="txt-compact-small text-ui-fg-interactive hover:underline"
                    >
                      {r.product_title ?? r.product_id}
                    </Link>
                  )}
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {[r.variant_title, r.sku].filter(Boolean).join(" · ")}
                  </Text>
                </Table.Cell>
                <Table.Cell>{r.region_name ?? r.region_id}</Table.Cell>
                <Table.Cell className="text-right">{money(r.amount, r.currency_code, i18n.language)}</Table.Cell>
                <Table.Cell className="text-right">{money(r.regular, r.currency_code, i18n.language)}</Table.Cell>
                <Table.Cell className="text-right">
                  <Text size="small" weight="plus">
                    {money(r.lowest, r.currency_code, i18n.language)}
                  </Text>
                </Table.Cell>
                <Table.Cell>{shortDate(r.discount_started_at, i18n.language)}</Table.Cell>
                <Table.Cell>
                  <OmnibusFlags row={r} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <LegalNote>{t("compliance.omnibus.legal")}</LegalNote>
    </Container>
  )
}
