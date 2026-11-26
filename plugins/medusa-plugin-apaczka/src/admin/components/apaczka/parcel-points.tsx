import { Button, Container, Heading, Skeleton, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { type PointList, useApaczkaPoints, useSyncPoints } from "../../lib/apaczka/api"
import { errorMessage, formatDateTime } from "../../lib/apaczka/format"

/**
 * The stored parcel point lists, one row per carrier the account offers:
 * how many points, when they were last synced, and "Sync now". Searches
 * sync a missing or old list on their own; this fills one in advance.
 */
export const ParcelPoints = () => {
  const { t, i18n } = useTranslation()
  const points = useApaczkaPoints()
  const sync = useSyncPoints()

  const lists = points.data?.lists ?? []
  const types = [...new Set([...(points.data?.types ?? []), ...lists.map((list) => list.type)])].sort()
  const listFor = (type: string) => lists.find((list) => list.type === type && list.country_code === "PL")

  const syncNow = (type: string) =>
    sync.mutate(
      { type },
      {
        onSuccess: ({ list }) => toast.success(t("apaczka.points.synced", { type, count: list?.point_count ?? 0 })),
        onError: (error) => toast.error(errorMessage(error)),
      }
    )

  return (
    <Container className="overflow-hidden p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("apaczka.points.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("apaczka.points.hint")}
        </Text>
      </div>
      {points.isLoading ? (
        <div className="px-6 pb-4">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("apaczka.points.carrier")}</Table.HeaderCell>
              <Table.HeaderCell>{t("apaczka.points.count")}</Table.HeaderCell>
              <Table.HeaderCell>{t("apaczka.points.lastSync")}</Table.HeaderCell>
              <Table.HeaderCell>{t("apaczka.points.state")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {types.map((type) => {
              const list = listFor(type)
              const running = sync.isPending && sync.variables?.type === type
              return (
                <Table.Row key={type}>
                  <Table.Cell className="font-mono">{type}</Table.Cell>
                  <Table.Cell>{list?.point_count ?? "—"}</Table.Cell>
                  <Table.Cell>{formatDateTime(list?.succeeded_at, i18n.language)}</Table.Cell>
                  <Table.Cell>
                    <ListState list={list} running={running} />
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <Button
                      size="small"
                      variant="secondary"
                      isLoading={running}
                      disabled={sync.isPending}
                      onClick={() => syncNow(type)}
                    >
                      {t("apaczka.points.syncNow")}
                    </Button>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

const ListState = ({ list, running }: { list?: PointList; running: boolean }) => {
  const { t } = useTranslation()
  if (running || list?.status === "running") {
    return <StatusBadge color="blue">{t("apaczka.points.running")}</StatusBadge>
  }
  if (list?.status === "failed") {
    return (
      <span title={list.error ?? undefined}>
        <StatusBadge color="red">{t("apaczka.points.failed")}</StatusBadge>
      </span>
    )
  }
  if (list?.succeeded_at) {
    return <StatusBadge color="green">{t("apaczka.points.stored")}</StatusBadge>
  }
  return <StatusBadge color="grey">{t("apaczka.points.notStored")}</StatusBadge>
}
