import {
  Bolt,
  Gift,
  Key,
  Plus,
  ReceiptPercent,
  Tag,
  Trash,
  TruckFast,
  User,
  Users,
  CurrencyDollar,
  ChartBar,
} from "@medusajs/icons"
import {
  Button,
  FocusModal,
  Heading,
  IconButton,
  Input,
  Label,
  ProgressTabs,
  Select,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type CouponDraft,
  type CouponKind,
  type CouponView,
  suggestCode,
  useCreateBatch,
  usePreview,
  useSaveCoupon,
} from "../../lib/coupons/api"
import {
  adminLocale,
  emptyDraft,
  endOfMonth,
  example,
  money,
  plusDays,
  shortDate,
  stepOfError,
} from "../../lib/coupons/draft"
import { errorMessage } from "../../lib/coupons/kit/format"
import { ChoiceCard, MultiPicker, NumberField, QuickChoices, Section } from "./shared"

type UiKind = CouponKind | "tiers"
type Step = "kind" | "who" | "rules"
const STEPS: Step[] = ["kind", "who", "rules"]
const STEP_NUMBER: Record<Step, 1 | 2 | 3> = { kind: 1, who: 2, rules: 3 }

const KIND_ICONS: Record<UiKind, ReactNode> = {
  percentage: <ReceiptPercent />,
  fixed: <CurrencyDollar />,
  free_shipping: <TruckFast />,
  category: <Tag />,
  buy_get: <Gift />,
  tiers: <ChartBar />,
}

/** `yyyy-mm-dd` in local time, for date inputs. */
const toDateInput = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const fromDateInput = (value: string, endOfDay: boolean) => {
  if (!value) return null
  const [y, m, d] = value.split("-").map(Number)
  return (endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d, 0, 0, 0)).toISOString()
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export type WizardProps = {
  open: boolean
  onClose: () => void
  /** Edit this coupon; omitted for a new one. */
  coupon?: CouponView | null
  /** "batch" creates unique single-use codes instead of one code. */
  mode?: "coupon" | "batch"
  currencyCode: string
}

