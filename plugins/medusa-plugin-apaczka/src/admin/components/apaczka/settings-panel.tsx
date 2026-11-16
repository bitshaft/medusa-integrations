import {
  Badge,
  Button,
  Container,
  Copy,
  Heading,
  Label,
  Skeleton,
  StatusBadge,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  useApaczkaServices,
  useApaczkaSettings,
  useApaczkaStatus,
  useSaveApaczkaSettings,
  useVariantsWithoutWeight,
} from "../../lib/apaczka/api"
import { errorMessage } from "../../lib/apaczka/format"

/** The Settings tab: connection, configuration from plugin options, tracking and services. */
export const SettingsPanel = () => {
  const { t } = useTranslation()
  const [refresh, setRefresh] = useState(false)
  const status = useApaczkaStatus(refresh)
  const s = status.data
  const services = useApaczkaServices(s?.enabled === true)

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="overflow-hidden divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("apaczka.settings.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("apaczka.settings.description")}
            </Text>
          </div>
          <Button
            size="small"
            variant="secondary"
            isLoading={status.isFetching}
            onClick={() => (refresh ? status.refetch() : setRefresh(true))}
          >
            {t("apaczka.settings.recheck")}
          </Button>
        </div>

        {status.isLoading || !s ? (
          <div className="px-6 py-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !s.enabled ? (
          <Section title={t("apaczka.settings.connection")}>
            <Row label={t("apaczka.settings.connection")}>
              <StatusBadge color="orange">{t("apaczka.settings.disabled")}</StatusBadge>
            </Row>
            <div className="py-2">
              <Text size="small" className="text-ui-fg-error">
                {s.disabled_reason}
              </Text>
              <Text size="small" className="text-ui-fg-subtle mt-1">
                {t("apaczka.settings.disabledHint")}
              </Text>
            </div>
            <Row label={t("apaczka.settings.version")}>
              <Text size="small">{s.version}</Text>
            </Row>
          </Section>
        ) : (
          <>
            <Section title={t("apaczka.settings.connection")}>
              <Row label={t("apaczka.settings.connection")}>
                <StatusBadge color={s.connection.ok ? "green" : "red"}>
                  {s.connection.ok ? t("apaczka.settings.connected") : t("apaczka.settings.disconnected")}
                </StatusBadge>
                {s.connection.ok && (
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("apaczka.settings.services", { count: s.connection.services })}
                  </Text>
                )}
              </Row>
              {!s.connection.ok && (
                <Text size="small" className="text-ui-fg-error">
                  {s.connection.authentication_error ? t("apaczka.settings.authError") : s.connection.error}
                </Text>
              )}
              <Row label={t("apaczka.settings.environment")}>
                <Badge size="2xsmall" color={s.environment === "production" ? "green" : "orange"}>
                  {s.environment}
                </Badge>
                <Text size="small" className="text-ui-fg-subtle font-mono">
                  {s.base_url}
                </Text>
              </Row>
              <Row label={t("apaczka.settings.appId")}>
                <Text size="small" className="font-mono">
                  {s.app_id}
                </Text>
              </Row>
              <Row label={t("apaczka.settings.version")}>
                <Text size="small">{s.version}</Text>
              </Row>
            </Section>

            <Section title={t("apaczka.settings.configuration")} hint={t("apaczka.settings.configHint")}>
              <Row label={t("apaczka.settings.shipmentCreation")}>
                <Text size="small">{t(`apaczka.settings.${s.settings.shipment_creation}`)}</Text>
              </Row>
              <Row label={t("apaczka.settings.labelFormat")}>
                <Text size="small">{s.settings.label_format.toUpperCase()}</Text>
              </Row>
              <Row label={t("apaczka.settings.defaultHandover")}>
                <Text size="small">{t(`apaczka.pickupType.${s.settings.pickup_type}`)}</Text>
              </Row>
              <Row label={t("apaczka.settings.pricingBasis")}>
                <Text size="small">{s.settings.pricing_basis}</Text>
              </Row>
              <Row label={t("apaczka.settings.insurance")}>
                <Text size="small">{s.settings.insurance}</Text>
              </Row>
              <Row label={t("apaczka.settings.codAccount")}>
                <StatusBadge color={s.settings.cod_account_configured ? "green" : "grey"}>
                  {s.settings.cod_account_configured
                    ? t("apaczka.settings.configured")
                    : t("apaczka.settings.notConfigured")}
                </StatusBadge>
              </Row>
              <Row label={t("apaczka.settings.senderLocations")}>
                <Text size="small">{s.settings.sender_locations.length || "—"}</Text>
              </Row>
            </Section>

            <Section title={t("apaczka.settings.tracking")}>
              <Row label={t("apaczka.settings.webhookUrl")}>
                {s.tracking.webhook_url ? (
                  <div className="flex items-center gap-x-1">
                    <Text size="small" className="font-mono">
                      {s.tracking.webhook_url}
                    </Text>
                    <Copy content={s.tracking.webhook_url} />
                  </div>
                ) : (
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("apaczka.settings.webhookMissing")}
                  </Text>
                )}
              </Row>
              <Row label={t("apaczka.settings.polling")}>
                <OnOff value={s.tracking.polling} />
              </Row>
              <Row label={t("apaczka.settings.markShipped")}>
                <OnOff value={s.tracking.mark_shipped} />
              </Row>
              <Row label={t("apaczka.settings.markDelivered")}>
                <OnOff value={s.tracking.mark_delivered} />
              </Row>
            </Section>
          </>
        )}
      </Container>

      {s?.enabled && <ParcelWeight />}

      <Container className="overflow-hidden p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("apaczka.settings.servicesTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("apaczka.settings.servicesHint")}
          </Text>
        </div>
        {services.isLoading ? (
          <div className="px-6 pb-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>ID</Table.HeaderCell>
                <Table.HeaderCell>{t("apaczka.fields.service")}</Table.HeaderCell>
                <Table.HeaderCell>{t("apaczka.settings.route")}</Table.HeaderCell>
                <Table.HeaderCell>{t("apaczka.settings.courier")}</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(services.data?.services ?? []).map((service) => (
                <Table.Row key={service.id}>
                  <Table.Cell className="font-mono">{service.service_id}</Table.Cell>
                  <Table.Cell>{service.name}</Table.Cell>
                  <Table.Cell>
                    {t(`apaczka.settings.${service.origin}`)} → {t(`apaczka.settings.${service.destination}`)}
                  </Table.Cell>
                  <Table.Cell>
                    {t(
                      `apaczka.settings.${
                        service.pickup_courier === 2
                          ? "required"
                          : service.pickup_courier === 1
                            ? "available"
                            : "unavailable"
                      }`
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge size="2xsmall">
                      {service.domestic ? t("apaczka.settings.domestic") : t("apaczka.settings.international")}
                    </Badge>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  )
}

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-y-3 px-6 py-4">
    <div>
      <Text size="small" weight="plus">
        {title}
      </Text>
      {hint && (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      )}
    </div>
    {children}
  </div>
)

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[200px_1fr] items-center gap-x-4">
    <Text size="small" className="text-ui-fg-subtle">
      {label}
    </Text>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
)

const OnOff = ({ value }: { value: boolean }) => {
  const { t } = useTranslation()
  return (
    <StatusBadge color={value ? "green" : "grey"}>
      {value ? t("apaczka.settings.on") : t("apaczka.settings.off")}
    </StatusBadge>
  )
}

const PAGE = 10

/**
 * Parcel weights: what a product without a weight counts as, whether such
 * shipments wait for a person, and which variants have no weight.
 */
const ParcelWeight = () => {
  const { t } = useTranslation()
  const settings = useApaczkaSettings()
  const save = useSaveApaczkaSettings()
  const [offset, setOffset] = useState(0)
  const variants = useVariantsWithoutWeight(offset)
  const data = settings.data
  const count = variants.data?.count ?? 0

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("apaczka.weight.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {data
            ? t("apaczka.weight.defaults", {
                weight: data.parcel.default_item_weight_kg,
                unit: data.parcel.weight_unit,
                packaging: data.parcel.packaging_weight_kg,
                min: data.parcel.min_weight_kg,
              })
            : t("apaczka.weight.hint")}
        </Text>
      </div>

      {data && (
        <div className="flex items-start justify-between gap-x-6 px-6 py-4">
          <div>
            <Label htmlFor="apaczka-hold-weight" size="small" weight="plus">
              {t("apaczka.weight.hold")}
            </Label>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {data.shipment_creation === "manual" ? t("apaczka.weight.holdManualMode") : t("apaczka.weight.holdHint")}
            </Text>
          </div>
          <Switch
            id="apaczka-hold-weight"
            checked={data.settings.hold_without_weight}
            disabled={save.isPending}
            onCheckedChange={(checked) =>
              save.mutate(
                { ...data.settings, hold_without_weight: checked },
                {
                  onSuccess: () => toast.success(t("apaczka.weight.saved")),
                  onError: (error) => toast.error(errorMessage(error)),
                }
              )
            }
          />
        </div>
      )}

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div className="flex items-center gap-x-2">
          <Text size="small" weight="plus">
            {t("apaczka.weight.missingTitle")}
          </Text>
          {variants.data && (
            <Badge size="2xsmall" color={count ? "orange" : "green"}>
              {count}
            </Badge>
          )}
        </div>
        {variants.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !count ? (
          <Text size="small" className="text-ui-fg-subtle">
            {t("apaczka.weight.allSet")}
          </Text>
        ) : (
          <>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("apaczka.weight.missingHint")}
            </Text>
            <div className="overflow-x-auto rounded-lg border border-ui-border-base">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>{t("apaczka.weight.product")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("apaczka.weight.variant")}</Table.HeaderCell>
                    <Table.HeaderCell>SKU</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {variants.data!.variants.map((v) => (
                    <Table.Row key={v.id}>
                      <Table.Cell>
                        {v.product_id ? (
                          <Link
                            to={`/products/${v.product_id}/variants/${v.id}`}
                            className="text-ui-fg-interactive hover:underline"
                          >
                            {v.product_title ?? v.product_id}
                          </Link>
                        ) : (
                          (v.product_title ?? "—")
                        )}
                      </Table.Cell>
                      <Table.Cell>{v.title ?? "—"}</Table.Cell>
                      <Table.Cell className="font-mono">{v.sku ?? "—"}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
              {count > PAGE && (
                <Table.Pagination
                  count={count}
                  pageSize={PAGE}
                  pageIndex={Math.floor(offset / PAGE)}
                  pageCount={Math.ceil(count / PAGE)}
                  canPreviousPage={offset > 0}
                  canNextPage={offset + PAGE < count}
                  previousPage={() => setOffset(Math.max(0, offset - PAGE))}
                  nextPage={() => setOffset(offset + PAGE)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </Container>
  )
}
