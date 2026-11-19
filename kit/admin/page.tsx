import { ArrowPath, ChevronDownMini } from "@medusajs/icons"
import { Badge, Button, clx, Container, Heading, Skeleton, Table, Tabs, Text } from "@medusajs/ui"
import { type ReactNode, useId, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { useKitText } from "./texts"

/**
 * The parts every integration's page is built from, so they all look and
 * behave the same:
 *
 *   <DemoBar/>                       (demo.tsx, in demo mode)
 *   <Container> PageHeader           icon, title + state badge, description, Refresh
 *               PageTabs             the tabs, actions at the right end
 *               DisabledNotice       when options are missing
 *   </Container>
 *   tab content                      Empty, LoadingBlock, OptionsCard, GuideSections
 *
 * Tab order: the plugin's data tabs, then Settings, then Guide.
 */

export type PageState = "on" | "demo" | "off" | null

const STATE_COLOR = { on: "green", demo: "orange", off: "red" } as const

export const PageHeader = ({
  icon,
  title,
  description,
  state,
  onRefresh,
  refreshing = false,
  actions,
}: {
  /** `PageIcon` or `PageLogo`. */
  icon: ReactNode
  title: string
  description: string
  /** Badge next to the title: running, demo mode, or disabled; `null` while loading. */
  state: PageState
  onRefresh?: () => void
  refreshing?: boolean
  /** Extra buttons, left of Refresh. */
  actions?: ReactNode
}) => {
  const k = useKitText()
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div className="flex min-w-0 items-center gap-x-3">
        {icon}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2">
            <Heading>{title}</Heading>
            {state && (
              <Badge size="2xsmall" color={STATE_COLOR[state]}>
                {k(state === "on" ? "stateOn" : state === "demo" ? "demoTitle" : "stateOff")}
              </Badge>
            )}
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {description}
          </Text>
        </div>
      </div>
      <div className="flex items-center gap-x-2">
        {actions}
        {onRefresh && (
          <Button size="small" variant="secondary" isLoading={refreshing} onClick={onRefresh}>
            <ArrowPath />
            {k("refresh")}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * The tab row: `Tabs.List` content on the left, `actions` (e.g. `DemoResetButton`) on the right.
 * The list scrolls sideways on narrow screens; the padding (taken back with a
 * negative margin) keeps the active tab's shadow from being clipped by it.
 */
export const PageTabs = <T extends string>({
  value,
  onChange,
  children,
  actions,
}: {
  value: T
  onChange: (value: T) => void
  children: ReactNode
  actions?: ReactNode
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
    <Tabs value={value} onValueChange={(next) => onChange(next as T)} className="-m-1 min-w-0 overflow-x-auto p-1">
      <Tabs.List>{children}</Tabs.List>
    </Tabs>
    {actions}
  </div>
)

/**
 * The open tab, kept in the URL (`?tab=`), so reloading or coming back from
 * a detail page returns to it. Unknown values fall back to the first tab.
 */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T = tabs[0]): [T, (tab: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get("tab") as T | null
  const tab = raw && tabs.includes(raw) ? raw : fallback
  const setTab = (next: T) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        if (next === tabs[0]) copy.delete("tab")
        else copy.set("tab", next)
        return copy
      },
      { replace: true }
    )
  return [tab, setTab]
}

/** Shown under the tabs when the plugin is disabled: why, and what to do. */
export const DisabledNotice = ({ reason, hint }: { reason: string | null; hint: string }) => {
  const k = useKitText()
  return (
    <div className="flex flex-col gap-y-1 px-6 py-4">
      <Text size="small" weight="plus" className="text-ui-fg-error">
        {k("disabledTitle")}
      </Text>
      {reason && (
        <Text size="small" className="text-ui-fg-error">
          {reason}
        </Text>
      )}
      <Text size="small" className="text-ui-fg-subtle">
        {hint}
      </Text>
    </div>
  )
}

/** Nothing to show: one sentence in a dashed box, and optionally what to do. */
export const Empty = ({ children, action }: { children?: ReactNode; action?: ReactNode }) => {
  const k = useKitText()
  return (
    <div className="flex flex-col items-center justify-center gap-y-2 rounded-lg border border-dashed border-ui-border-base px-6 py-8 text-center">
      <Text size="small" className="text-ui-fg-subtle">
        {children ?? k("noneHere")}
      </Text>
      {action}
    </div>
  )
}

/** The one loading placeholder: a block the size of a short card. */
export const LoadingBlock = ({ className }: { className?: string }) => <Skeleton className={className ?? "m-6 h-24"} />

/**
 * The one pager under every list: Medusa's own table pagination, translated,
 * driven by an offset. Hidden when everything fits on one page.
 */
export const Pager = ({
  offset,
  limit,
  count,
  onChange,
}: {
  offset: number
  limit: number
  count: number
  onChange: (offset: number) => void
}) => {
  const k = useKitText()
  if (count <= limit) return null
  const pageCount = Math.ceil(count / limit)
  const pageIndex = Math.floor(offset / limit)
  return (
    <Table.Pagination
      count={count}
      pageSize={limit}
      pageIndex={pageIndex}
      pageCount={pageCount}
      canPreviousPage={offset > 0}
      canNextPage={offset + limit < count}
      previousPage={() => onChange(Math.max(0, offset - limit))}
      nextPage={() => onChange(offset + limit)}
      translations={{
        of: k("pagerOf"),
        results: k("pagerResults"),
        pages: k("pagerPages"),
        prev: k("pagerPrev"),
        next: k("pagerNext"),
      }}
    />
  )
}

/** One option: its name as written in medusa-config.ts, and its value. */
export type OptionRow = [name: string, value: ReactNode | boolean | number | string | string[] | null | undefined]

/**
 * The end of every Settings tab, always the last card: the options from
 * medusa-config.ts, which the admin can only read, and the plugin version.
 * Folded by default (only the title and the version show); a click opens
 * it. Names are shown as they are written in the config; values are
 * formatted the same everywhere.
 */
export const OptionsCard = ({ rows, version }: { rows: OptionRow[]; version?: string | null }) => {
  const k = useKitText()
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const show = (value: OptionRow[1]): ReactNode => {
    if (value === null || value === undefined || value === "") return <span className="text-ui-fg-muted">—</span>
    if (typeof value === "boolean") {
      return (
        <Badge size="2xsmall" color={value ? "green" : "grey"}>
          {k(value ? "yes" : "no")}
        </Badge>
      )
    }
    if (Array.isArray(value)) return value.length ? value.join(", ") : <span className="text-ui-fg-muted">—</span>
    return typeof value === "number" ? String(value) : value
  }
  return (
    <Container className="overflow-hidden divide-y p-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        className="hover:bg-ui-bg-base-hover flex w-full items-center justify-between gap-x-4 px-6 py-4 text-left transition-colors"
      >
        <div className="min-w-0">
          <Heading level="h2">{k("optionsTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {k("optionsHint")}
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-x-3">
          {version && (
            <Text size="xsmall" className="text-ui-fg-muted font-mono" title={k("version")}>
              v{version}
            </Text>
          )}
          <ChevronDownMini className={clx("text-ui-fg-muted transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open && (
        <div id={bodyId} className="grid grid-cols-1 gap-x-8 gap-y-4 px-6 py-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(([name, value]) => (
            <div key={name} className="flex min-w-0 flex-col gap-y-1">
              <Text size="xsmall" className="font-mono text-ui-fg-subtle">
                {name}
              </Text>
              <div className="txt-compact-small break-words">{show(value)}</div>
            </div>
          ))}
          {version && (
            <div className="flex flex-col gap-y-1">
              <Text size="xsmall" className="text-ui-fg-subtle">
                {k("version")}
              </Text>
              <div className="txt-compact-small font-mono">{version}</div>
            </div>
          )}
        </div>
      )}
    </Container>
  )
}

/** The Guide tab: the plugin in plain words, section by section. */
export const GuideSections = ({
  title,
  subtitle,
  sections,
  children,
}: {
  title: string
  subtitle: string
  sections: Array<{ title: string; text: string }>
  /** Anything after the sections (steps, an AI prompt…). */
  children?: ReactNode
}) => (
  <Container className="overflow-hidden flex flex-col gap-y-6 px-6 py-6">
    <div>
      <Heading level="h2">{title}</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        {subtitle}
      </Text>
    </div>
    {sections.map((section) => (
      <section key={section.title} className="flex max-w-3xl flex-col gap-y-1">
        <Text weight="plus">{section.title}</Text>
        <Text size="small" className="whitespace-pre-line text-ui-fg-subtle">
          {section.text}
        </Text>
      </section>
    ))}
    {children}
  </Container>
)
