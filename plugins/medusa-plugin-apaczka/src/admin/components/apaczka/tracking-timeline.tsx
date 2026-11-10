import { clx, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { TrackingEvent } from "../../lib/apaczka/api"
import { formatDateTime, STATUS_COLORS } from "../../lib/apaczka/format"

const DOT_COLORS: Record<string, string> = {
  green: "bg-ui-tag-green-icon",
  red: "bg-ui-tag-red-icon",
  blue: "bg-ui-tag-blue-icon",
  orange: "bg-ui-tag-orange-icon",
  purple: "bg-ui-tag-purple-icon",
  grey: "bg-ui-tag-neutral-icon",
}

export const TrackingTimeline = ({ events }: { events: TrackingEvent[] }) => {
  const { t, i18n } = useTranslation()

  if (!events.length) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        {t("apaczka.history.empty")}
      </Text>
    )
  }

  return (
    <ol className="flex flex-col gap-y-3">
      {events.map((event, index) => (
        <li key={event.id} className="grid grid-cols-[12px_1fr] gap-x-3">
          <div className="flex flex-col items-center">
            <span
              className={clx("mt-1.5 size-2 rounded-full", DOT_COLORS[STATUS_COLORS[event.status]] ?? DOT_COLORS.grey)}
            />
            {index < events.length - 1 && <span className="bg-ui-border-base mt-1 w-px flex-1" />}
          </div>
          <div className="flex flex-col pb-1">
            <div className="flex items-center justify-between gap-x-2">
              <Text size="small" weight="plus" leading="compact">
                {t(`apaczka.status.${event.status}`)}
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted whitespace-nowrap">
                {formatDateTime(event.occurred_at, i18n.language)}
              </Text>
            </div>
            {(event.description || event.place) && (
              <Text size="small" className="text-ui-fg-subtle">
                {[event.description, event.place].filter(Boolean).join(" · ")}
              </Text>
            )}
            <Text size="xsmall" className="text-ui-fg-muted">
              {event.raw_status} · {t(`apaczka.history.source.${event.source}`)}
            </Text>
          </div>
        </li>
      ))}
    </ol>
  )
}
