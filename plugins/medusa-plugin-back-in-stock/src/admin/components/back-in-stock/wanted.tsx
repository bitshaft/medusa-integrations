import { Button, Container, Heading, Skeleton, Table, Tabs, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useSimulateRestock, useWanted, type WantedVariant } from "../../lib/back-in-stock/api"
import { errorMessage } from "../../lib/back-in-stock/kit/format"
import { Pager, ProblemBadge, VariantCell } from "./shared"
import { TAB_CLASS } from "../../lib/back-in-stock/kit/ui"

const PAGE = 20
type Scope = "real" | "demo"

/** Variants ranked by people waiting, with current stock; demo data has its own view with "simulate restock". */
export const Wanted = () => {
  const { t } = useTranslation()
  const [scope, setScope] = useState<Scope>("real")
  const [offset, setOffset] = useState(0)
  const { data, isLoading, isError } = useWanted({ limit: PAGE, offset, demo: scope === "demo" }, true)
  const simulate = useSimulateRestock()
  const rows = data?.variants ?? []

  const onSimulate = (row: WantedVariant) =>
    simulate.mutate(
      { variant_id: row.variant_id, sales_channel_id: row.sales_channel_id },
      {
        onSuccess: ({ outcome }) =>
          toast.success(t("back-in-stock.wanted.simulated", { count: outcome.notified ?? 0 })),
        onError: (error) => toast.error(t("back-in-stock.wanted.simulateFailed", { error: errorMessage(error) })),
      }
    )

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">{t("back-in-stock.wanted.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("back-in-stock.wanted.subtitle")}
          </Text>
        </div>
        <Tabs
          value={scope}
          onValueChange={(value) => {
            setScope(value as Scope)
            setOffset(0)
          }}
        >
          <Tabs.List>
            <Tabs.Trigger className={TAB_CLASS} value="real">
              {t("back-in-stock.subscriptions.realOnly")}
            </Tabs.Trigger>
            <Tabs.Trigger className={TAB_CLASS} value="demo">
              {t("back-in-stock.demo")}
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs>
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
          {t("back-in-stock.wanted.empty")}
        </Text>
      )}

      {rows.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("back-in-stock.wanted.variant")}</Table.HeaderCell>
              <Table.HeaderCell>{t("back-in-stock.wanted.channel")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("back-in-stock.wanted.waiting")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("back-in-stock.wanted.pending")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("back-in-stock.wanted.notified")}</Table.HeaderCell>
              <Table.HeaderCell>{t("back-in-stock.wanted.stock")}</Table.HeaderCell>
              {scope === "demo" && <Table.HeaderCell />}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={`${row.variant_id}|${row.sales_channel_id}`}>
                <Table.Cell className="max-w-[360px] py-2">
                  <VariantCell product={row} />
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{row.sales_channel_name}</Text>
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Text size="small" weight="plus">
                    {row.waiting}
                  </Text>
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Text size="small">{row.pending}</Text>
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Text size="small">{row.notified}</Text>
                </Table.Cell>
                <Table.Cell>
                  {row.problem ? (
                    <ProblemBadge problem={row.problem} />
                  ) : (
                    <Text size="small" className={row.in_stock ? "text-ui-tag-green-text" : "text-ui-fg-subtle"}>
                      {row.in_stock
                        ? row.reason === "stock" && row.available !== null
                          ? t("back-in-stock.wanted.available", { count: row.available })
                          : t(`back-in-stock.reason.${row.reason ?? "stock"}`)
                        : t("back-in-stock.wanted.outOfStock")}
                    </Text>
                  )}
                </Table.Cell>
                {scope === "demo" && (
                  <Table.Cell className="text-right">
                    <Button
                      size="small"
                      variant="secondary"
                      isLoading={
                        simulate.isPending &&
                        simulate.variables?.variant_id === row.variant_id &&
                        simulate.variables?.sales_channel_id === row.sales_channel_id
                      }
                      onClick={() => onSimulate(row)}
                    >
                      {t("back-in-stock.wanted.simulate")}
                    </Button>
                  </Table.Cell>
                )}
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <Pager offset={offset} limit={PAGE} count={data?.count ?? 0} onChange={setOffset} />
    </Container>
  )
}
