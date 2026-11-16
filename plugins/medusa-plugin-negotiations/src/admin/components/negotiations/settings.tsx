import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Skeleton,
  StatusBadge,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  type PriceBases,
  type Settings as SettingsType,
  type SettingsResponse,
  useExpireNow,
  useResetDemo,
  useRuns,
  useSaveSettings,
} from "../../lib/negotiations/api"
import { dateTime, money } from "../../lib/negotiations/format"
import { Note, useErrorText } from "./shared"

const OptionRow = ({ name, value }: { name: string; value: string }) => (
  <div className="flex items-center justify-between gap-3 px-6 py-2">
    <Text size="small" className="font-mono text-ui-fg-subtle">
      {name}
    </Text>
    <Text size="small" className="font-mono">
      {value}
    </Text>
  </div>
)

/**
 * Net or gross per currency, and the regions whose own setting differs (for
 * prices set only for them), as Medusa's "Tax inclusive pricing" sets it. A
 * thread takes it from the catalog price it starts from, so this is
 * read-only here: it changes with the catalog.
 */
const PriceBasesCard = ({ bases }: { bases: PriceBases | null }) => {
  const { t } = useTranslation()
  const word = (taxInclusive: boolean) => t(taxInclusive ? "negotiations.basis.gross" : "negotiations.basis.net")
  const row = (key: string, label: string, taxInclusive: boolean) => (
    <div key={key} className="flex items-center justify-between gap-3 px-6 py-2">
      <Text size="small">{label}</Text>
      <Text size="small" weight="plus">
        {word(taxInclusive)}
      </Text>
    </div>
  )
  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("negotiations.basis.settingsTitle")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("negotiations.basis.settingsHint")}
        </Text>
      </div>
      {bases === null ? (
        <div className="px-6 py-4">
          <Note tone="warn">{t("negotiations.basis.unavailable")}</Note>
        </div>
      ) : (
        <div className="py-2">
          {Object.entries(bases.currencies).map(([code, taxInclusive]) =>
            row(code, t("negotiations.basis.currency", { currency: code.toUpperCase() }), taxInclusive)
          )}
          {bases.regions.map((r) =>
            row(
              r.id,
              t("negotiations.basis.region", { name: r.name, currency: r.currency_code.toUpperCase() }),
              r.tax_inclusive
            )
          )}
        </div>
      )}
    </Container>
  )
}

