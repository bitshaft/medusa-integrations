import { Badge, Button, Container, Heading, Skeleton, StatusBadge, Text } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { useDashboard } from "../../lib/compliance/api"
import { shortDate } from "../../lib/compliance/format"
import { LegalNote, Tile } from "./shared"

type Tab = "gpsr" | "gdpr" | "omnibus" | "settings"

/** One card per module: on or off, and its open problems. */
export const Dashboard = ({ onOpen }: { onOpen: (tab: Tab) => void }) => {
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useDashboard()
  if (isLoading || !data) return <Skeleton className="h-64 w-full" />
  const lang = i18n.language

  return (
    <div className="flex flex-col gap-y-3">
      <ModuleCard
        title={t("compliance.modules.gpsr")}
        description={t("compliance.dashboard.gpsrHint")}
        on={data.modules.gpsr}
        onOpen={() => onOpen(data.modules.gpsr ? "gpsr" : "settings")}
      >
        <Tile
          label={t("compliance.dashboard.gpsrIncomplete")}
          value={data.gpsr.incomplete}
          tone={data.gpsr.incomplete ? "warn" : "ok"}
          hint={t("compliance.dashboard.ofProducts", { count: data.gpsr.products })}
        />
        <Tile
          label={t("compliance.dashboard.lastCheck")}
          value={shortDate(data.gpsr.checked_at, lang)}
          hint={t("compliance.dashboard.dailyCheck")}
        />
      </ModuleCard>

      <ModuleCard
        title={t("compliance.modules.gdpr")}
        description={t("compliance.dashboard.gdprHint")}
        on={data.modules.gdpr}
        onOpen={() => onOpen(data.modules.gdpr ? "gdpr" : "settings")}
      >
        <Tile
          label={t("compliance.dashboard.openRequests")}
          value={data.gdpr.open}
          tone={data.gdpr.overdue ? "bad" : data.gdpr.due_soon ? "warn" : "ok"}
          hint={
            data.gdpr.overdue
              ? t("compliance.dashboard.overdue", { count: data.gdpr.overdue })
              : data.gdpr.due_soon
                ? t("compliance.dashboard.dueSoon", { count: data.gdpr.due_soon })
                : t("compliance.dashboard.unverified", { count: data.gdpr.unverified })
          }
        />
        <Tile
          label={t("compliance.dashboard.nextDeadline")}
          value={data.gdpr.next_deadline ? shortDate(data.gdpr.next_deadline.deadline_at, lang) : "—"}
          tone={
            data.gdpr.next_deadline && data.gdpr.next_deadline.days_left < 0
              ? "bad"
              : data.gdpr.next_deadline && data.gdpr.next_deadline.days_left <= 7
                ? "warn"
                : undefined
          }
          hint={
            data.gdpr.next_deadline
              ? `${t(`compliance.gdpr.types.${data.gdpr.next_deadline.type}`)} · ${
                  data.gdpr.next_deadline.days_left < 0
                    ? t("compliance.gdpr.overdue", { count: -data.gdpr.next_deadline.days_left })
                    : t("compliance.gdpr.daysLeft", { count: data.gdpr.next_deadline.days_left })
                }`
              : t("compliance.dashboard.noDeadlines")
          }
        />
      </ModuleCard>

      <ModuleCard
        title={t("compliance.modules.omnibus")}
        description={t("compliance.dashboard.omnibusHint")}
        on={data.modules.omnibus}
        onOpen={() => onOpen(data.modules.omnibus ? "omnibus" : "settings")}
      >
        <Tile label={t("compliance.dashboard.discounted")} value={data.omnibus.discounted_products} />
        <Tile
          label={t("compliance.dashboard.incompleteHistory")}
          value={data.omnibus.incomplete}
          tone={data.omnibus.incomplete ? "warn" : "ok"}
          hint={
            data.omnibus.started_at
              ? t("compliance.dashboard.historySince", { date: shortDate(data.omnibus.started_at, lang) })
              : t("compliance.dashboard.historyNotStarted")
          }
        />
      </ModuleCard>

      <LegalNote />
    </div>
  )
}

const ModuleCard = ({
  title,
  description,
  on,
  onOpen,
  children,
}: {
  title: string
  description: string
  on: boolean
  onOpen: () => void
  children: ReactNode
}) => {
  const { t } = useTranslation()
  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-x-2">
            <Heading level="h2">{title}</Heading>
            <StatusBadge color={on ? "green" : "grey"}>
              {on ? t("compliance.dashboard.on") : t("compliance.dashboard.off")}
            </StatusBadge>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {description}
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={onOpen}>
          {on ? t("compliance.dashboard.open") : t("compliance.dashboard.switchOn")}
        </Button>
      </div>
      {on ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
      ) : (
        <Badge size="2xsmall" className="w-fit">
          {t("compliance.dashboard.moduleOff")}
        </Badge>
      )}
    </Container>
  )
}
