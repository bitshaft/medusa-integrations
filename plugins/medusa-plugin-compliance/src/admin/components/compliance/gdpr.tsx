import { ArrowDownTray, PencilSquare, Plus } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Input,
  Label,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  Tabs,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  type ConsentType,
  type CookieCategory,
  exportUrl,
  type Localized,
  type Placement,
  type RequestDetail,
  type RequestType,
  useConsentEntries,
  useConsentTypes,
  useRequest,
  useRequestAction,
  useRequests,
  useSaveConsentType,
} from "../../lib/compliance/api"
import { dateTime, errorMessage, pick, shortDate } from "../../lib/compliance/format"
import {
  DaysLeft,
  Empty,
  LanguageSelect,
  LegalNote,
  Pager,
  RequestStatusBadge,
  Section,
  TextAreaField,
  TextField,
  Toggle,
  TAB_CLASS,
} from "./shared"

const LIMIT = 25
const TYPES: RequestType[] = ["access", "portability", "erasure", "objection", "rectification"]
const PLACEMENTS: Placement[] = ["registration", "checkout", "account", "newsletter", "cookies"]
const COOKIES: CookieCategory[] = ["necessary", "analytics", "marketing"]
const ALL = "__all__"

/** The GDPR tab: data subject requests, consent types and the consent register. */
export const Gdpr = ({
  demo,
  warnDays,
  placeholder,
  languages,
}: {
  demo: boolean
  warnDays: number
  placeholder: string
  /** The store's languages, the default first: consent names and texts are written in each. */
  languages: string[]
}) => {
  const { t } = useTranslation()
  const [tab, setTab] = useState("requests")
  return (
    <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List>
          <Tabs.Trigger className={TAB_CLASS} value="requests">
            {t("compliance.gdpr.requests")}
          </Tabs.Trigger>
          <Tabs.Trigger className={TAB_CLASS} value="types">
            {t("compliance.gdpr.consentTypes")}
          </Tabs.Trigger>
          <Tabs.Trigger className={TAB_CLASS} value="register">
            {t("compliance.gdpr.register")}
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs>
      {tab === "requests" && <Requests demo={demo} warnDays={warnDays} />}
      {tab === "types" && <ConsentTypes demo={demo} placeholder={placeholder} languages={languages} />}
      {tab === "register" && <Register />}
    </Container>
  )
}

/* Requests ------------------------------------------------------------------- */

