import { Badge, toast } from "@medusajs/ui"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import type { Advert, Issue, WriteResult } from "../../lib/olx/api"

export const BRAND_COLOR = "#0f766e"

const STATUS_COLOR: Record<string, "green" | "orange" | "red" | "grey" | "blue"> = {
  active: "green",
  new: "blue",
  publishing: "blue",
  limited: "orange",
  unpaid: "orange",
  unconfirmed: "orange",
  outdated: "grey",
  removed_by_user: "grey",
  failed: "red",
  moderated: "red",
  blocked: "red",
  disabled: "red",
  removed_by_moderator: "red",
}

export const ADVERT_STATUSES = Object.keys(STATUS_COLOR)

/** The advert's state, with "sold" taking priority over OLX's plain "removed". */
export const StatusBadge = ({ advert }: { advert: Pick<Advert, "status" | "sold_channel" | "pending_deactivate"> }) => {
  const { t } = useTranslation()
  if (advert.pending_deactivate) {
    return (
      <Badge size="2xsmall" color="orange">
        {t("olx.status.taking_down")}
      </Badge>
    )
  }
  if (advert.status === "removed_by_user" && advert.sold_channel) {
    return (
      <Badge size="2xsmall" color="grey">
        {t(`olx.status.sold_${advert.sold_channel}`)}
      </Badge>
    )
  }
  return (
    <Badge size="2xsmall" color={STATUS_COLOR[advert.status] ?? "grey"}>
      {t(`olx.status.${advert.status}`, { defaultValue: advert.status })}
    </Badge>
  )
}

export const issueText = (t: TFunction, issue: Issue) =>
  `${t(`olx.field.${issue.field}`)}: ${t(`olx.issue.${issue.code}`, { defaultValue: issue.code })}`

/** One line for any write outcome. */
export function resultText(t: TFunction, result: WriteResult): string {
  switch (result.result) {
    case "published":
      return t("olx.result.published")
    case "saved":
      return t("olx.result.saved")
    case "unconfirmed":
      return t("olx.result.unconfirmed")
    case "invalid":
      return result.issues.map((issue) => issueText(t, issue)).join(" · ")
    case "conflict":
      return t(`olx.conflict.${result.code}`)
    case "refused":
      return result.message
  }
}

/** Shows the outcome of a write. True when OLX has (or may have) it. */
export function showResult(t: TFunction, result: WriteResult): boolean {
  const text = resultText(t, result)
  if (result.result === "published" || result.result === "saved") {
    toast.success(text)
    return true
  }
  if (result.result === "unconfirmed") {
    toast.warning(text)
    return true
  }
  toast.error(text)
  return false
}

export const formatPln = (value: string | null | undefined, locale: string) => {
  const amount = Number(value)
  return value && Number.isFinite(amount)
    ? new Intl.NumberFormat(locale, { style: "currency", currency: "PLN" }).format(amount)
    : "—"
}
