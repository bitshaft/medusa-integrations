import { Cash } from "@medusajs/icons"
import { Badge, Button, Checkbox, Label, Text } from "@medusajs/ui"
import { useEffect, useMemo, useRef, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useTranslation } from "react-i18next"

import type { SettingsResponse } from "./api"
import { formatMoney } from "./format"
import { sdk } from "./kit/sdk"

/**
 * "Suggest prices" in Medusa's own price editor.
 *
 * Medusa has no widget zone in its price grids (Edit prices, the prices step
 * of a new product, a new variant), so the button is added to the grid's
 * header from outside: an observer waits for such a grid to open and renders
 * the button into its header. The prices are written into the grid's form
 * (react-hook-form, found on the React tree above the header), exactly as
 * if typed; nothing is saved until the admin presses Medusa's Save.
 *
 * Which price a row starts from: the cell typed last in that row, else the
 * base currency's price, else the first filled column.
 *
 * This relies on the markup of Medusa's dashboard, not on a public API. When
 * a Medusa update changes it, the button simply does not appear: the grid
 * keeps working as before.
 */

/** The price grids' routes (the admin may live under a base path, e.g. `/app`). */
const ROUTES = [
  /\/products\/create\/?$/,
  /\/products\/[^/]+\/prices\/?$/,
  /\/products\/[^/]+\/variants\/create\/?$/,
  /\/products\/[^/]+\/variants\/[^/]+\/prices\/?$/,
]

/** A price field of the grid: `variants.0.prices.eur`, `prices.reg_01…`. */
const FIELD = /^((?:variants\.\d+\.)?prices)\.([^.]+)$/

type Form = {
  getValues: (name?: string) => any
  setValue: (name: string, value: unknown, options?: Record<string, boolean>) => void
  watch: (callback: (values: unknown, info: { name?: string; type?: string }) => void) => { unsubscribe: () => void }
}

type GridRow = { prefix: string; title: string; prices: Record<string, unknown> }

type SuggestResponse = {
  base: string
  rows: Array<{
    key: string
    source: { slot: string; currency: string; region_id: string | null; amount: string }
    error: string | null
    suggestions: Array<
      | { slot: string; currency: string; region_id: string | null; ok: true; amount: string; warnings: string[] }
      | { slot: string; currency: string; region_id: string | null; ok: false; reason: string }
    >
  }>
  rates: { status: string; table: string | null; date: string | null } | null
}

/* Finding the grid and its form ------------------------------------------- */

const isForm = (value: any): value is Form =>
  Boolean(value) &&
  typeof value.getValues === "function" &&
  typeof value.setValue === "function" &&
  typeof value.watch === "function"

/** The react-hook-form instance above an element: a `form` prop, or a form context's value. */
function formAbove(element: Element): Form | null {
  const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"))
  let fiber = key ? (element as any)[key] : null
  for (let depth = 0; fiber && depth < 200; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (isForm(props?.form)) return props.form
    if (isForm(props?.value)) return props.value
  }
  return null
}

/** The open price grid's modal header (the bar with the close button and "esc"). */
function gridHeader(): Element | null {
  for (const dialog of Array.from(document.querySelectorAll('[role="dialog"]'))) {
    if (!dialog.querySelector('[role="grid"]')) continue
    const header = dialog.querySelector("kbd")?.parentElement?.parentElement
    if (header?.classList.contains("border-b")) return header
  }
  return null
}

const hasValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "" && !Number.isNaN(Number(value)) && Number(value) > 0

/** The rows of the grid's form: a product's variants, or a single new variant. */
function gridRows(form: Form): GridRow[] {
  const values = form.getValues() ?? {}
  if (Array.isArray(values.variants)) {
    return values.variants
      .map((variant: any, index: number) => ({ variant, index }))
      .filter(({ variant }: { variant: any }) => variant && variant.should_create !== false)
      .map(({ variant, index }: { variant: any; index: number }) => ({
        prefix: `variants.${index}.prices`,
        title: String(variant.title ?? `#${index + 1}`),
        prices: (variant.prices ?? {}) as Record<string, unknown>,
      }))
  }
  if (values.prices && typeof values.prices === "object") {
    return [{ prefix: "prices", title: String(values.title ?? ""), prices: values.prices }]
  }
  return []
}

/* Mounting ------------------------------------------------------------------ */

const STARTED = Symbol.for("bitshaft.currency.price-editor")

type Mounted = { header: Element; host: HTMLElement; root: Root }

