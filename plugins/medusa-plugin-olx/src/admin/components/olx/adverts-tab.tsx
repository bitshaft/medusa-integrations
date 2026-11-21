import { Button, Container, Input, Select, Table, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useAdverts, useSyncNow } from "../../lib/olx/api"
import { formatDateTime } from "../../lib/olx/kit/format"
import { useDebounced } from "../../lib/olx/kit/hooks"
import { Empty, LoadingBlock, Pager } from "../../lib/olx/kit/page"
import { AdvertActions } from "./advert-actions"
import { BulkModal } from "./bulk-modal"
import { ADVERT_STATUSES, formatPln, StatusBadge } from "./shared"

const LIMIT = 20
const ALL = "all"

/** Every advert of the store, with what happened to it. */
export const AdvertsTab = ({ canWrite }: { canWrite: boolean }) => {
  const { t, i18n } = useTranslation()
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(ALL)
  const q = useDebounced(search)
  const { data, isLoading, isError, error } = useAdverts({
    limit: LIMIT,
    offset,
    q,
    status: status === ALL ? undefined : status,
  })
  const sync = useSyncNow()

  const syncNow = async () => {
    try {
      const { summary } = await sync.mutateAsync()
      if (summary.errors.length) toast.warning(summary.errors.join(" · "))
      else toast.success(t("olx.adverts.synced"))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            size="small"
            type="search"
            value={search}
            placeholder={t("olx.adverts.search")}
            onChange={(event) => {
              setSearch(event.target.value)
              setOffset(0)
            }}
          />
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
                <Select.Item value={ALL}>{t("olx.adverts.allStatuses")}</Select.Item>
                {ADVERT_STATUSES.map((value) => (
                  <Select.Item key={value} value={value}>
                    {t(`olx.status.${value}`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button size="small" variant="secondary" isLoading={sync.isPending} onClick={syncNow}>
              {t("olx.adverts.syncNow")}
            </Button>
            <BulkModal />
          </div>
        )}
      </div>

      {isLoading && <LoadingBlock />}
      {isError && (
        <Text size="small" className="text-ui-fg-error px-6 py-4">
          {(error as Error).message}
        </Text>
      )}
      {data && !data.adverts.length && (
        <div className="p-6">
          <Empty>{t("olx.adverts.empty")}</Empty>
        </div>
      )}
      {data && data.adverts.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("olx.adverts.col.advert")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("olx.adverts.col.status")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("olx.adverts.col.price")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("olx.adverts.col.validTo")}</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.adverts.map((advert) => (
                  <Table.Row key={advert.id}>
                    <Table.Cell className="max-w-[360px]">
                      <Link
                        to={`/products/${advert.product_id}`}
                        className="text-ui-fg-interactive txt-compact-small block truncate hover:underline"
                      >
                        {advert.title}
                      </Link>
                      {advert.last_error && (
                        <Text size="xsmall" className="text-ui-fg-error truncate" title={advert.last_error}>
                          {advert.last_error}
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge advert={advert} />
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">{formatPln(advert.price, i18n.language)}</Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      {advert.valid_to ? formatDateTime(advert.valid_to, i18n.language) : "—"}
                    </Table.Cell>
                    <Table.Cell className="text-right">{canWrite && <AdvertActions advert={advert} />}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
          <Pager offset={offset} limit={LIMIT} count={data.count} onChange={setOffset} />
        </>
      )}
    </Container>
  )
}