/** The three-step coupon wizard with the live preview on the right. */
export const CouponWizard = ({ open, onClose, coupon, mode = "coupon", currencyCode }: WizardProps) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const locale = adminLocale(lang)
  const editing = !!coupon
  const batch = mode === "batch" || coupon?.batch_size != null

  const [draft, setDraft] = useState<CouponDraft>(() => coupon?.draft ?? emptyDraft(currencyCode))
  const [name, setName] = useState<string>(coupon?.name ?? "")
  const [step, setStep] = useState<Step>("kind")
  const [prefix, setPrefix] = useState("")
  const [quantity, setQuantity] = useState<number | null>(500)
  const [validity, setValidity] = useState<"month_end" | "days_30" | "none" | "custom">(
    coupon?.draft.starts_at || coupon?.draft.ends_at ? "custom" : "none"
  )
  const [minMode, setMinMode] = useState<"none" | "amount">(coupon?.draft.min_subtotal ? "amount" : "none")

  useEffect(() => {
    if (!open) return
    setDraft(coupon?.draft ?? emptyDraft(currencyCode))
    setName(coupon?.name ?? "")
    setStep("kind")
    setValidity(coupon?.draft.starts_at || coupon?.draft.ends_at ? "custom" : "none")
    setMinMode(coupon?.draft.min_subtotal ? "amount" : "none")
  }, [open, coupon, currencyCode])

  const set = (patch: Partial<CouponDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const uiKind: UiKind = draft.tiers ? "tiers" : draft.kind

  // What the server checks: a batch is previewed with a sample code.
  const sample = `${prefix.toUpperCase()}XXXXXXXX`
  const checked = useMemo<CouponDraft>(
    () =>
      batch
        ? { ...draft, code: sample, automatic: false, tiers: null, usage_limit: 1, per_customer_limit: null }
        : draft,
    [batch, draft, sample]
  )
  const preview = usePreview(useDebounced(checked, 300), coupon?.id)
  const errors = (preview.data?.errors ?? []).filter((e) => !(batch && e === "code_taken"))
  const warnings = preview.data?.warnings ?? []
  const stepErrors = (s: Step) => errors.filter((e) => stepOfError(e) === STEP_NUMBER[s])

  const save = useSaveCoupon(coupon?.id)
  const createBatch = useCreateBatch()
  const saving = save.isPending || createBatch.isPending

  const chooseKind = (kind: UiKind) => {
    if (kind === "tiers") {
      set({
        kind: draft.kind === "fixed" ? "fixed" : "percentage",
        tiers: draft.tiers ?? [
          { min: 200, value: 5 },
          { min: 500, value: 10 },
        ],
        value: null,
      })
    } else {
      set({
        kind,
        tiers: null,
        value: kind === "fixed" ? 50 : kind === "free_shipping" ? null : kind === "buy_get" ? 100 : (draft.value ?? 15),
      })
    }
  }

  const applyValidity = (preset: typeof validity) => {
    setValidity(preset)
    if (preset === "month_end") set({ starts_at: null, ends_at: endOfMonth() })
    if (preset === "days_30") set({ starts_at: null, ends_at: plusDays(30) })
    if (preset === "none") set({ starts_at: null, ends_at: null })
  }

  const onSuggest = async () => {
    try {
      const { code } = await suggestCode(draft.kind, draft.tiers?.[0]?.value ?? draft.value)
      set({ code })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const onSave = () => {
    const payload: CouponDraft = {
      ...draft,
      code: draft.automatic ? null : (draft.code ?? "").trim().toUpperCase() || null,
    }
    const done = (message: string) => {
      toast.success(message)
      onClose()
    }
    const failed = (error: unknown) => toast.error(t("coupons.wizard.saveFailed", { error: errorMessage(error) }))
    if (batch && !editing) {
      createBatch.mutate(
        { draft: payload, prefix, quantity: quantity ?? 0, name: name || null },
        { onSuccess: (r) => done(t("coupons.wizard.batchCreated", { count: r.quantity })), onError: failed }
      )
    } else {
      save.mutate(
        { draft: payload, name: name || null },
        { onSuccess: () => done(t("coupons.wizard.saved")), onError: failed }
      )
    }
  }

  const stepStatus = (s: Step) =>
    stepErrors(s).length ? "in-progress" : STEPS.indexOf(s) <= STEPS.indexOf(step) ? "completed" : "not-started"

  const title = batch
    ? t("coupons.wizard.batchTitle")
    : editing
      ? t("coupons.wizard.editTitle", { code: coupon?.code })
      : t("coupons.wizard.newTitle")

  return (
    <FocusModal open={open} onOpenChange={(value) => !value && onClose()}>
      <FocusModal.Content>
        <ProgressTabs value={step} onValueChange={(value) => setStep(value as Step)} className="flex h-full flex-col">
          <FocusModal.Header>
            <div className="flex w-full items-center justify-between gap-x-4">
              <ProgressTabs.List className="flex-1">
                {STEPS.map((s) => (
                  <ProgressTabs.Trigger key={s} value={s} status={stepStatus(s)}>
                    {t(`coupons.wizard.steps.${s}`)}
                  </ProgressTabs.Trigger>
                ))}
              </ProgressTabs.List>
              <div className="flex items-center gap-x-2">
                <Button size="small" variant="secondary" onClick={onClose}>
                  {t("coupons.cancel")}
                </Button>
                {step !== "rules" ? (
                  <Button size="small" onClick={() => setStep(STEPS[STEPS.indexOf(step) + 1])}>
                    {t("coupons.wizard.next")}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    onClick={onSave}
                    isLoading={saving}
                    disabled={errors.length > 0 || preview.isFetching}
                  >
                    {batch && !editing ? t("coupons.wizard.createBatch") : t("coupons.wizard.save")}
                  </Button>
                )}
              </div>
            </div>
          </FocusModal.Header>

          <FocusModal.Body className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto flex max-w-[860px] flex-col gap-y-6 px-6 py-8">
                <div>
                  <Heading>{title}</Heading>
                  {editing && (
                    <Text size="small" className="text-ui-fg-subtle">
                      {t("coupons.wizard.editHint")}
                    </Text>
                  )}
                </div>

                <ProgressTabs.Content value="kind" className="flex flex-col gap-y-4">
                  <Heading level="h2">{t("coupons.wizard.steps.kind")}</Heading>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {(["percentage", "fixed", "free_shipping", "category", "buy_get", "tiers"] as UiKind[])
                      .filter((kind) => !(batch && kind === "tiers"))
                      .map((kind) => (
                        <ChoiceCard
                          key={kind}
                          selected={uiKind === kind}
                          disabled={editing && uiKind !== kind}
                          icon={KIND_ICONS[kind]}
                          title={t(`coupons.kinds.${kind}.title`)}
                          hint={t(`coupons.kinds.${kind}.hint`)}
                          onClick={() => chooseKind(kind)}
                        />
                      ))}
                  </div>
                  <KindSettings draft={draft} set={set} editing={editing} currencyCode={currencyCode} />
                </ProgressTabs.Content>

                <ProgressTabs.Content value="who" className="flex flex-col gap-y-4">
                  <Heading level="h2">{t("coupons.wizard.steps.who")}</Heading>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {(
                      [
                        ["all", <Users key="a" />],
                        ["groups", <Tag key="g" />],
                        ["customers", <User key="c" />],
                      ] as const
                    ).map(([audience, icon]) => (
                      <ChoiceCard
                        key={audience}
                        selected={draft.audience === audience}
                        icon={icon}
                        title={t(`coupons.audience.${audience}.title`)}
                        hint={t(`coupons.audience.${audience}.hint`)}
                        onClick={() => set({ audience, audience_ids: [] })}
                      />
                    ))}
                  </div>
                  {draft.audience !== "all" && (
                    <Section title={t(`coupons.audience.${draft.audience}.pick`)}>
                      <MultiPicker
                        kind={draft.audience === "groups" ? "groups" : "customers"}
                        label={t(`coupons.audience.${draft.audience}.title`)}
                        value={draft.audience_ids}
                        onChange={(audience_ids) => set({ audience_ids })}
                      />
                    </Section>
                  )}
                  <Section title={t("coupons.wizard.firstOrder")} hint={t("coupons.wizard.firstOrderHint")}>
                    <div className="flex items-center gap-x-2">
                      <Switch
                        id="first-order"
                        checked={draft.first_order_only}
                        onCheckedChange={(first_order_only) => set({ first_order_only })}
                      />
                      <Label htmlFor="first-order" size="small">
                        {t("coupons.wizard.firstOrderLabel")}
                      </Label>
                    </div>
                  </Section>
                </ProgressTabs.Content>

                <ProgressTabs.Content value="rules" className="flex flex-col gap-y-4">
                  <Heading level="h2">{t("coupons.wizard.steps.rules")}</Heading>

                  {batch ? (
                    <Section
                      title={t("coupons.batch.title")}
                      hint={
                        editing
                          ? t("coupons.batch.editing", { count: coupon?.batch_size ?? 0 })
                          : t("coupons.batch.hint")
                      }
                    >
                      {!editing && (
                        <div className="flex flex-wrap items-end gap-4">
                          <div className="flex flex-col gap-y-1">
                            <Label size="xsmall" weight="plus">
                              {t("coupons.batch.prefix")}
                            </Label>
                            <Input
                              size="small"
                              className="w-40 font-mono uppercase"
                              maxLength={12}
                              placeholder="NL-"
                              value={prefix}
                              onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                            />
                          </div>
                          {
                            <div className="flex flex-col gap-y-1">
                              <Label size="xsmall" weight="plus">
                                {t("coupons.batch.quantity")}
                              </Label>
                              <div className="flex flex-wrap items-center gap-2">
                                <QuickChoices
                                  options={[100, 500, 1000].map((n) => ({ value: n, label: String(n) }))}
                                  value={quantity}
                                  onChange={setQuantity}
                                />
                                <NumberField
                                  ariaLabel={t("coupons.batch.quantity")}
                                  value={quantity}
                                  onChange={setQuantity}
                                  min={1}
                                />
                              </div>
                            </div>
                          }
                        </div>
                      )}
                      {!editing && (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {t("coupons.batch.example", { code: `${prefix}7KQ2M9XA` })}
                        </Text>
                      )}
                    </Section>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <ChoiceCard
                          selected={!draft.automatic}
                          disabled={editing && draft.automatic}
                          icon={<Key />}
                          title={t("coupons.wizard.withCode")}
                          hint={t("coupons.wizard.withCodeHint")}
                          onClick={() => set({ automatic: false })}
                        />
                        <ChoiceCard
                          selected={draft.automatic}
                          disabled={editing && !draft.automatic}
                          icon={<Bolt />}
                          title={t("coupons.wizard.automatic")}
                          hint={t("coupons.wizard.automaticHint")}
                          onClick={() => set({ automatic: true, code: null })}
                        />
                      </div>
                      {!draft.automatic && (
                        <Section
                          title={t("coupons.wizard.code")}
                          hint={editing ? t("coupons.wizard.codeLocked") : undefined}
                        >
                          <div className="flex items-center gap-x-2">
                            <Input
                              size="small"
                              className="w-64 font-mono uppercase"
                              aria-label={t("coupons.wizard.code")}
                              placeholder="JESIEN15"
                              disabled={editing}
                              value={draft.code ?? ""}
                              onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })}
                            />
                            {!editing && (
                              <Button size="small" variant="secondary" onClick={onSuggest}>
                                {t("coupons.wizard.suggest")}
                              </Button>
                            )}
                          </div>
                        </Section>
                      )}
                    </>
                  )}

                  <Section title={t("coupons.wizard.validity")} hint={t("coupons.wizard.validityHint")}>
                    <QuickChoices
                      options={(["month_end", "days_30", "none", "custom"] as const).map((v) => ({
                        value: v,
                        label: t(`coupons.wizard.validityPresets.${v}`),
                      }))}
                      value={validity}
                      onChange={applyValidity}
                    />
                    {validity === "custom" && (
                      <div className="flex flex-wrap gap-4">
                        {(["starts_at", "ends_at"] as const).map((field) => (
                          <div key={field} className="flex flex-col gap-y-1">
                            <Label size="xsmall" weight="plus">
                              {t(`coupons.wizard.${field}`)}
                            </Label>
                            <Input
                              size="small"
                              type="date"
                              value={toDateInput(draft[field])}
                              onChange={(e) => set({ [field]: fromDateInput(e.target.value, field === "ends_at") })}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {!batch && (
                      <Section title={t("coupons.wizard.usageLimit")} hint={t("coupons.wizard.usageLimitHint")}>
                        <LimitChoice
                          value={draft.usage_limit}
                          onChange={(usage_limit) => set({ usage_limit })}
                          presets={[1, 100]}
                          unlimitedLabel={t("coupons.wizard.unlimited")}
                          customLabel={t("coupons.wizard.customNumber")}
                          presetLabel={(n) => t("coupons.wizard.times", { count: n })}
                        />
                      </Section>
                    )}
                    <Section title={t("coupons.wizard.minBasket")} hint={t("coupons.wizard.minBasketHint")}>
                      <QuickChoices
                        options={[
                          { value: "none" as const, label: t("coupons.wizard.noMinimum") },
                          { value: "amount" as const, label: t("coupons.wizard.fromAmount") },
                        ]}
                        value={minMode}
                        onChange={(mode) => {
                          setMinMode(mode)
                          set({ min_subtotal: mode === "none" ? null : (draft.min_subtotal ?? 300) })
                        }}
                      />
                      {minMode === "amount" && (
                        <NumberField
                          ariaLabel={t("coupons.wizard.minBasket")}
                          value={draft.min_subtotal}
                          onChange={(min_subtotal) => set({ min_subtotal })}
                          min={0}
                          step={0.01}
                          suffix={(draft.currency_code ?? currencyCode).toUpperCase()}
                        />
                      )}
                    </Section>
                    {!batch && (
                      <Section title={t("coupons.wizard.perCustomer")} hint={t("coupons.wizard.perCustomerHint")}>
                        <LimitChoice
                          value={draft.per_customer_limit}
                          onChange={(per_customer_limit) => set({ per_customer_limit })}
                          presets={[1]}
                          unlimitedLabel={t("coupons.wizard.unlimited")}
                          customLabel={t("coupons.wizard.customNumber")}
                          presetLabel={(n) => t("coupons.wizard.times", { count: n })}
                        />
                      </Section>
                    )}
                    <Section title={t("coupons.wizard.combining")} hint={t("coupons.wizard.combiningHint")}>
                      <div className="flex items-center gap-x-2">
                        <Switch
                          id="exclusive"
                          checked={draft.exclusive}
                          onCheckedChange={(exclusive) => set({ exclusive })}
                        />
                        <Label htmlFor="exclusive" size="small">
                          {t("coupons.wizard.exclusiveLabel")}
                        </Label>
                      </div>
                    </Section>
                  </div>

                  {draft.kind !== "free_shipping" && (
                    <Section title={t("coupons.wizard.exclusions")} hint={t("coupons.wizard.exclusionsHint")}>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {(
                          [
                            ["products", "product_ids"],
                            ["collections", "collection_ids"],
                            ["categories", "category_ids"],
                          ] as const
                        ).map(([kind, field]) => (
                          <MultiPicker
                            key={kind}
                            kind={kind}
                            label={t(`coupons.wizard.exclude.${kind}`)}
                            value={draft.exclusions[field]}
                            onChange={(ids) => set({ exclusions: { ...draft.exclusions, [field]: ids } })}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-x-2">
                        <Switch
                          id="skip-discounted"
                          checked={draft.exclusions.skip_discounted}
                          onCheckedChange={(skip_discounted) =>
                            set({ exclusions: { ...draft.exclusions, skip_discounted } })
                          }
                        />
                        <Label htmlFor="skip-discounted" size="small">
                          {t("coupons.wizard.skipDiscounted")}
                        </Label>
                      </div>
                    </Section>
                  )}

                  <Section title={t("coupons.wizard.name")} hint={t("coupons.wizard.nameHint")}>
                    <Input
                      size="small"
                      className="max-w-md"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={120}
                    />
                  </Section>
                </ProgressTabs.Content>
              </div>
            </div>

            <PreviewPanel
              draft={batch ? { ...checked, code: `${prefix}…` } : draft}
              sentence={preview.data?.sentence[locale]}
              errors={errors}
              warnings={warnings}
              stepErrors={stepErrors}
              lang={lang}
              currencyCode={currencyCode}
            />
          </FocusModal.Body>
        </ProgressTabs>
      </FocusModal.Content>
    </FocusModal>
  )
}

/** "1 raz / 100 razy / bez ograniczeń / własna liczba". */
const LimitChoice = ({
  value,
  onChange,
  presets,
  unlimitedLabel,
  customLabel,
  presetLabel,
}: {
  value: number | null
  onChange: (value: number | null) => void
  presets: number[]
  unlimitedLabel: string
  customLabel: string
  presetLabel: (n: number) => string
}) => {
  const [custom, setCustom] = useState(value != null && !presets.includes(value))
  const chosen = custom ? "custom" : value == null ? "none" : String(value)
  return (
    <div className="flex flex-col gap-y-2">
      <QuickChoices
        options={[
          ...presets.map((n) => ({ value: String(n), label: presetLabel(n) })),
          { value: "none", label: unlimitedLabel },
          { value: "custom", label: customLabel },
        ]}
        value={chosen}
        onChange={(choice) => {
          setCustom(choice === "custom")
          if (choice === "none") onChange(null)
          else if (choice !== "custom") onChange(Number(choice))
          else onChange(value ?? 10)
        }}
      />
      {custom && <NumberField ariaLabel={customLabel} value={value} onChange={onChange} min={1} step={1} />}
    </div>
  )
}

/** Step 1 settings for the chosen kind: value, categories, products, tiers. */
const KindSettings = ({
  draft,
  set,
  editing,
  currencyCode,
}: {
  draft: CouponDraft
  set: (patch: Partial<CouponDraft>) => void
  editing: boolean
  currencyCode: string
}) => {
  const { t, i18n } = useTranslation()
  const currency = (draft.currency_code ?? currencyCode).toUpperCase()
  const sample = example(draft)
  const exampleLine = sample ? (
    <Text size="xsmall" className="text-ui-fg-subtle">
      {t("coupons.wizard.example", {
        basket: money(sample.basket, currency, i18n.language),
        after: money(sample.after, currency, i18n.language),
      })}
    </Text>
  ) : null

  if (draft.tiers) {
    const tiers = draft.tiers
    const update = (index: number, patch: Partial<{ min: number; value: number }>) =>
      set({ tiers: tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)) })
    return (
      <Section title={t("coupons.wizard.tiers")} hint={t("coupons.wizard.tiersHint")}>
        <div className="flex items-center gap-x-3">
          <Label size="xsmall" weight="plus">
            {t("coupons.wizard.tierUnit")}
          </Label>
          <Select
            size="small"
            value={draft.kind}
            onValueChange={(kind) => set({ kind: kind as "percentage" | "fixed" })}
            disabled={editing}
          >
            <Select.Trigger className="w-44">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="percentage">%</Select.Item>
              <Select.Item value="fixed">{currency}</Select.Item>
            </Select.Content>
          </Select>
        </div>
        {tiers.map((tier, index) => (
          <div key={index} className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Text size="small" className="w-16 text-ui-fg-subtle">
              {t("coupons.wizard.tierN", { n: index + 1 })}
            </Text>
            <NumberField
              ariaLabel={t("coupons.wizard.tierMin")}
              value={tier.min}
              onChange={(min) => update(index, { min: min ?? 0 })}
              min={0}
              step={0.01}
              suffix={`${currency} →`}
            />
            <NumberField
              ariaLabel={t("coupons.wizard.tierValue")}
              value={tier.value}
              onChange={(value) => update(index, { value: value ?? 0 })}
              min={0}
              step={draft.kind === "percentage" ? 1 : 0.01}
              suffix={draft.kind === "percentage" ? "%" : currency}
            />
            {!editing && tiers.length > 2 && (
              <IconButton
                size="small"
                variant="transparent"
                aria-label={t("coupons.wizard.remove")}
                onClick={() => set({ tiers: tiers.filter((_, i) => i !== index) })}
              >
                <Trash />
              </IconButton>
            )}
          </div>
        ))}
        {!editing && tiers.length < 10 && (
          <Button
            size="small"
            variant="secondary"
            className="self-start"
            onClick={() => {
              const last = tiers[tiers.length - 1]
              set({ tiers: [...tiers, { min: (last?.min ?? 0) + 300, value: (last?.value ?? 0) + 5 }] })
            }}
          >
            <Plus />
            {t("coupons.wizard.addTier")}
          </Button>
        )}
        {exampleLine}
      </Section>
    )
  }

  switch (draft.kind) {
    case "percentage":
    case "category":
      return (
        <div className="flex flex-col gap-y-4">
          {draft.kind === "category" && (
            <Section title={t("coupons.wizard.categories")}>
              <MultiPicker
                kind="categories"
                label={t("coupons.wizard.categories")}
                value={draft.category_ids}
                onChange={(category_ids) => set({ category_ids })}
              />
            </Section>
          )}
          <Section
            title={t("coupons.wizard.percent")}
            hint={draft.kind === "percentage" ? undefined : t("coupons.wizard.percentCategoryHint")}
          >
            <div className="flex flex-wrap items-center gap-3">
              <QuickChoices
                options={[5, 10, 15, 20, 30].map((v) => ({ value: v, label: `${v}%` }))}
                value={draft.value}
                onChange={(value) => set({ value })}
              />
              <NumberField
                ariaLabel={t("coupons.wizard.customValue")}
                value={draft.value}
                onChange={(value) => set({ value })}
                min={0}
                step={0.5}
                suffix="%"
              />
            </div>
            {exampleLine}
          </Section>
        </div>
      )
    case "fixed":
      return (
        <Section title={t("coupons.wizard.amount")} hint={t("coupons.wizard.amountHint")}>
          <NumberField
            ariaLabel={t("coupons.wizard.amount")}
            value={draft.value}
            onChange={(value) => set({ value })}
            min={0}
            step={0.01}
            suffix={currency}
          />
          {exampleLine}
        </Section>
      )
    case "free_shipping":
      return (
        <Text size="small" className="text-ui-fg-subtle">
          {t("coupons.wizard.freeShippingHint")}
        </Text>
      )
    case "buy_get":
      return (
        <Section title={t("coupons.wizard.buyGet")} hint={t("coupons.wizard.buyGetHint")}>
          <div className="flex flex-wrap items-center gap-4">
            <NumberField
              ariaLabel={t("coupons.wizard.buy")}
              value={draft.buy_qty}
              onChange={(buy_qty) => set({ buy_qty })}
              min={1}
              suffix={t("coupons.wizard.buy")}
            />
            <NumberField
              ariaLabel={t("coupons.wizard.get")}
              value={draft.get_qty}
              onChange={(get_qty) => set({ get_qty })}
              min={1}
              suffix={t("coupons.wizard.get")}
            />
            <NumberField
              ariaLabel={t("coupons.wizard.getDiscount")}
              value={draft.value}
              onChange={(value) => set({ value })}
              min={1}
              suffix={t("coupons.wizard.getDiscount")}
            />
          </div>
          <MultiPicker
            kind="products"
            label={t("coupons.wizard.buyProducts")}
            value={draft.buy_product_ids}
            onChange={(buy_product_ids) => set({ buy_product_ids })}
          />
        </Section>
      )
  }
}

/** The right-hand panel: what the customer sees, the sentence, a summary, readiness and warnings. */
const PreviewPanel = ({
  draft,
  sentence,
  errors,
  warnings,
  stepErrors,
  lang,
  currencyCode,
}: {
  draft: CouponDraft
  sentence: string | undefined
  errors: string[]
  warnings: string[]
  stepErrors: (step: Step) => string[]
  lang: string
  currencyCode: string
}) => {
  const { t } = useTranslation()
  const currency = draft.currency_code ?? currencyCode
  const sorted = draft.tiers ? [...draft.tiers].sort((a, b) => a.min - b.min) : null

  const headline = (() => {
    if (sorted?.length) {
      const f = (v: number) => (draft.kind === "percentage" ? `-${v}%` : `-${money(v, currency, lang)}`)
      return `${f(sorted[0].value)} … ${f(sorted[sorted.length - 1].value)}`
    }
    switch (draft.kind) {
      case "percentage":
      case "category":
        return `-${draft.value ?? 0}%`
      case "fixed":
        return `-${money(draft.value ?? 0, currency, lang)}`
      case "free_shipping":
        return t("coupons.kinds.free_shipping.title")
      case "buy_get":
        return `${draft.buy_qty ?? 0} + ${draft.get_qty ?? 0}`
    }
  })()

  const rows: Array<[string, string]> = [
    [
      t("coupons.preview.who"),
      draft.audience === "all"
        ? t("coupons.audience.all.title")
        : t(`coupons.preview.${draft.audience}`, { count: draft.audience_ids.length }),
    ],
    [t("coupons.preview.how"), draft.automatic ? t("coupons.wizard.automatic") : t("coupons.wizard.withCode")],
    [
      t("coupons.preview.validity"),
      draft.starts_at || draft.ends_at
        ? `${draft.starts_at ? shortDate(draft.starts_at, lang) : t("coupons.preview.now")} – ${draft.ends_at ? shortDate(draft.ends_at, lang) : t("coupons.preview.noEnd")}`
        : t("coupons.preview.noEnd"),
    ],
    [t("coupons.preview.uses"), draft.usage_limit != null ? String(draft.usage_limit) : t("coupons.wizard.unlimited")],
    [
      t("coupons.preview.perCustomer"),
      draft.per_customer_limit != null ? String(draft.per_customer_limit) : t("coupons.wizard.unlimited"),
    ],
    [
      t("coupons.preview.minBasket"),
      draft.min_subtotal ? money(draft.min_subtotal, currency, lang) : t("coupons.preview.none"),
    ],
  ]

  return (
    <aside className="hidden w-[360px] shrink-0 flex-col gap-y-5 overflow-y-auto border-l border-ui-border-base bg-ui-bg-subtle p-5 lg:flex">
      <div className="flex flex-col gap-y-2">
        <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase">
          {t("coupons.preview.customer")}
        </Text>
        <div className="rounded-lg border border-dashed border-ui-border-interactive bg-ui-bg-base p-4">
          <Text size="xlarge" weight="plus" className="text-ui-fg-interactive">
            {headline}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            {t(`coupons.kinds.${draft.tiers ? "tiers" : draft.kind}.hint`)}
          </Text>
          <div className="mt-3 flex items-center justify-between border-t border-ui-border-base pt-3">
            <Text size="small" weight="plus" className="font-mono">
              {draft.automatic ? t("coupons.preview.noCode") : draft.code || "—"}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {draft.automatic ? t("coupons.preview.appliesItself") : t("coupons.preview.typeInCart")}
            </Text>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-y-2 rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
        <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase">
          {t("coupons.preview.sentence")}
        </Text>
        <Text size="small" weight="plus">
          {sentence ?? "…"}
        </Text>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="txt-compact-xsmall text-ui-fg-subtle">{label}</dt>
            <dd className="txt-compact-small">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-y-2">
        <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase">
          {t("coupons.preview.readiness")}
        </Text>
        {STEPS.map((step) => {
          const ready = stepErrors(step).length === 0
          return (
            <div key={step} className="flex items-center justify-between">
              <Text size="small">{t(`coupons.wizard.steps.${step}`)}</Text>
              <Text size="xsmall" className={ready ? "text-ui-fg-interactive" : "text-ui-fg-error"}>
                {ready ? t("coupons.preview.ready") : t("coupons.preview.todo")}
              </Text>
            </div>
          )
        })}
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="flex flex-col gap-y-2">
          <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase">
            {t("coupons.preview.readFirst")}
          </Text>
          {errors.map((key) => (
            <Text
              key={key}
              size="small"
              className="rounded-md border-l-4 border-ui-tag-red-border bg-ui-bg-base p-3 text-ui-fg-error"
            >
              {t(`coupons.errors.${key}`)}
            </Text>
          ))}
          {warnings.map((key) => (
            <Text
              key={key}
              size="small"
              className="rounded-md border-l-4 border-ui-tag-orange-border bg-ui-bg-base p-3"
            >
              {t(`coupons.warnings.${key}`)}
            </Text>
          ))}
        </div>
      )}
    </aside>
  )
}
