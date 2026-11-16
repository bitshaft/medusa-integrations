import { Button, Checkbox, Input, Label, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  apiError,
  type FloorCheck,
  type Offer,
  type OfferMode,
  type PriceInput,
  previewOffer,
  type ThreadDetail,
  useThreadAction,
} from "../../lib/negotiations/api"
import { money, moneyInput, parseMoney } from "../../lib/negotiations/format"
import { floorWarning, Note, useBasisMoney, useErrorText } from "./shared"

const DAY = 86_400_000
const isoDay = (date: Date) => date.toISOString().slice(0, 10)

/**
 * A counter-offer. On a cart thread the team picks one amount (spread over
 * the lines) or a price per line, as the settings allow. The amount shown
 * before sending is the one the customer receives: unit prices are whole
 * grosze, so one amount over a cart can come out a few grosze lower.
 */
export const CounterForm = ({ detail, onSent }: { detail: ThreadDetail; onSent: () => void }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const thread = detail.negotiation
  const c = thread.currency_code
  const modes = detail.offer_modes
  const [mode, setMode] = useState<OfferMode>(modes[0])
  const current = thread.offer ?? thread.target
  const [unit, setUnit] = useState(moneyInput(thread.kind === "product" ? current.lines[0]?.unit_price : null, c))
  const [total, setTotal] = useState(moneyInput(current.total, c))
  const [lines, setLines] = useState<Record<string, string>>(() =>
    Object.fromEntries(current.lines.map((l) => [l.variant_id, moneyInput(l.unit_price, c)]))
  )
  const defaultDeadline = detail.expiry_days > 0 ? isoDay(new Date(Date.now() + detail.expiry_days * DAY)) : ""
  const [validUntil, setValidUntil] = useState(defaultDeadline)
  const [message, setMessage] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [preview, setPreview] = useState<{ offer: Offer; floors: FloorCheck } | null>(null)
  const errorText = useErrorText()
  // Every amount here is net or gross as the thread (the catalog price the customer saw).
  const basisMoney = useBasisMoney()
  const priced = (amount: number | null | undefined) => basisMoney(amount, c, thread.tax_inclusive)
  const basis = t(thread.tax_inclusive ? "negotiations.basis.gross" : "negotiations.basis.net")
  const counter = useThreadAction<Record<string, unknown>>(thread.id, "counter")

  const price: PriceInput | null = useMemo(() => {
    if (mode === "unit") {
      const value = parseMoney(unit, c)
      return value === null ? null : { mode, unit_price: value }
    }
    if (mode === "total") {
      const value = parseMoney(total, c)
      return value === null ? null : { mode, total: value }
    }
    const parsed = thread.lines.map((l) => ({
      variant_id: l.variant_id,
      unit_price: parseMoney(lines[l.variant_id] ?? "", c),
    }))
    return parsed.some((p) => p.unit_price === null)
      ? null
      : { mode, lines: parsed as Array<{ variant_id: string; unit_price: number }> }
  }, [mode, unit, total, lines, c, thread.lines])

  // The server computes the offer, so what is shown is exactly what will be sent.
  useEffect(() => {
    setConfirmed(false)
    if (!price) return setPreview(null)
    let cancelled = false
    const timer = setTimeout(() => {
      previewOffer(thread.id, price)
        .then((result) => !cancelled && setPreview(result))
        .catch(() => !cancelled && setPreview(null))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [price, thread.id])

  const warnings = floorWarning(preview?.floors ?? null, c, lang, t)
  const canSend = Boolean(price && preview && preview.offer.total > 0 && (!warnings || confirmed))

  const send = () => {
    if (!price) return
    counter.mutate(
      {
        version: thread.version,
        price,
        valid_until: validUntil ? new Date(`${validUntil}T23:59:59`).toISOString() : null,
        message: message.trim() || null,
        confirm_below_floor: confirmed || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t("negotiations.counter.sent"))
          onSent()
        },
        onError: (e) =>
          toast.error(
            errorText(e),
            apiError(e).negotiation ? { description: t("negotiations.thread.reloaded") } : undefined
          ),
      }
    )
  }

  const linesTotal = preview?.offer.mode === "lines" ? preview.offer.total : null

  return (
    <div className="flex flex-col gap-y-4">
      <Note>{t(thread.tax_inclusive ? "negotiations.basis.counterGross" : "negotiations.basis.counterNet")}</Note>

      {modes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {modes.map((m) => (
            <Button key={m} size="small" variant={mode === m ? "primary" : "secondary"} onClick={() => setMode(m)}>
              {t(`negotiations.counter.mode.${m}`)}
            </Button>
          ))}
        </div>
      )}

      {mode === "unit" && (
        <div className="flex flex-col gap-y-1">
          <Label size="small">{t("negotiations.counter.unitPrice", { basis, currency: c.toUpperCase() })}</Label>
          <Input size="small" inputMode="decimal" value={unit} onChange={(e) => setUnit(e.target.value)} />
          {preview && (
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("negotiations.counter.unitTotal", {
                quantity: thread.quantity_total,
                total: priced(preview.offer.total),
              })}
            </Text>
          )}
        </div>
      )}

      {mode === "total" && (
        <div className="flex flex-col gap-y-1">
          <Label size="small">{t("negotiations.counter.total", { basis, currency: c.toUpperCase() })}</Label>
          <Input size="small" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
          {preview && (
            <div className="flex flex-col gap-y-1 rounded-lg bg-ui-bg-subtle px-3 py-2">
              <Text size="small" weight="plus">
                {t("negotiations.counter.willSend", { total: priced(preview.offer.total) })}
              </Text>
              {preview.offer.requested_total !== preview.offer.total && (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {t("negotiations.counter.roundedDown", {
                    requested: money(preview.offer.requested_total ?? 0, c, lang),
                    difference: money((preview.offer.requested_total ?? 0) - preview.offer.total, c, lang),
                  })}
                </Text>
              )}
              {preview.offer.lines.map((l) => {
                const line = thread.lines.find((x) => x.variant_id === l.variant_id)
                return (
                  <Text key={l.variant_id} size="xsmall" className="text-ui-fg-subtle">
                    {line?.product_title}: {l.quantity} × {money(l.unit_price, c, lang)}
                  </Text>
                )
              })}
            </div>
          )}
        </div>
      )}

      {mode === "lines" && (
        <div className="flex flex-col gap-y-2">
          {thread.lines.map((line) => {
            const below = preview?.floors.below.find((b) => b.variant_id === line.variant_id)
            return (
              <div key={line.variant_id} className="grid grid-cols-[1fr_140px] items-center gap-3">
                <div className="min-w-0">
                  <Text size="small" className="truncate">
                    {[line.product_title, line.variant_title].filter(Boolean).join(" · ")}
                  </Text>
                  <Text size="xsmall" className={below ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
                    {line.quantity} × · {t("negotiations.counter.catalog")} {money(line.catalog_unit_price, c, lang)}
                    {below && ` · ${t("negotiations.counter.belowFloor", { floor: money(below.floor, c, lang) })}`}
                  </Text>
                </div>
                <Input
                  size="small"
                  inputMode="decimal"
                  value={lines[line.variant_id] ?? ""}
                  onChange={(e) => setLines({ ...lines, [line.variant_id]: e.target.value })}
                />
              </div>
            )
          })}
          <Text size="small" weight="plus" className="text-right">
            {t("negotiations.counter.sum", { total: linesTotal === null ? "—" : priced(linesTotal) })}
          </Text>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-y-1">
          <Label size="small">{t("negotiations.counter.validUntil")}</Label>
          <Input
            size="small"
            type="date"
            value={validUntil}
            min={isoDay(new Date(Date.now() + DAY))}
            onChange={(e) => setValidUntil(e.target.value)}
          />
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("negotiations.counter.validHint")}
          </Text>
        </div>
      </div>

      <Textarea
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t("negotiations.counter.messagePlaceholder")}
      />

      {warnings && (
        <div className="flex flex-col gap-y-2">
          <Note tone="error">
            {warnings.map((w) => (
              <span key={w} className="block">
                {w}
              </span>
            ))}
          </Note>
          <div className="flex items-center gap-x-2">
            <Checkbox id="confirm-floor" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
            <Label htmlFor="confirm-floor" size="small">
              {t("negotiations.floor.confirm")}
            </Label>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="small" disabled={!canSend} isLoading={counter.isPending} onClick={send}>
          {t("negotiations.counter.send", { total: preview ? priced(preview.offer.total) : "—" })}
        </Button>
      </div>
    </div>
  )
}