/** Watches the page for a price grid; idempotent (one observer per page). */
export function installPriceEditorHelper() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return
  const store = globalThis as typeof globalThis & { [STARTED]?: boolean }
  if (store[STARTED]) return
  store[STARTED] = true

  let mounted: Mounted | null = null
  let scheduled = false

  const unmount = () => {
    if (!mounted) return
    const { root, host } = mounted
    mounted = null
    // Not during React's own commit of the page.
    setTimeout(() => {
      root.unmount()
      host.remove()
    })
  }

  const scan = () => {
    scheduled = false
    const onRoute = ROUTES.some((route) => route.test(window.location.pathname))
    const header = onRoute ? gridHeader() : null
    if (mounted && (mounted.header !== header || !mounted.header.isConnected || !mounted.host.isConnected)) unmount()
    if (!header || mounted) return
    const form = formAbove(header)
    if (!form || !gridRows(form).length) return
    const host = document.createElement("div")
    host.dataset.bitshaftCurrency = "suggest"
    host.className = "relative ml-auto flex items-center"
    header.appendChild(host)
    const root = createRoot(host)
    root.render(<SuggestButton form={form} />)
    mounted = { header, host, root }
  }

  new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(scan)
  }).observe(document.body, { childList: true, subtree: true })
}

/* The button and its panel ------------------------------------------------- */

type Planned = {
  prefix: string
  title: string
  source: SuggestResponse["rows"][number]["source"] | null
  error: string | null
  cells: Array<{ slot: string; currency: string; label: string; amount: string; replaces: boolean; warnings: string[] }>
  problems: Array<{ label: string; reason: string }>
}

