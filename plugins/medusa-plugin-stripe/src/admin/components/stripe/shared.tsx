import { ExclamationCircle, InformationCircleSolid } from "@medusajs/icons"
import { Badge, StatusBadge, Text } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import type { Check, Completeness, OrderRef } from "../../lib/stripe/api"

/** Shown on every tab while demo mode is on. */
export const DemoBar = () => {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      className="flex items-start gap-x-3 rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg px-4 py-3"
    >
      <ExclamationCircle className="mt-0.5 shrink-0 text-ui-tag-orange-icon" />
      <div>
        <Text size="small" weight="plus" className="text-ui-tag-orange-text">
          {t("stripe.demo.title")}
        </Text>
        <Text size="xsmall" className="text-ui-tag-orange-text">
          {t("stripe.demo.body")}
        </Text>
      </div>
    </div>
  )
}

/**
 * Says when data is incomplete: cut at 1000 items or by the time limit.
 * Shown next to lists and next to every total built from them.
 */
export const Incomplete = ({ data, compact }: { data: Completeness | undefined; compact?: boolean }) => {
  const { t } = useTranslation()
  if (!data?.partial) return null
  const text = data.truncated.length ? t("stripe.incomplete.truncated") : t("stripe.incomplete.timeout")
  if (compact) {
    return (
      <Badge size="2xsmall" color="orange" className="w-fit">
        {t("stripe.incomplete.badge")}
      </Badge>
    )
  }
  return (
    <div className="flex items-start gap-x-2 rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg px-3 py-2">
      <ExclamationCircle className="mt-0.5 shrink-0 text-ui-tag-orange-icon" />
      <Text size="small" className="text-ui-tag-orange-text">
        {text}
      </Text>
    </div>
  )
}

export const Note = ({ children }: { children: ReactNode }) => (
  <div className="flex items-start gap-x-2 rounded-lg bg-ui-bg-subtle px-4 py-3">
    <InformationCircleSolid className="mt-0.5 shrink-0 text-ui-fg-muted" />
    <Text size="xsmall" className="text-ui-fg-subtle">
      {children}
    </Text>
  </div>
)

export const Tile = ({
  label,
  value,
  hint,
  warn,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  /** Shown under the value: e.g. "incomplete data". */
  warn?: ReactNode
  tone?: "bad" | "warn"
}) => (
  <div className="flex flex-col gap-y-1 rounded-lg bg-ui-bg-base p-4 shadow-elevation-card-rest">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text
      size="large"
      weight="plus"
      className={tone === "bad" ? "text-ui-fg-error" : tone === "warn" ? "text-ui-tag-orange-text" : undefined}
    >
      {value}
    </Text>
    {hint && (
      <Text size="xsmall" className="text-ui-fg-muted">
        {hint}
      </Text>
    )}
    {warn}
  </div>
)

/** Tabs styled the same in every integration (kit). */
export { TAB_CLASS, TabTrigger } from "../../lib/stripe/kit/ui"

export const OrderLink = ({ order, demo }: { order: OrderRef | null; demo: boolean }) => {
  const { t } = useTranslation()
  if (!order)
    return (
      <Text size="small" className="text-ui-fg-muted">
        —
      </Text>
    )
  const label = order.display_id ? `#${order.display_id}` : t("stripe.order")
  return demo ? (
    <Text size="small">{label}</Text>
  ) : (
    <Link
      to={`/orders/${order.id}`}
      className="txt-compact-small text-ui-fg-interactive hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </Link>
  )
}

export const ExternalLink = ({ href, children }: { href: string | null; children: ReactNode }) =>
  href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="txt-compact-small text-ui-fg-interactive hover:underline"
    >
      {children}
    </a>
  ) : null

const STATUS_COLOR: Record<string, "green" | "orange" | "red" | "grey" | "blue" | "purple"> = {
  succeeded: "green",
  paid: "green",
  requires_capture: "purple",
  processing: "blue",
  in_transit: "blue",
  pending: "blue",
  requires_action: "orange",
  requires_payment_method: "red",
  requires_confirmation: "orange",
  canceled: "grey",
  failed: "red",
}

export const StripeStatus = ({ status }: { status: string }) => {
  const { t } = useTranslation()
  return (
    <StatusBadge color={STATUS_COLOR[status] ?? "grey"}>
      {t(`stripe.status.${status}`, { defaultValue: status.replace(/_/g, " ") })}
    </StatusBadge>
  )
}

const RISK_COLOR: Record<string, "green" | "orange" | "red" | "grey"> = {
  normal: "green",
  elevated: "orange",
  highest: "red",
}

export const Risk = ({ level, score }: { level: string | null; score: number | null }) => {
  const { t } = useTranslation()
  if (!level)
    return (
      <Text size="small" className="text-ui-fg-muted">
        —
      </Text>
    )
  return (
    <Badge size="2xsmall" color={RISK_COLOR[level] ?? "grey"}>
      {t(`stripe.risk.${level}`, { defaultValue: level })}
      {score != null ? ` · ${score}` : ""}
    </Badge>
  )
}

export const Verdict = ({ verdict }: { verdict: Check["verdict"] }) => {
  const { t } = useTranslation()
  const color = verdict === "ok" ? "green" : verdict === "warn" ? "orange" : "red"
  return <StatusBadge color={color}>{t(`stripe.checks.verdict.${verdict}`)}</StatusBadge>
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center justify-center rounded-lg border border-dashed border-ui-border-base px-6 py-8">
    <Text size="small" className="text-ui-fg-subtle">
      {children}
    </Text>
  </div>
)
