import { ExclamationCircle, InformationCircleSolid } from "@medusajs/icons"
import { Badge, StatusBadge, Text } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { DemoResetButton, DemoBar as KitDemoBar } from "../../lib/negotiations/kit/demo"
import { apiError, type FloorCheck, type Status, type Thread, useResetDemo } from "../../lib/negotiations/api"
import { money, percent } from "../../lib/negotiations/format"

/** Shown on every page while demo mode is on: the bar every integration shares. */
export const DemoBar = () => {
  const { t } = useTranslation()
  return <KitDemoBar>{t("negotiations.demo.body")}</KitDemoBar>
}

/** "Restore test data": replaces the demo threads with a fresh set. */
export const ResetDemoButton = () => {
  const { t } = useTranslation()
  const reset = useResetDemo()
  return (
    <DemoResetButton
      description={t("negotiations.demo.resetBody")}
      onReset={async () => {
        await reset.mutateAsync()
      }}
    />
  )
}

export const DemoBadge = () => {
  const { t } = useTranslation()
  return (
    <Badge size="2xsmall" color="orange">
      {t("negotiations.demo.badge")}
    </Badge>
  )
}

export const Note = ({ children, tone }: { children: ReactNode; tone?: "warn" | "error" }) => (
  <div
    className={
      tone === "error"
        ? "flex items-start gap-x-2 rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg px-3 py-2"
        : tone === "warn"
          ? "flex items-start gap-x-2 rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg px-3 py-2"
          : "flex items-start gap-x-2 rounded-lg bg-ui-bg-subtle px-3 py-2"
    }
  >
    {tone ? (
      <ExclamationCircle
        className={`mt-0.5 shrink-0 ${tone === "error" ? "text-ui-tag-red-icon" : "text-ui-tag-orange-icon"}`}
      />
    ) : (
      <InformationCircleSolid className="mt-0.5 shrink-0 text-ui-fg-muted" />
    )}
    <Text
      size="small"
      className={
        tone === "error" ? "text-ui-tag-red-text" : tone === "warn" ? "text-ui-tag-orange-text" : "text-ui-fg-subtle"
      }
    >
      {children}
    </Text>
  </div>
)

const STATUS_COLOR: Record<Status, "green" | "orange" | "red" | "grey" | "blue" | "purple"> = {
  open: "blue",
  countered: "purple",
  accepted: "green",
  rejected: "red",
  expired: "grey",
  withdrawn: "grey",
}

export const StatusLabel = ({ status }: { status: Status }) => {
  const { t } = useTranslation()
  return <StatusBadge color={STATUS_COLOR[status]}>{t(`negotiations.status.${status}`)}</StatusBadge>
}

/** The "your move" dot: the thread waits for the team. */
export const TurnDot = ({ thread }: { thread: Pick<Thread, "turn" | "status"> }) => {
  const { t } = useTranslation()
  if (thread.turn !== "team" || (thread.status !== "open" && thread.status !== "countered")) {
    return <span className="inline-block h-2 w-2 shrink-0" aria-hidden />
  }
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-ui-tag-blue-icon"
      title={t("negotiations.list.yourMove")}
      aria-label={t("negotiations.list.yourMove")}
    />
  )
}

/**
 * An amount with "net" or "gross" ("108,00 zł gross"), so nobody has to guess
 * which one the customer means. A thread is net or gross as the catalog
 * price it started from.
 */
export function useBasisMoney() {
  const { t, i18n } = useTranslation()
  return (amount: number | null | undefined, currency: string, taxInclusive: boolean) =>
    t("negotiations.basis.amount", {
      amount: money(amount, currency, i18n.language),
      basis: t(taxInclusive ? "negotiations.basis.gross" : "negotiations.basis.net"),
    })
}

/** "Net prices" / "Gross prices" next to a thread's number. */
export const BasisBadge = ({ taxInclusive }: { taxInclusive: boolean }) => {
  const { t } = useTranslation()
  return (
    <Badge size="2xsmall" color="grey">
      {t(taxInclusive ? "negotiations.basis.badgeGross" : "negotiations.basis.badgeNet")}
    </Badge>
  )
}

/** A price, net or gross, with how far it is below the catalog price. */
export const PriceWithDiscount = ({
  amount,
  bp,
  currency,
  taxInclusive,
}: {
  amount: number
  bp: number | null
  currency: string
  taxInclusive: boolean
}) => {
  const { i18n, t } = useTranslation()
  const basisMoney = useBasisMoney()
  return (
    <div className="flex flex-col">
      <Text size="small" weight="plus">
        {basisMoney(amount, currency, taxInclusive)}
      </Text>
      {bp !== null && bp !== 0 && (
        <Text size="xsmall" className={bp > 0 ? "text-ui-fg-subtle" : "text-ui-tag-orange-text"}>
          {bp > 0
            ? t("negotiations.price.below", { value: percent(bp, i18n.language) })
            : t("negotiations.price.above", { value: percent(-bp, i18n.language) })}
        </Text>
      )}
    </div>
  )
}

/** Tabs styled the same in every integration (kit). */
export { TAB_CLASS, TabTrigger } from "../../lib/negotiations/kit/ui"

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center justify-center rounded-lg border border-dashed border-ui-border-base px-6 py-8">
    <Text size="small" className="text-ui-fg-subtle">
      {children}
    </Text>
  </div>
)

export const Tile = ({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: "blue" | "warn"
}) => (
  <div className="flex flex-col gap-y-1 rounded-lg bg-ui-bg-base p-4 shadow-elevation-card-rest">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text
      size="large"
      weight="plus"
      className={tone === "blue" ? "text-ui-fg-interactive" : tone === "warn" ? "text-ui-tag-orange-text" : undefined}
    >
      {value}
    </Text>
    {hint && (
      <Text size="xsmall" className="text-ui-fg-muted">
        {hint}
      </Text>
    )}
  </div>
)

/** A refusal from the admin API in the admin's language, from its code (English message as a fallback). */
export function useErrorText() {
  const { t } = useTranslation()
  return (error: unknown) => {
    const e = apiError(error)
    if (e.code) {
      const key = `negotiations.errors.${e.code}`
      const text = t(key, { ...(e.params ?? {}), defaultValue: "" })
      if (text) return text
    }
    return e.message ?? t("negotiations.errors.unknown")
  }
}

export function productLabel(thread: Pick<Thread, "kind" | "lines">, cartLabel: string): string {
  if (thread.kind === "cart") return cartLabel
  const line = thread.lines[0]
  return line ? [line.product_title, line.variant_title].filter(Boolean).join(" · ") : "—"
}

/** The minimum price and maximum discount warnings for a price, as lines of text; `null` when none. */
export function floorWarning(
  check: FloorCheck | null,
  currency: string,
  lang: string,
  t: (key: string, options: Record<string, string>) => string
) {
  if (!check?.needs_confirmation) return null
  const parts = check.below.map((b) =>
    t("negotiations.floor.line", {
      price: money(b.unit_price, currency, lang),
      floor: money(b.floor, currency, lang),
      difference: money(b.difference_total, currency, lang),
    })
  )
  if (check.max_discount) {
    parts.push(
      t("negotiations.floor.maxDiscount", {
        max: percent(check.max_discount.max_basis_points, lang),
        min: money(check.max_discount.min_total, currency, lang),
        difference: money(check.max_discount.difference, currency, lang),
      })
    )
  }
  return parts
}
