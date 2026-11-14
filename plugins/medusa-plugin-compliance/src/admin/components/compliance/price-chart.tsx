import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { PricePoint } from "../../lib/compliance/api"
import { money, shortDate } from "../../lib/compliance/format"

const W = 640
const H = 180
const PAD = { top: 12, right: 12, bottom: 24, left: 64 }

/**
 * A step chart of one price series: the price paid (solid), the regular
 * price (dashed) and the Omnibus period before the discount (shaded). Uses
 * the admin's colour tokens, so it follows the light and dark theme.
 */
export const PriceChart = ({
  points,
  currency,
  periodStart,
  discountStart,
  lowest,
}: {
  points: PricePoint[]
  currency: string
  periodStart: string | null
  discountStart: string | null
  lowest: number | null
}) => {
  const { t, i18n } = useTranslation()
  if (!points.length) return null
  const lang = i18n.language
  const now = Date.now()
  const first = Math.min(new Date(points[0].at).getTime(), periodStart ? new Date(periodStart).getTime() : Infinity)
  const span = Math.max(now - first, 86_400_000)
  const values = points.flatMap((p) => [p.amount, p.regular]).concat(lowest ?? [])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min || max || 1) * 0.15
  const lo = Math.max(0, min - pad)
  const hi = max + pad

  const x = (ms: number) => PAD.left + ((ms - first) / span) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)
  const step = (key: "amount" | "regular") => {
    let d = ""
    points.forEach((p, i) => {
      const px = x(new Date(p.at).getTime())
      const py = y(p[key])
      d += i === 0 ? `M${px},${py}` : `H${px}V${py}`
    })
    return `${d}H${x(now)}`
  }
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1]

  return (
    <div className="flex flex-col gap-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={t("compliance.omnibus.chartLabel")}
        style={{ maxHeight: 220 }}
      >
        {periodStart && discountStart && (
          <rect
            x={x(new Date(periodStart).getTime())}
            y={PAD.top}
            width={Math.max(0, x(new Date(discountStart).getTime()) - x(new Date(periodStart).getTime()))}
            height={H - PAD.top - PAD.bottom}
            fill="var(--bg-subtle-pressed, rgba(128,128,128,0.15))"
          />
        )}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border-base, #e4e4e7)"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--fg-muted, #71717a)">
              {money(v, currency, lang)}
            </text>
          </g>
        ))}
        {lowest != null && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(lowest)}
            y2={y(lowest)}
            stroke="var(--tag-orange-icon, #f97316)"
            strokeDasharray="2 3"
            strokeWidth={1.5}
          />
        )}
        <path
          d={step("regular")}
          fill="none"
          stroke="var(--fg-muted, #a1a1aa)"
          strokeDasharray="5 4"
          strokeWidth={1.5}
        />
        <path d={step("amount")} fill="none" stroke="var(--fg-interactive, #3b82f6)" strokeWidth={2} />
        {points.map((p) => (
          <circle
            key={p.at}
            cx={x(new Date(p.at).getTime())}
            cy={y(p.amount)}
            r={3}
            fill={p.discounted ? "var(--tag-orange-icon, #f97316)" : "var(--fg-interactive, #3b82f6)"}
          >
            <title>{`${shortDate(p.at, lang)}: ${money(p.amount, currency, lang)}`}</title>
          </circle>
        ))}
        <text x={PAD.left} y={H - 6} fontSize={10} fill="var(--fg-muted, #71717a)">
          {shortDate(new Date(first), lang)}
        </text>
        <text x={W - PAD.right} y={H - 6} fontSize={10} textAnchor="end" fill="var(--fg-muted, #71717a)">
          {t("compliance.omnibus.today")}
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Legend color="var(--fg-interactive, #3b82f6)" label={t("compliance.omnibus.legendPrice")} />
        <Legend color="var(--fg-muted, #a1a1aa)" dashed label={t("compliance.omnibus.legendRegular")} />
        {lowest != null && (
          <Legend color="var(--tag-orange-icon, #f97316)" dashed label={t("compliance.omnibus.legendLowest")} />
        )}
        {periodStart && (
          <Legend color="var(--bg-subtle-pressed, #d4d4d8)" block label={t("compliance.omnibus.legendPeriod")} />
        )}
      </div>
    </div>
  )
}

const Legend = ({
  color,
  label,
  dashed,
  block,
}: {
  color: string
  label: string
  dashed?: boolean
  block?: boolean
}) => (
  <span className="flex items-center gap-x-1">
    <svg width={18} height={10} aria-hidden>
      {block ? (
        <rect width={18} height={10} fill={color} />
      ) : (
        <line
          x1={0}
          x2={18}
          y1={5}
          y2={5}
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      )}
    </svg>
    <Text size="xsmall" className="text-ui-fg-subtle" as="span">
      {label}
    </Text>
  </span>
)
