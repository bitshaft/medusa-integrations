import { ArrowUpRightOnBox, Check, XMark } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Prompt, Select, Text, Textarea, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  apiError,
  type Message,
  type Offer,
  type Thread,
  type ThreadDetail,
  useThreadAction,
  useUsers,
} from "../../lib/negotiations/api"
import { customerName, dateTime, money, percent, relative } from "../../lib/negotiations/format"
import { CounterForm } from "./counter-form"
import { DraftOrderPanel } from "./draft-order"
import { BasisBadge, DemoBadge, floorWarning, Note, StatusLabel, TurnDot, useBasisMoney, useErrorText } from "./shared"

const ACTIVE = ["open", "countered"]

export const ThreadView = ({ detail }: { detail: ThreadDetail }) => {
  const thread = detail.negotiation
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-y-3">
        <Conversation detail={detail} />
        {ACTIVE.includes(thread.status) && <YourMove detail={detail} />}
      </div>
      <div className="flex w-full flex-col gap-y-3 xl:w-[400px] xl:shrink-0">
        <Details detail={detail} />
        {thread.status === "accepted" && <DraftOrderPanel detail={detail} />}
      </div>
    </div>
  )
}

/* Details ------------------------------------------------------------------- */

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[150px_1fr] items-start gap-x-3 px-6 py-2">
    <Text size="small" className="text-ui-fg-subtle">
      {label}
    </Text>
    <div className="min-w-0 text-right">
      {typeof children === "string" || typeof children === "number" ? <Text size="small">{children}</Text> : children}
    </div>
  </div>
)

