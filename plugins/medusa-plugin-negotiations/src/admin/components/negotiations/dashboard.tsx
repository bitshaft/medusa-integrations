import { Container, Heading, Skeleton } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useStats } from "../../lib/negotiations/api"
import { duration, totals } from "../../lib/negotiations/format"
import { Tile } from "./shared"
import { ThreadList } from "./thread-list"

/** The "Panel" tab: counters and the thread list. */
export const Dashboard = () => {
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useStats()
  const s = data?.stats
  const lang = i18n.language
  return (
    <div className="flex flex-col gap-y-3">
      {isLoading || !s ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Tile label={t("negotiations.stats.waiting")} value={s.waiting} tone={s.waiting ? "blue" : undefined} />
          <Tile label={t("negotiations.stats.open")} value={s.open} />
          <Tile label={t("negotiations.stats.countered")} value={s.countered} />
          <Tile label={t("negotiations.stats.inTalks")} value={totals(s.in_talks, lang)} />
          <Tile
            label={t("negotiations.stats.expiringSoon")}
            value={s.expiring_soon}
            tone={s.expiring_soon ? "warn" : undefined}
          />
          <Tile label={t("negotiations.stats.accepted30")} value={s.accepted_30} />
          <Tile label={t("negotiations.stats.agreed30")} value={totals(s.agreed_30, lang)} />
          <Tile label={t("negotiations.stats.rejected30")} value={s.rejected_30} />
          <Tile label={t("negotiations.stats.expired30")} value={s.expired_30} />
          <Tile
            label={t("negotiations.stats.firstReply")}
            value={duration(s.first_reply_seconds, lang)}
            hint={t("negotiations.stats.last30")}
          />
        </div>
      )}
      <Container className="p-0 pb-2">
        <div className="px-6 pt-4">
          <Heading level="h2">{t("negotiations.list.title")}</Heading>
        </div>
        <ThreadList showOldest />
      </Container>
    </div>
  )
}
