import { Button, Container, Heading, Select, Text, toast } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { type DraftPlan, draftOrderStep, keys, type ThreadDetail } from "../../lib/negotiations/api"
import { dateTime, money } from "../../lib/negotiations/format"
import { Note, useErrorText } from "./shared"

type Choices = { region_id?: string; sales_channel_id?: string; address_id?: string | null }

const addressLine = (a: Record<string, any>) =>
  [
    a.company,
    [a.first_name, a.last_name].filter(Boolean).join(" "),
    a.address_1,
    a.postal_code,
    a.city,
    String(a.country_code ?? "").toUpperCase(),
  ]
    .filter(Boolean)
    .join(", ")

/**
 * A draft order from the accepted price, in three steps: the plan (what will
 * be created, with region, address and sales channel to change), a dry run
 * (everything checked, nothing written) and the write after a click.
 * Exactly once per thread.
 */
export const DraftOrderPanel = ({ detail }: { detail: ThreadDetail }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const thread = detail.negotiation
  const client = useQueryClient()
  const errorText = useErrorText()
  const [choices, setChoices] = useState<Choices>({})
  const [plan, setPlan] = useState<DraftPlan | null>(null)
  const [dryRun, setDryRun] = useState<{ id: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState<"plan" | "dry" | "commit" | null>(null)
  const writer = detail.writers.draft_orders

  const refresh = () => client.invalidateQueries({ queryKey: keys.thread(thread.id) })
  const run = async <T,>(step: "plan" | "dry-run" | "commit", body: unknown, tag: typeof busy): Promise<T | null> => {
    setBusy(tag)
    try {
      return await draftOrderStep<T>(thread.id, step, body)
    } catch (e) {
      toast.error(errorText(e))
      return null
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const makePlan = async (next: Choices) => {
    setChoices(next)
    setDryRun(null)
    const result = await run<{ plan: DraftPlan }>("plan", next, "plan")
    if (result) setPlan(result.plan)
  }

  const doDryRun = async () => {
    const result = await run<{ plan: DraftPlan; ok: boolean; run_id: string }>("dry-run", choices, "dry")
    if (result) {
      setPlan(result.plan)
      setDryRun({ id: result.run_id, ok: result.ok })
    }
  }

  const commit = async () => {
    if (!dryRun?.ok) return
    const result = await run<{ order_id: string }>("commit", { dry_run_id: dryRun.id }, "commit")
    if (result) {
      toast.success(t("negotiations.draft.created"))
      setPlan(null)
      setDryRun(null)
    }
  }

  const runs = detail.runs.filter((r) => r.writer === "draft_order" || r.writer === "cart")

  return (
    <Container className="flex flex-col gap-y-3 p-6">
      <div>
        <Heading level="h2">{t("negotiations.draft.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("negotiations.draft.hint")}
        </Text>
      </div>

      {thread.order_id ? (
        <Note>
          {thread.draft_order_id ? t("negotiations.draft.exists") : t("negotiations.draft.ordered")}{" "}
          {!thread.is_demo && (
            <Link
              className="text-ui-fg-interactive hover:underline"
              to={thread.draft_order_id ? `/draft-orders/${thread.order_id}` : `/orders/${thread.order_id}`}
            >
              {t("negotiations.draft.open")}
            </Link>
          )}
        </Note>
      ) : thread.is_demo ? (
        <Note>{t("negotiations.errors.demo_thread")}</Note>
      ) : !writer.on ? (
        <Note>{t("negotiations.draft.off")}</Note>
      ) : !writer.armed ? (
        <Note tone="warn">{t("negotiations.draft.notArmed")}</Note>
      ) : !plan ? (
        <Button size="small" variant="secondary" isLoading={busy === "plan"} onClick={() => makePlan({})}>
          {t("negotiations.draft.plan")}
        </Button>
      ) : (
        <div className="flex flex-col gap-y-3">
          <Picker
            label={t("negotiations.draft.region")}
            value={plan.region?.id ?? ""}
            options={plan.regions.map((r) => ({ value: r.id, label: r.name }))}
            onChange={(v) => makePlan({ ...choices, region_id: v })}
            hint={plan.region_reason ? t(`negotiations.draft.regionReason.${plan.region_reason}`) : undefined}
          />
          <Picker
            label={t("negotiations.draft.address")}
            value={plan.address?.id ?? "none"}
            options={[
              { value: "none", label: t("negotiations.draft.noAddress") },
              ...plan.addresses.map((a) => ({ value: a.id as string, label: addressLine(a) })),
            ]}
            onChange={(v) => makePlan({ ...choices, address_id: v === "none" ? null : v })}
          />
          <Picker
            label={t("negotiations.draft.channel")}
            value={plan.sales_channel?.id ?? ""}
            options={plan.sales_channels.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(v) => makePlan({ ...choices, sales_channel_id: v })}
          />
          <div className="flex flex-col gap-y-1 rounded-lg bg-ui-bg-subtle px-3 py-2">
            <Text size="xsmall" className="text-ui-fg-subtle">
              {plan.customer.name} · {plan.customer.email ?? "—"}
            </Text>
            {plan.items.map((i) => (
              <Text key={i.variant_id} size="xsmall">
                {i.title}: {i.quantity} × {money(i.unit_price, plan.currency_code, lang)}
              </Text>
            ))}
            <Text size="small" weight="plus">
              {t("negotiations.draft.total", { total: money(plan.total, plan.currency_code, lang) })}
            </Text>
          </div>
          {plan.problems.length > 0 && (
            <Note tone="error">
              {plan.problems.map((p) => (
                <span key={p} className="block">
                  {t(`negotiations.errors.${p}`, { currency: plan.currency_code.toUpperCase(), defaultValue: p })}
                </span>
              ))}
            </Note>
          )}
          {dryRun?.ok && <Note>{t("negotiations.draft.dryRunOk")}</Note>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="small"
              variant="secondary"
              isLoading={busy === "dry"}
              disabled={plan.problems.length > 0}
              onClick={doDryRun}
            >
              {t("negotiations.draft.dryRun")}
            </Button>
            <Button size="small" isLoading={busy === "commit"} disabled={!dryRun?.ok} onClick={commit}>
              {t("negotiations.draft.commit")}
            </Button>
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div className="flex flex-col gap-y-1 border-t border-ui-border-base pt-3">
          <Text size="small" weight="plus">
            {t("negotiations.runs.title")}
          </Text>
          {runs.slice(0, 8).map((r) => (
            <Text key={r.id} size="xsmall" className={r.stage === "error" ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
              {dateTime(r.created_at, lang)} · {t(`negotiations.runs.writer.${r.writer}`)} ·{" "}
              {t(`negotiations.runs.stage.${r.stage}`)}
              {r.error ? ` · ${r.error}` : ""}
            </Text>
          ))}
        </div>
      )}
    </Container>
  )
}

const Picker = ({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  hint?: string
}) => (
  <div className="flex flex-col gap-y-1">
    <Text size="xsmall" weight="plus">
      {label}
    </Text>
    <Select size="small" value={value} onValueChange={onChange}>
      <Select.Trigger>
        <Select.Value placeholder="—" />
      </Select.Trigger>
      <Select.Content>
        {options.map((o) => (
          <Select.Item key={o.value} value={o.value}>
            {o.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
    {hint && (
      <Text size="xsmall" className="text-ui-fg-subtle">
        {hint}
      </Text>
    )}
  </div>
)