/** The "Settings" tab: options from medusa-config (read-only), the admin settings, expiry and the writers' history. */
export const Settings = ({ data }: { data: SettingsResponse }) => {
  const { t } = useTranslation()
  const o = data.options
  const save = useSaveSettings()
  const expire = useExpireNow()
  const resetDemo = useResetDemo()
  const errorText = useErrorText()
  const [form, setForm] = useState<SettingsType>(data.settings)
  const [discount, setDiscount] = useState(
    data.settings.max_discount_bp === null ? "" : String(data.settings.max_discount_bp / 100)
  )
  useEffect(() => setForm(data.settings), [data.settings])

  const submit = (next: SettingsType) =>
    save.mutate(next, {
      onSuccess: () => toast.success(t("negotiations.settings.saved")),
      onError: (e) => toast.error(errorText(e)),
    })

  const saveDiscount = () => {
    const text = discount.trim().replace(",", ".")
    if (!text) return submit({ ...form, max_discount_bp: null })
    const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text)
    const bp = match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : NaN
    if (!Number.isInteger(bp) || bp > 10_000) return toast.error(t("negotiations.settings.discountInvalid"))
    submit({ ...form, max_discount_bp: bp })
  }

  const yesNo = (v: boolean) => (v ? t("negotiations.yes") : t("negotiations.no"))

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
        <div>
          <Heading level="h2">{t("negotiations.settings.counterTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("negotiations.settings.counterHint")}
          </Text>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-y-1">
            <Label size="small">{t("negotiations.settings.cartModes")}</Label>
            <Select
              size="small"
              value={form.cart_counter_modes}
              onValueChange={(v) => submit({ ...form, cart_counter_modes: v as SettingsType["cart_counter_modes"] })}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {(["both", "total", "lines"] as const).map((m) => (
                  <Select.Item key={m} value={m}>
                    {t(`negotiations.settings.modes.${m}`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("negotiations.settings.cartModesHint")}
            </Text>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">{t("negotiations.settings.maxDiscount")}</Label>
            <div className="flex gap-2">
              <Input
                size="small"
                inputMode="decimal"
                placeholder="—"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
              <Button size="small" variant="secondary" onClick={saveDiscount} isLoading={save.isPending}>
                {t("negotiations.save")}
              </Button>
            </div>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("negotiations.settings.maxDiscountHint")}
            </Text>
          </div>
        </div>
      </Container>

      <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
        <div>
          <Heading level="h2">{t("negotiations.settings.writersTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("negotiations.settings.writersHint")}
          </Text>
        </div>
        {(
          [
            ["draft_orders", o.writers.draftOrders, "draftOrders"],
            ["cart", o.writers.cart, "cart"],
          ] as const
        ).map(([key, on, option]) => (
          <div
            key={key}
            className="flex items-start justify-between gap-4 rounded-lg border border-ui-border-base px-4 py-3"
          >
            <div>
              <Text size="small" weight="plus">
                {t(`negotiations.settings.writer.${key}`)}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t(`negotiations.settings.writer.${key}Hint`)}
              </Text>
              {!on && (
                <Text size="xsmall" className="mt-1 text-ui-tag-orange-text">
                  {t("negotiations.settings.optionOff", { option: `writers.${option}` })}
                </Text>
              )}
            </div>
            <Switch
              checked={form.armed[key]}
              disabled={!on || o.demo}
              onCheckedChange={(checked) => submit({ ...form, armed: { ...form.armed, [key]: checked } })}
            />
          </div>
        ))}
        {o.demo && <Note>{t("negotiations.settings.demoNoWrites")}</Note>}
      </Container>

      <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
        <div>
          <Heading level="h2">{t("negotiations.settings.expiryTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {o.expiryDays > 0
              ? t("negotiations.settings.expiryOn", { days: o.expiryDays })
              : t("negotiations.settings.expiryOff")}{" "}
            {t("negotiations.settings.acceptedDays", { days: o.acceptedOfferDays })}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="small"
            variant="secondary"
            isLoading={expire.isPending}
            onClick={() =>
              expire.mutate(undefined, {
                onSuccess: (r) =>
                  toast.success(t("negotiations.settings.expired", { lapsed: r.lapsed, expired: r.expired })),
                onError: (e) => toast.error(errorText(e)),
              })
            }
          >
            {t("negotiations.settings.expireNow")}
          </Button>
          {o.demo && (
            <Button
              size="small"
              variant="secondary"
              isLoading={resetDemo.isPending}
              onClick={() =>
                resetDemo.mutate(undefined, {
                  onSuccess: () => toast.success(t("negotiations.settings.demoRestored")),
                  onError: (e) => toast.error(errorText(e)),
                })
              }
            >
              {t("negotiations.settings.restoreDemo")}
            </Button>
          )}
        </div>
      </Container>

      <PriceBasesCard bases={data.price_bases} />

      <Container className="overflow-hidden divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("negotiations.settings.optionsTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("negotiations.settings.optionsHint")}
          </Text>
        </div>
        <div className="py-2">
          <OptionRow name="expiryDays" value={String(o.expiryDays)} />
          <OptionRow name="acceptedOfferDays" value={String(o.acceptedOfferDays)} />
          <OptionRow
            name="defaultCurrency"
            value={o.defaultCurrency?.toUpperCase() ?? t("negotiations.settings.storeCurrency")}
          />
          <OptionRow name="customerAccept" value={yesNo(o.customerAccept)} />
          <OptionRow
            name="allowedCustomerGroups"
            value={
              o.allowedCustomerGroups.length ? o.allowedCustomerGroups.join(", ") : t("negotiations.settings.everyone")
            }
          />
          <OptionRow name="writers.draftOrders" value={yesNo(o.writers.draftOrders)} />
          <OptionRow name="writers.cart" value={yesNo(o.writers.cart)} />
          <OptionRow name="limits.openThreads" value={String(o.limits.openThreads)} />
          <OptionRow name="limits.threadsPerHour" value={String(o.limits.threadsPerHour)} />
          <OptionRow name="limits.messagesPerHour" value={String(o.limits.messagesPerHour)} />
          <OptionRow name="limits.messageLength" value={String(o.limits.messageLength)} />
          <OptionRow name="limits.maxQuantity" value={String(o.limits.maxQuantity)} />
          <OptionRow name="demo" value={yesNo(o.demo)} />
        </div>
      </Container>

      <RunsHistory />
    </div>
  )
}

const STAGE_COLOR = { plan: "grey", dry_run: "blue", commit: "green", error: "red" } as const

const RunsHistory = () => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { data, isLoading } = useRuns()
  return (
    <Container className="overflow-hidden p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("negotiations.runs.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("negotiations.runs.hint")}
        </Text>
      </div>
      {isLoading ? (
        <Skeleton className="mx-6 mb-6 h-16" />
      ) : !data?.runs.length ? (
        <Text size="small" className="px-6 pb-6 text-ui-fg-subtle">
          {t("negotiations.runs.empty")}
        </Text>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("negotiations.runs.when")}</Table.HeaderCell>
                <Table.HeaderCell>{t("negotiations.list.thread")}</Table.HeaderCell>
                <Table.HeaderCell>{t("negotiations.runs.writerLabel")}</Table.HeaderCell>
                <Table.HeaderCell>{t("negotiations.runs.stageLabel")}</Table.HeaderCell>
                <Table.HeaderCell>{t("negotiations.runs.result")}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.runs.map((r) => (
                <Table.Row key={r.id}>
                  <Table.Cell>{dateTime(r.created_at, lang)}</Table.Cell>
                  <Table.Cell>
                    <Link
                      to={`/negotiations/${r.thread_id}`}
                      className="font-mono text-ui-fg-interactive hover:underline"
                    >
                      {r.number ?? r.thread_id}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>{t(`negotiations.runs.writer.${r.writer}`)}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={STAGE_COLOR[r.stage]}>{t(`negotiations.runs.stage.${r.stage}`)}</StatusBadge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="xsmall" className={r.error ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
                      {r.error ??
                        [
                          r.result?.region,
                          r.result?.total != null && r.result?.currency_code
                            ? money(r.result.total, r.result.currency_code, lang)
                            : null,
                          r.result?.order_id,
                          r.result?.cart_id,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </Container>
  )
}