const Requests = ({ demo, warnDays }: { demo: boolean; warnDays: number }) => {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState("open,accepted")
  const [type, setType] = useState(ALL)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const list = useRequests({
    status: status === ALL ? undefined : status,
    type: type === ALL ? undefined : type,
    limit: LIMIT,
    offset,
  })

  return (
    <div className="flex flex-col gap-y-3">
      <Text size="small" className="text-ui-fg-subtle">
        {t("compliance.gdpr.requestsHint")}
      </Text>
      <div className="flex flex-wrap gap-2">
        <Select size="small" value={status} onValueChange={(v) => (setStatus(v), setOffset(0))}>
          <Select.Trigger className="w-56">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="open,accepted">{t("compliance.gdpr.filterOpen")}</Select.Item>
            <Select.Item value="unverified">{t("compliance.gdpr.status.unverified")}</Select.Item>
            <Select.Item value="completed,rejected,expired">{t("compliance.gdpr.filterClosed")}</Select.Item>
            <Select.Item value={ALL}>{t("compliance.gdpr.filterAll")}</Select.Item>
          </Select.Content>
        </Select>
        <Select size="small" value={type} onValueChange={(v) => (setType(v), setOffset(0))}>
          <Select.Trigger className="w-56">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value={ALL}>{t("compliance.gdpr.allTypes")}</Select.Item>
            {TYPES.map((x) => (
              <Select.Item key={x} value={x}>
                {t(`compliance.gdpr.types.${x}`)}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !list.data?.requests.length ? (
        <Empty>{t("compliance.gdpr.noRequests")}</Empty>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("compliance.gdpr.type")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.gdpr.person")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.gdpr.statusLabel")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.gdpr.received")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.gdpr.deadline")}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {list.data.requests.map((r) => (
                <Table.Row key={r.id} className="cursor-pointer" onClick={() => setSelected(r.id)}>
                  <Table.Cell>{t(`compliance.gdpr.types.${r.type}`)}</Table.Cell>
                  <Table.Cell>{r.email}</Table.Cell>
                  <Table.Cell>
                    <RequestStatusBadge status={r.status} />
                  </Table.Cell>
                  <Table.Cell>{shortDate(r.created_at, i18n.language)}</Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-x-2">
                      <Text size="small">{shortDate(r.deadline_at, i18n.language)}</Text>
                      {r.days_left !== null && <DaysLeft days={r.days_left} warn={warnDays} />}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Pager offset={offset} limit={LIMIT} count={list.data.count} onChange={setOffset} />
        </>
      )}
      <RequestDrawer id={selected} demo={demo} warnDays={warnDays} onClose={() => setSelected(null)} />
    </div>
  )
}

const RequestDrawer = ({
  id,
  demo,
  warnDays,
  onClose,
}: {
  id: string | null
  demo: boolean
  warnDays: number
  onClose: () => void
}) => {
  const { t, i18n } = useTranslation()
  const detail = useRequest(id)
  const act = useRequestAction(id ?? "")
  const prompt = usePrompt()
  const [note, setNote] = useState("")
  const d = detail.data

  const run = async (action: "accept" | "reject" | "complete" | "note" | "anonymize") => {
    if (action === "reject" && !note.trim()) {
      toast.error(t("compliance.gdpr.reasonRequired"))
      return
    }
    if (action === "anonymize") {
      const ok = await prompt({
        title: t("compliance.gdpr.anonymizeConfirm"),
        description: t("compliance.gdpr.anonymizeConfirmHint"),
        confirmText: t("compliance.gdpr.actions.anonymize"),
        cancelText: t("compliance.cancel"),
      })
      if (!ok) return
    }
    act.mutate(
      { action, note: note.trim() || null },
      {
        onSuccess: () => {
          setNote("")
          toast.success(t(`compliance.gdpr.done.${action}`))
        },
        onError: (error) => toast.error(errorMessage(error)),
      }
    )
  }

  return (
    <Drawer open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{d ? t(`compliance.gdpr.types.${d.request.type}`) : t("compliance.gdpr.request")}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          {!d ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Info label={t("compliance.gdpr.person")} value={d.request.email} />
                <Info
                  label={t("compliance.gdpr.statusLabel")}
                  value={<RequestStatusBadge status={d.request.status} />}
                />
                <Info label={t("compliance.gdpr.received")} value={dateTime(d.request.created_at, i18n.language)} />
                <Info label={t("compliance.gdpr.verified")} value={dateTime(d.request.verified_at, i18n.language)} />
                <Info
                  label={t("compliance.gdpr.deadline")}
                  value={
                    <span className="flex items-center gap-x-2">
                      {shortDate(d.request.deadline_at, i18n.language)}
                      {d.request.days_left !== null && <DaysLeft days={d.request.days_left} warn={warnDays} />}
                    </span>
                  }
                />
                <Info
                  label={t("compliance.gdpr.customer")}
                  value={
                    d.request.customer_id && !demo ? (
                      <Link
                        to={`/customers/${d.request.customer_id}`}
                        className="text-ui-fg-interactive hover:underline"
                      >
                        {t("compliance.gdpr.openCustomer")}
                      </Link>
                    ) : (
                      t("compliance.gdpr.noAccount")
                    )
                  }
                />
              </div>
              {d.request.details && (
                <Section title={t("compliance.gdpr.details")}>
                  <Text size="small" className="whitespace-pre-wrap">
                    {d.request.details}
                  </Text>
                </Section>
              )}
              <TypeGuidance detail={d} />
              <Actions detail={d} demo={demo} busy={act.isPending} note={note} setNote={setNote} run={run} />
              <Section title={t("compliance.gdpr.history")}>
                <ol className="flex flex-col gap-y-2">
                  {d.events.map((e) => (
                    <li key={e.id} className="flex flex-col">
                      <Text size="small" weight="plus">
                        {t(`compliance.gdpr.events.${e.action}`)}
                        <span className="text-ui-fg-subtle font-normal">
                          {" · "}
                          {t(`compliance.gdpr.actors.${e.actor_type}`)}
                          {" · "}
                          {dateTime(e.created_at, i18n.language)}
                        </span>
                      </Text>
                      {e.note && (
                        <Text size="small" className="text-ui-fg-subtle whitespace-pre-wrap">
                          {e.note}
                        </Text>
                      )}
                    </li>
                  ))}
                </ol>
              </Section>
            </>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}

const Info = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex flex-col">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="small" as="div">
      {value}
    </Text>
  </div>
)

/** What this kind of request means for the team. */
const TypeGuidance = ({ detail }: { detail: RequestDetail }) => {
  const { t } = useTranslation()
  const { request, erasure } = detail
  return (
    <div className="flex flex-col gap-y-2">
      <LegalNote>{t(`compliance.gdpr.guidance.${request.type}`)}</LegalNote>
      {erasure && (
        <Section title={t("compliance.gdpr.erasurePreview")}>
          {erasure.already ? (
            <Text size="small">{t("compliance.gdpr.alreadyAnonymized")}</Text>
          ) : !erasure.customer ? (
            <Text size="small">{t("compliance.gdpr.noCustomerRecord")}</Text>
          ) : (
            <>
              <Text size="small">{t("compliance.gdpr.erasureOrders", { count: erasure.orders })}</Text>
              {erasure.open_orders > 0 && (
                <Badge size="2xsmall" color="orange" className="w-fit">
                  {t("compliance.gdpr.openOrders", { count: erasure.open_orders })}
                </Badge>
              )}
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("compliance.gdpr.erasureScopeHint")}
              </Text>
            </>
          )}
        </Section>
      )}
    </div>
  )
}

const Actions = ({
  detail,
  demo,
  busy,
  note,
  setNote,
  run,
}: {
  detail: RequestDetail
  demo: boolean
  busy: boolean
  note: string
  setNote: (v: string) => void
  run: (action: "accept" | "reject" | "complete" | "note" | "anonymize") => void
}) => {
  const { t } = useTranslation()
  const { request } = detail
  const open = request.status === "open"
  const accepted = request.status === "accepted"
  const exportable =
    (request.type === "access" || request.type === "portability") &&
    (open || accepted || request.status === "completed")
  return (
    <Section title={t("compliance.gdpr.actionsTitle")}>
      <div className="flex flex-col gap-y-1">
        <Label size="xsmall" weight="plus">
          {t("compliance.gdpr.note")}
        </Label>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("compliance.gdpr.notePlaceholder")}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {open && (
          <Button size="small" onClick={() => run("accept")} isLoading={busy} disabled={demo}>
            {t("compliance.gdpr.actions.accept")}
          </Button>
        )}
        {accepted && request.type === "erasure" && (
          <Button size="small" variant="danger" onClick={() => run("anonymize")} isLoading={busy} disabled={demo}>
            {t("compliance.gdpr.actions.anonymize")}
          </Button>
        )}
        {accepted && request.type !== "erasure" && (
          <Button size="small" onClick={() => run("complete")} isLoading={busy} disabled={demo}>
            {t("compliance.gdpr.actions.complete")}
          </Button>
        )}
        {(open || accepted || request.status === "unverified") && (
          <Button size="small" variant="secondary" onClick={() => run("reject")} isLoading={busy} disabled={demo}>
            {t("compliance.gdpr.actions.reject")}
          </Button>
        )}
        <Button
          size="small"
          variant="transparent"
          onClick={() => run("note")}
          isLoading={busy}
          disabled={demo || !note.trim()}
        >
          {t("compliance.gdpr.actions.note")}
        </Button>
      </div>
      {exportable && (
        <div className="flex flex-wrap items-center gap-2">
          <Text size="small">{t("compliance.gdpr.export")}</Text>
          {(["zip", "json"] as const).map((format) => (
            <Button key={format} size="small" variant="secondary" asChild disabled={demo}>
              <a href={demo ? undefined : exportUrl("requests", request.id, format)} download>
                <ArrowDownTray />
                {format.toUpperCase()}
              </a>
            </Button>
          ))}
        </div>
      )}
    </Section>
  )
}

/* Consent types ---------------------------------------------------------------- */

type TypeDraft = {
  key: string
  name: Localized
  placement: Placement
  required: boolean
  active: boolean
  cookie_category: CookieCategory | null
  text: Localized
  isNew: boolean
  latest: number | null
}

const ConsentTypes = ({
  demo,
  placeholder,
  languages,
}: {
  demo: boolean
  placeholder: string
  languages: string[]
}) => {
  const { t, i18n } = useTranslation()
  const types = useConsentTypes()
  const save = useSaveConsentType()
  const [draft, setDraft] = useState<TypeDraft | null>(null)
  // One language at a time, like the e-mail editor; the default (original) first.
  const original = languages[0] ?? "pl"
  const [picked, setPicked] = useState<string | null>(null)
  const language = picked && languages.includes(picked) ? picked : original
  const written = (value: string | undefined) => Boolean(value?.trim()) && value?.trim() !== placeholder
  /** Only the store's languages are saved; text in others is dropped. */
  const inStore = (value: Localized) =>
    Object.fromEntries(languages.filter((lang) => value[lang]?.trim()).map((lang) => [lang, value[lang] as string]))
  const dropped =
    draft !== null &&
    [...Object.keys(draft.name), ...Object.keys(draft.text)].some(
      (lang) => !languages.includes(lang) && (draft.name[lang]?.trim() || draft.text[lang]?.trim())
    )

  const edit = (type: ConsentType) =>
    setDraft({
      key: type.key,
      name: type.name,
      placement: type.placement,
      required: type.required,
      active: type.active,
      cookie_category: type.cookie_category,
      text: type.versions[0]?.text ?? {},
      isNew: false,
      latest: type.versions[0]?.version ?? null,
    })

  const submit = () => {
    if (!draft) return
    const { isNew: _n, latest: _l, ...body } = draft
    save.mutate(
      { ...body, name: inStore(body.name), text: inStore(body.text) },
      {
        onSuccess: (r) => {
          toast.success(
            r.new_version
              ? t("compliance.gdpr.newVersionSaved", { version: r.version })
              : t("compliance.gdpr.typeSaved")
          )
          setDraft(null)
        },
        onError: (error) => toast.error(errorMessage(error)),
      }
    )
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Text size="small" className="text-ui-fg-subtle max-w-2xl">
          {t("compliance.gdpr.consentTypesHint")}
        </Text>
        <Button
          size="small"
          variant="secondary"
          disabled={demo}
          onClick={() =>
            setDraft({
              key: "",
              name: {},
              placement: "registration",
              required: false,
              active: true,
              cookie_category: null,
              text: Object.fromEntries(languages.map((lang) => [lang, placeholder])),
              isNew: true,
              latest: null,
            })
          }
        >
          <Plus />
          {t("compliance.gdpr.newType")}
        </Button>
      </div>
      {types.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !types.data?.types.length ? (
        <Empty>{t("compliance.gdpr.noTypes")}</Empty>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("compliance.gdpr.typeName")}</Table.HeaderCell>
              <Table.HeaderCell>{t("compliance.gdpr.placement")}</Table.HeaderCell>
              <Table.HeaderCell>{t("compliance.gdpr.version")}</Table.HeaderCell>
              <Table.HeaderCell>{t("compliance.gdpr.grantedEntries")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {types.data.types.map((type) => (
              <Table.Row key={type.key}>
                <Table.Cell>
                  <div className="flex items-center gap-x-2">
                    <Text size="small" weight="plus">
                      {pick(type.name, i18n.language) || type.key}
                    </Text>
                    {type.required && <Badge size="2xsmall">{t("compliance.gdpr.required")}</Badge>}
                    {!type.active && <StatusBadge color="grey">{t("compliance.gdpr.inactive")}</StatusBadge>}
                    {type.versions.some((v) => Object.values(v.text).some((x) => x === placeholder)) && (
                      <Badge size="2xsmall" color="orange">
                        {t("compliance.gdpr.needsLawyer")}
                      </Badge>
                    )}
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle font-mono">
                    {type.key}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {t(`compliance.gdpr.placements.${type.placement}`)}
                  {type.cookie_category && ` · ${t(`compliance.gdpr.cookies.${type.cookie_category}`)}`}
                </Table.Cell>
                <Table.Cell>v{type.versions[0]?.version ?? "—"}</Table.Cell>
                <Table.Cell>{type.granted}</Table.Cell>
                <Table.Cell className="text-right">
                  <Button size="small" variant="transparent" disabled={demo} onClick={() => edit(type)}>
                    <PencilSquare />
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      <Drawer open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>{draft?.isNew ? t("compliance.gdpr.newType") : t("compliance.gdpr.editType")}</Drawer.Title>
          </Drawer.Header>
          {draft && (
            <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
              <TextField
                label={t("compliance.gdpr.key")}
                hint={t("compliance.gdpr.keyHint")}
                value={draft.key}
                disabled={!draft.isNew}
                onChange={(key) => setDraft({ ...draft, key: key.toLowerCase() })}
              />
              <div className="flex flex-col gap-y-1">
                <Label size="xsmall" weight="plus">
                  {t("compliance.gdpr.placement")}
                </Label>
                <Select
                  size="small"
                  value={draft.placement}
                  onValueChange={(v) =>
                    setDraft({
                      ...draft,
                      placement: v as Placement,
                      cookie_category: v === "cookies" ? (draft.cookie_category ?? "analytics") : null,
                    })
                  }
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {PLACEMENTS.map((p) => (
                      <Select.Item key={p} value={p}>
                        {t(`compliance.gdpr.placements.${p}`)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              {draft.placement === "cookies" && (
                <div className="flex flex-col gap-y-1">
                  <Label size="xsmall" weight="plus">
                    {t("compliance.gdpr.cookieCategory")}
                  </Label>
                  <Select
                    size="small"
                    value={draft.cookie_category ?? "analytics"}
                    onValueChange={(v) => setDraft({ ...draft, cookie_category: v as CookieCategory })}
                  >
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {COOKIES.map((c) => (
                        <Select.Item key={c} value={c}>
                          {t(`compliance.gdpr.cookies.${c}`)}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
              )}
              <Toggle
                label={t("compliance.gdpr.required")}
                hint={t("compliance.gdpr.requiredHint")}
                checked={draft.required}
                onChange={(required) => setDraft({ ...draft, required })}
              />
              <Toggle
                label={t("compliance.gdpr.active")}
                hint={t("compliance.gdpr.activeHint")}
                checked={draft.active}
                onChange={(active) => setDraft({ ...draft, active })}
              />
              <Section
                title={t("compliance.gdpr.texts")}
                hint={t("compliance.gdpr.textsHint")}
                actions={
                  <LanguageSelect
                    languages={languages}
                    value={language}
                    onChange={setPicked}
                    note={(lang) =>
                      !written(draft.text[lang])
                        ? t("compliance.languages.toFill")
                        : !draft.name[lang]?.trim()
                          ? t("compliance.languages.noName")
                          : null
                    }
                  />
                }
              >
                <TextField
                  label={t("compliance.gdpr.typeName")}
                  value={draft.name[language] ?? ""}
                  placeholder={language !== original ? draft.name[original] : undefined}
                  onChange={(v) => setDraft({ ...draft, name: { ...draft.name, [language]: v } })}
                />
                <LegalNote>{t("compliance.gdpr.textHint", { placeholder })}</LegalNote>
                <TextAreaField
                  key={language}
                  rows={6}
                  label={t("compliance.gdpr.text")}
                  value={draft.text[language] ?? ""}
                  onChange={(v) => setDraft({ ...draft, text: { ...draft.text, [language]: v } })}
                />
                {dropped && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {t("compliance.languages.dropped")}
                  </Text>
                )}
              </Section>
              {!draft.isNew && (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {t("compliance.gdpr.versionHint", { version: draft.latest ?? 0 })}
                </Text>
              )}
            </Drawer.Body>
          )}
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button size="small" variant="secondary">
                {t("compliance.cancel")}
              </Button>
            </Drawer.Close>
            <Button
              size="small"
              onClick={submit}
              isLoading={save.isPending}
              disabled={!draft?.key || !languages.length}
            >
              {t("compliance.save")}
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </div>
  )
}

/* Register ------------------------------------------------------------------- */

const Register = () => {
  const { t, i18n } = useTranslation()
  const types = useConsentTypes()
  const [type, setType] = useState(ALL)
  const [email, setEmail] = useState("")
  const [offset, setOffset] = useState(0)
  const entries = useConsentEntries({
    type_key: type === ALL ? undefined : type,
    email: email.trim() || undefined,
    limit: LIMIT,
    offset,
  })

  return (
    <div className="flex flex-col gap-y-3">
      <Text size="small" className="text-ui-fg-subtle">
        {t("compliance.gdpr.registerHint")}
      </Text>
      <div className="flex flex-wrap gap-2">
        <Select size="small" value={type} onValueChange={(v) => (setType(v), setOffset(0))}>
          <Select.Trigger className="w-56">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value={ALL}>{t("compliance.gdpr.allConsents")}</Select.Item>
            {(types.data?.types ?? []).map((x) => (
              <Select.Item key={x.key} value={x.key}>
                {pick(x.name, i18n.language) || x.key}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Input
          size="small"
          type="search"
          className="w-64"
          placeholder={t("compliance.gdpr.searchEmail")}
          value={email}
          onChange={(e) => (setEmail(e.target.value), setOffset(0))}
        />
      </div>
      {entries.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !entries.data?.entries.length ? (
        <Empty>{t("compliance.gdpr.noEntries")}</Empty>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("compliance.gdpr.when")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.gdpr.consent")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.gdpr.choice")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.gdpr.subject")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.gdpr.source")}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {entries.data.entries.map((e) => (
                <Table.Row key={e.id}>
                  <Table.Cell>{dateTime(e.created_at, i18n.language)}</Table.Cell>
                  <Table.Cell>
                    {e.type_key} <span className="text-ui-fg-subtle">v{e.version}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={e.granted ? "green" : "red"}>
                      {e.granted ? t("compliance.gdpr.granted") : t("compliance.gdpr.withdrawn")}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell>
                    {e.email ??
                      (e.customer_id
                        ? t("compliance.gdpr.customerAccount")
                        : `${t("compliance.gdpr.browser")} ${e.anonymous_id?.slice(0, 8)}…`)}
                  </Table.Cell>
                  <Table.Cell>{t(`compliance.gdpr.sources.${e.source}`)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Pager offset={offset} limit={LIMIT} count={entries.data.count} onChange={setOffset} />
        </>
      )}
    </div>
  )
}