const SuggestButton = ({ form }: { form: Form }) => {
  const { t, i18n } = useTranslation()
  const lastTyped = useRef<Record<string, string>>({})
  const writing = useRef(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [data, setData] = useState<{ settings: SettingsResponse; suggest: SuggestResponse; rows: GridRow[] } | null>(
    null
  )
  const [done, setDone] = useState<number | null>(null)

  // The column typed last in each row is that row's source.
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (writing.current || !name) return
      const match = FIELD.exec(name)
      if (match) lastTyped.current[match[1]] = match[2]
    })
    return () => subscription.unsubscribe()
  }, [form])

  const compute = async () => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const settings = await sdk.client.fetch<SettingsResponse>("/admin/currency/settings")
      const base = settings.store.base?.code ?? null
      const rows = gridRows(form)
      const sources = rows.flatMap((row) => {
        const typed = lastTyped.current[row.prefix]
        const slot =
          (typed && hasValue(row.prices[typed]) && typed) ||
          (base && hasValue(row.prices[base]) && base) ||
          Object.keys(row.prices).find((key) => hasValue(row.prices[key]))
        return slot ? [{ key: row.prefix, slot, amount: String(row.prices[slot]) }] : []
      })
      const suggest = sources.length
        ? await sdk.client.fetch<SuggestResponse>("/admin/currency/suggest", {
            method: "POST",
            body: { rows: sources },
          })
        : { base: base ?? "", rows: [], rates: null }
      setData({ settings, suggest, rows })
      setOpen(true)
    } catch (e) {
      setError((e as Error).message || t("currency.loadError"))
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }

  const planned: Planned[] = useMemo(() => {
    if (!data) return []
    const regions = new Map(data.settings.store.regions.map((region) => [region.id, region]))
    const label = (slot: string, currency: string) =>
      regions.has(slot) ? `${regions.get(slot)!.name} (${currency.toUpperCase()})` : currency.toUpperCase()
    return data.rows.map((row): Planned => {
      const result = data.suggest.rows.find((r) => r.key === row.prefix)
      if (!result) return { prefix: row.prefix, title: row.title, source: null, error: "no_source", cells: [], problems: [] }
      const cells: Planned["cells"] = []
      const problems: Planned["problems"] = []
      for (const suggestion of result.suggestions) {
        if (!suggestion.ok) {
          if (suggestion.reason !== "disabled") {
            problems.push({ label: label(suggestion.slot, suggestion.currency), reason: suggestion.reason })
          }
          continue
        }
        const current = row.prices[suggestion.slot]
        const filled = hasValue(current)
        if (filled && (!overwrite || Number(current) === Number(suggestion.amount))) continue
        cells.push({
          slot: suggestion.slot,
          currency: suggestion.currency,
          label: label(suggestion.slot, suggestion.currency),
          amount: suggestion.amount,
          replaces: filled,
          warnings: suggestion.warnings,
        })
      }
      return { prefix: row.prefix, title: row.title, source: result.source, error: result.error, cells, problems }
    })
  }, [data, overwrite])

  const count = planned.reduce((sum, row) => sum + row.cells.length, 0)

  const apply = () => {
    writing.current = true
    try {
      for (const row of planned) {
        for (const cell of row.cells) {
          form.setValue(`${row.prefix}.${cell.slot}`, cell.amount, { shouldDirty: true, shouldTouch: true })
        }
      }
    } finally {
      writing.current = false
    }
    setOpen(false)
    setDone(count)
  }

  useEffect(() => {
    if (done === null) return
    const timer = setTimeout(() => setDone(null), 5000)
    return () => clearTimeout(timer)
  }, [done])

  const stale = data?.suggest.rates?.status === "stale"

  return (
    <>
      {done !== null && (
        <Text size="small" className="text-ui-fg-subtle mr-2">
          {t("currency.suggest.done", { count: done })}
        </Text>
      )}
      <Button size="small" variant="secondary" type="button" isLoading={busy} onClick={() => (open ? setOpen(false) : compute())}>
        <Cash />
        {t("currency.suggest.button")}
      </Button>
      {open && (
        <div
          className="bg-ui-bg-base shadow-elevation-flyout absolute right-0 top-full z-50 mt-2 flex max-h-[70vh] w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="flex flex-col gap-y-1 border-b px-4 py-3">
            <Text size="small" weight="plus">
              {t("currency.suggest.title")}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("currency.suggest.hint", { base: (data?.suggest.base ?? "").toUpperCase() })}
            </Text>
          </div>
          {error ? (
            <Text size="small" className="text-ui-fg-error px-4 py-3">
              {error}
            </Text>
          ) : (
            <>
              <div className="flex items-center gap-x-2 border-b px-4 py-2">
                <Checkbox id="bitshaft-currency-overwrite" checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
                <Label htmlFor="bitshaft-currency-overwrite" size="xsmall">
                  {t("currency.suggest.overwrite")}
                </Label>
              </div>
              {stale && (
                <Text size="xsmall" className="text-ui-fg-error border-b px-4 py-2">
                  {t("currency.suggest.stale", { table: data?.suggest.rates?.table ?? "", date: data?.suggest.rates?.date ?? "" })}
                </Text>
              )}
              <div className="flex flex-col divide-y overflow-y-auto">
                {planned.map((row) => (
                  <div key={row.prefix} className="flex flex-col gap-y-1.5 px-4 py-2">
                    <div className="flex items-center justify-between gap-x-2">
                      <Text size="small" weight="plus" className="truncate">
                        {row.title || t("currency.suggest.variant")}
                      </Text>
                      {row.source && !row.error && (
                        <Text size="xsmall" className="text-ui-fg-subtle shrink-0">
                          {t("currency.suggest.from", {
                            price: formatMoney(row.source.amount, row.source.currency, i18n.language),
                          })}
                        </Text>
                      )}
                    </div>
                    {row.error ? (
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {t(`currency.suggest.error.${row.error}`, { defaultValue: t(`currency.reason.${row.error}`) })}
                      </Text>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.cells.map((cell) => (
                          <Badge
                            key={cell.slot}
                            size="2xsmall"
                            color={cell.replaces ? "orange" : "grey"}
                            title={cell.warnings.map((w) => t(`currency.warning.${w}Hint`)).join(" ")}
                          >
                            {cell.label}: {formatMoney(cell.amount, cell.currency, i18n.language)}
                            {cell.replaces ? ` · ${t("currency.suggest.replaces")}` : ""}
                            {cell.warnings.length ? " ⚠" : ""}
                          </Badge>
                        ))}
                        {!row.cells.length && (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {t("currency.suggest.nothing")}
                          </Text>
                        )}
                      </div>
                    )}
                    {row.problems.map((problem) => (
                      <Text key={problem.label} size="xsmall" className="text-ui-fg-subtle">
                        {problem.label}: {t(`currency.reason.${problem.reason}`)}
                      </Text>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center justify-between gap-x-2 border-t px-4 py-3">
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("currency.suggest.saveHint")}
            </Text>
            <div className="flex shrink-0 gap-x-2">
              <Button size="small" variant="secondary" type="button" onClick={() => setOpen(false)}>
                {t("currency.cancel")}
              </Button>
              <Button size="small" type="button" disabled={!count || Boolean(error)} onClick={apply}>
                {t("currency.suggest.apply", { count })}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