const Details = ({ detail }: { detail: ThreadDetail }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const thread = detail.negotiation
  const c = thread.currency_code
  const users = useUsers()
  const assign = useThreadAction<{ user_id: string | null }>(thread.id, "assign")
  const errorText = useErrorText()
  const line = thread.lines[0]
  const ours = thread.accepted ?? thread.offer
  const discount = (amount: number) =>
    thread.catalog_total ? Math.round(((thread.catalog_total - amount) * 10_000) / thread.catalog_total) : null

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="flex items-start justify-between gap-2 px-6 py-4">
        <div>
          <div className="flex items-center gap-x-2">
            <TurnDot thread={thread} />
            <Heading level="h2" className="font-mono">
              {thread.number}
            </Heading>
            {thread.is_demo && <DemoBadge />}
            <BasisBadge taxInclusive={thread.tax_inclusive} />
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {thread.kind === "cart" ? t("negotiations.list.wholeCart") : t("negotiations.thread.productThread")}
          </Text>
        </div>
        <StatusLabel status={thread.status} />
      </div>
      <div className="py-2">
        <Row label={t("negotiations.thread.customer")}>
          <Text size="small">{customerName(thread.customer)}</Text>
          {thread.customer.email && (
            <Text size="xsmall" className="text-ui-fg-subtle">
              {thread.customer.email}
            </Text>
          )}
        </Row>
        {thread.kind === "product" && line && (
          <>
            <Row label={t("negotiations.thread.product")}>
              {[line.product_title, line.variant_title].filter(Boolean).join(" · ")}
            </Row>
            <Row label="SKU">
              <Text size="small" className="font-mono">
                {line.sku ?? "—"}
              </Text>
            </Row>
          </>
        )}
        <Row label={t("negotiations.thread.quantity")}>{thread.quantity_total}</Row>
        <Row label={t("negotiations.thread.taxBasis")}>
          <Text size="small" weight="plus">
            {thread.tax_inclusive ? t("negotiations.basis.rowGross") : t("negotiations.basis.rowNet")}
          </Text>
        </Row>
        {thread.kind === "product" && line && (
          <Row label={t("negotiations.thread.catalogUnit")}>{money(line.catalog_unit_price, c, lang)}</Row>
        )}
        <Row label={t("negotiations.thread.catalogTotal")}>{money(thread.catalog_total, c, lang)}</Row>
        <Row label={t("negotiations.thread.target")}>
          <Text size="small">{money(thread.target_total, c, lang)}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("negotiations.price.below", { value: percent(discount(thread.target_total), lang) })}
          </Text>
        </Row>
        <Row label={thread.accepted ? t("negotiations.thread.agreed") : t("negotiations.thread.ourOffer")}>
          {ours ? (
            <>
              <Text size="small" weight="plus">
                {money(ours.total, c, lang)}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("negotiations.thread.discount", {
                  value: percent(discount(ours.total), lang),
                  amount: money(thread.catalog_total - ours.total, c, lang),
                })}
              </Text>
            </>
          ) : (
            "—"
          )}
        </Row>
        {thread.offer_expires_at && thread.status === "countered" && (
          <Row label={t("negotiations.thread.offerValid")}>{dateTime(thread.offer_expires_at, lang)}</Row>
        )}
        {thread.accepted_until && (
          <Row label={t("negotiations.thread.acceptedUntil")}>{dateTime(thread.accepted_until, lang)}</Row>
        )}
        <Row label={t("negotiations.thread.started")}>{dateTime(thread.created_at, lang)}</Row>
        <Row label={t("negotiations.thread.expires")}>
          {thread.expires_at ? `${dateTime(thread.expires_at, lang)} (${relative(thread.expires_at, lang)})` : "—"}
        </Row>
        <Row label={t("negotiations.thread.assignee")}>
          <Select
            size="small"
            value={thread.assignee_id ?? "none"}
            onValueChange={(value) =>
              assign.mutate({ user_id: value === "none" ? null : value }, { onError: (e) => toast.error(errorText(e)) })
            }
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="none">{t("negotiations.thread.nobody")}</Select.Item>
              {(users.data?.users ?? []).map((u) => (
                <Select.Item key={u.id} value={u.id}>
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </Row>
      </div>
      {thread.kind === "cart" && <CartLines thread={thread} detail={detail} />}
      <div className="flex flex-wrap gap-2 px-6 py-4">
        {!thread.is_demo && (
          <Button size="small" variant="secondary" asChild>
            <Link to={`/customers/${thread.customer_id}`}>
              <ArrowUpRightOnBox />
              {t("negotiations.thread.customerCard")}
            </Link>
          </Button>
        )}
        {!thread.is_demo && thread.kind === "product" && line?.product_id && (
          <Button size="small" variant="secondary" asChild>
            <Link to={`/products/${line.product_id}`}>
              <ArrowUpRightOnBox />
              {t("negotiations.thread.productCard")}
            </Link>
          </Button>
        )}
        {thread.order_id && !thread.is_demo && (
          <Button size="small" variant="secondary" asChild>
            <Link to={thread.draft_order_id ? `/draft-orders/${thread.order_id}` : `/orders/${thread.order_id}`}>
              <ArrowUpRightOnBox />
              {thread.draft_order_id ? t("negotiations.thread.draftOrder") : t("negotiations.thread.order")}
            </Link>
          </Button>
        )}
      </div>
    </Container>
  )
}

const CartLines = ({ thread, detail }: { thread: Thread; detail: ThreadDetail }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const priced = thread.accepted ?? thread.offer
  return (
    <div className="flex flex-col gap-y-2 px-6 py-4">
      <Text size="small" weight="plus">
        {t("negotiations.thread.lines")}
      </Text>
      {thread.lines.map((line) => {
        const offer = priced?.lines.find((l) => l.variant_id === line.variant_id)
        const floor = detail.floors[line.variant_id]
        return (
          <div key={line.variant_id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Text size="small" className="truncate">
                {[line.product_title, line.variant_title].filter(Boolean).join(" · ")}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {line.sku ? `${line.sku} · ` : ""}
                {line.quantity} × {money(line.catalog_unit_price, thread.currency_code, lang)}
                {floor !== undefined &&
                  ` · ${t("negotiations.thread.floor")}: ${money(floor, thread.currency_code, lang)}`}
              </Text>
            </div>
            {offer && (
              <Text size="small" className="shrink-0">
                {money(offer.unit_price, thread.currency_code, lang)}
              </Text>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* Conversation -------------------------------------------------------------- */

const Conversation = ({ detail }: { detail: ThreadDetail }) => {
  const { t } = useTranslation()
  const users = useUsers()
  const userName = (id: string | null) => {
    const u = users.data?.users.find((u) => u.id === id)
    return u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email : null
  }
  return (
    <Container className="overflow-hidden flex flex-col gap-y-3 p-6">
      <Heading level="h2">{t("negotiations.thread.conversation")}</Heading>
      {detail.messages.map((m) => (
        <Bubble
          key={m.id}
          message={m}
          thread={detail.negotiation}
          name={m.author === "customer" ? customerName(detail.negotiation.customer) : userName(m.author_id)}
        />
      ))}
    </Container>
  )
}

const Bubble = ({ message, thread, name }: { message: Message; thread: Thread; name: string | null }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const when = dateTime(message.created_at, lang)
  if (message.author === "system") {
    return (
      <div className="flex justify-center">
        <Text size="xsmall" className="rounded-full bg-ui-bg-subtle px-3 py-1 text-ui-fg-subtle">
          {t(`negotiations.messageType.${message.type}`)} · {when}
        </Text>
      </div>
    )
  }
  if (message.internal) {
    return (
      <div className="rounded-lg border border-dashed border-ui-tag-orange-border bg-ui-tag-orange-bg px-4 py-3">
        <Text size="xsmall" weight="plus" className="text-ui-tag-orange-text">
          {t("negotiations.messageType.internal_note")} · {name ?? t("negotiations.author.team")} · {when}
        </Text>
        <Text size="small" className="whitespace-pre-wrap text-ui-tag-orange-text">
          {message.body}
        </Text>
      </div>
    )
  }
  const mine = message.author === "team"
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 ${mine ? "bg-ui-tag-blue-bg text-ui-tag-blue-text" : "bg-ui-bg-subtle"}`}
      >
        <Text size="xsmall" className={mine ? "text-ui-tag-blue-text" : "text-ui-fg-subtle"}>
          {name ?? t(`negotiations.author.${message.author}`)} · {when}
        </Text>
        {message.type !== "message" && (
          <Text size="xsmall" weight="plus" className="mt-1 uppercase tracking-wide">
            {t(`negotiations.messageType.${message.type}`)}
          </Text>
        )}
        {message.price && <PriceBlock offer={message.price} thread={thread} />}
        {message.body && (
          <Text size="small" className="mt-1 whitespace-pre-wrap">
            {message.body}
          </Text>
        )}
      </div>
    </div>
  )
}

const PriceBlock = ({ offer, thread }: { offer: Offer; thread: Thread }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const c = thread.currency_code
  const basisMoney = useBasisMoney()
  return (
    <div className="mt-1">
      <Text size="base" weight="plus">
        {offer.mode === "unit"
          ? t("negotiations.price.perUnit", {
              price: money(offer.lines[0]?.unit_price, c, lang),
              total: basisMoney(offer.total, c, thread.tax_inclusive),
            })
          : basisMoney(offer.total, c, thread.tax_inclusive)}
      </Text>
      {offer.mode === "total" && offer.requested_total != null && offer.requested_total !== offer.total && (
        <Text size="xsmall">
          {t("negotiations.price.rounded", { requested: money(offer.requested_total, c, lang) })}
        </Text>
      )}
      {offer.mode !== "unit" && (
        <div className="mt-1 flex flex-col">
          {offer.lines.map((l) => {
            const line = thread.lines.find((x) => x.variant_id === l.variant_id)
            return (
              <Text key={l.variant_id} size="xsmall">
                {line?.product_title ?? l.variant_id}: {l.quantity} × {money(l.unit_price, c, lang)}
              </Text>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* Your move ----------------------------------------------------------------- */

type Mode = "reply" | "counter" | "note" | "reject"

const YourMove = ({ detail }: { detail: ThreadDetail }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const thread = detail.negotiation
  const [mode, setMode] = useState<Mode>("reply")
  const [text, setText] = useState("")
  const errorText = useErrorText()
  const basisMoney = useBasisMoney()
  const reply = useThreadAction<{ type: "message" | "internal_note"; message: string; version?: number }>(
    thread.id,
    "messages"
  )
  const reject = useThreadAction<{ version: number; reason: string }>(thread.id, "reject")
  const accept = useThreadAction<{
    version: number
    basis: "target" | "offer"
    price: number
    confirm_below_floor?: boolean
  }>(thread.id, "accept")
  const [confirm, setConfirm] = useState<null | { basis: "target" | "offer"; price: number; warnings: string[] }>(null)

  const onError = (e: unknown) => {
    const body = apiError(e)
    toast.error(errorText(e), body.negotiation ? { description: t("negotiations.thread.reloaded") } : undefined)
  }
  const done = () => setText("")

  const send = () => {
    if (mode === "reply")
      reply.mutate({ type: "message", message: text, version: thread.version }, { onSuccess: done, onError })
    if (mode === "note") reply.mutate({ type: "internal_note", message: text }, { onSuccess: done, onError })
    if (mode === "reject") reject.mutate({ version: thread.version, reason: text }, { onSuccess: done, onError })
  }

  const startAccept = (basis: "target" | "offer") => {
    const price = basis === "target" ? thread.target_total : thread.offer_total!
    const warnings = floorWarning(
      basis === "target" ? detail.floor_checks.target : detail.floor_checks.offer,
      thread.currency_code,
      lang,
      t
    )
    if (warnings) return setConfirm({ basis, price, warnings })
    accept.mutate({ version: thread.version, basis, price }, { onError })
  }

  const modes: Mode[] = ["reply", "counter", "note", "reject"]
  return (
    <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-x-2">
          <Heading level="h2">{t("negotiations.move.title")}</Heading>
          {thread.turn === "team" ? (
            <Badge size="2xsmall" color="blue">
              {t("negotiations.list.yourMove")}
            </Badge>
          ) : (
            <Badge size="2xsmall" color="grey">
              {t("negotiations.move.waitingForCustomer")}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="small" onClick={() => startAccept("target")} isLoading={accept.isPending}>
            <Check />
            {t("negotiations.move.acceptTarget", {
              price: basisMoney(thread.target_total, thread.currency_code, thread.tax_inclusive),
            })}
          </Button>
          {thread.status === "countered" && thread.offer_total !== null && (
            <Button size="small" variant="secondary" onClick={() => startAccept("offer")} isLoading={accept.isPending}>
              <Check />
              {t("negotiations.move.acceptOffer", {
                price: basisMoney(thread.offer_total, thread.currency_code, thread.tax_inclusive),
              })}
            </Button>
          )}
        </div>
      </div>
      {!detail.customer_accept && thread.status === "countered" && (
        <Note>{t("negotiations.move.customerAcceptOff")}</Note>
      )}

      <div className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <Button key={m} size="small" variant={mode === m ? "primary" : "secondary"} onClick={() => setMode(m)}>
            {m === "reject" && <XMark />}
            {t(`negotiations.move.${m}`)}
          </Button>
        ))}
      </div>

      {mode === "counter" ? (
        <CounterForm detail={detail} onSent={() => setMode("reply")} />
      ) : (
        <div className="flex flex-col gap-y-2">
          {mode === "note" && <Note>{t("negotiations.move.noteHint")}</Note>}
          {mode === "reject" && <Note tone="warn">{t("negotiations.move.rejectHint")}</Note>}
          <Textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(`negotiations.move.${mode}Placeholder`)}
          />
          <div className="flex justify-end">
            <Button
              size="small"
              variant={mode === "reject" ? "danger" : "primary"}
              disabled={!text.trim()}
              isLoading={reply.isPending || reject.isPending}
              onClick={send}
            >
              {t(`negotiations.move.${mode}Send`)}
            </Button>
          </div>
        </div>
      )}

      <Prompt open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>{t("negotiations.floor.title")}</Prompt.Title>
            <Prompt.Description>
              {confirm?.warnings.map((w) => (
                <span key={w} className="block">
                  {w}
                </span>
              ))}
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>{t("negotiations.cancel")}</Prompt.Cancel>
            <Prompt.Action
              onClick={() => {
                if (!confirm) return
                accept.mutate(
                  { version: thread.version, basis: confirm.basis, price: confirm.price, confirm_below_floor: true },
                  { onError }
                )
                setConfirm(null)
              }}
            >
              {t("negotiations.floor.confirmAccept")}
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </Container>
  )
}
