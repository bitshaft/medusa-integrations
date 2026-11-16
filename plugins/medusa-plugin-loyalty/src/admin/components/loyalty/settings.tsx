import { Plus, Trash } from "@medusajs/icons"
import { Button, Container, Heading, IconButton, Input, Label, Select, Switch, Text, toast } from "@medusajs/ui"
import { type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type Settings as SettingsValues,
  useGroupLabels,
  useGroupOptions,
  usePreview,
  useSaveSettings,
} from "../../lib/loyalty/api"
import { adminLocale, points, slug } from "../../lib/loyalty/format"
import { errorMessage } from "../../lib/loyalty/kit/format"
import { NumberField, Picker, Section } from "./shared"

type Props = {
  settings: SettingsValues
  defaults: SettingsValues
  /** The store's currencies, the default first. */
  storeCurrencies: string[]
}

/** Select value for "follow the store's default currency". */
const STORE_DEFAULT = "__store__"

/** "Settings": every rule of the program, saved together; and a preview of what customers read. */
export const Settings = ({ settings, defaults, storeCurrencies }: Props) => {
  const { t } = useTranslation()
  const save = useSaveSettings()
  const [form, setForm] = useState<SettingsValues>(settings)
  const [groupSearch, setGroupSearch] = useState("")
  const groups = useGroupOptions(groupSearch)
  const groupLabels = useGroupLabels(form.excluded_group_ids)
  useEffect(() => setForm(settings), [settings])

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const dirty = JSON.stringify(form) !== JSON.stringify(settings)
  const storeDefault = storeCurrencies[0] ?? "pln"
  const currency = (form.currency_code ?? storeDefault).toUpperCase()
  // A currency saved earlier that the store no longer has stays visible, with a warning.
  const currencyOptions =
    form.currency_code && !storeCurrencies.includes(form.currency_code)
      ? [...storeCurrencies, form.currency_code]
      : storeCurrencies

  const onSave = () =>
    save.mutate(form, {
      onSuccess: () => toast.success(t("loyalty.settings.saved")),
      onError: (error) => toast.error(t("loyalty.settings.saveFailed", { error: errorMessage(error) })),
    })

  const action = (key: "signup" | "first_order" | "newsletter" | "birthday", extra?: ReactNode) => (
    <div className="flex flex-col gap-y-2 rounded-md border border-ui-border-base p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-x-2">
          <Switch
            id={`action-${key}`}
            checked={form.actions[key].enabled}
            onCheckedChange={(enabled) => set("actions", { ...form.actions, [key]: { ...form.actions[key], enabled } })}
          />
          <Label htmlFor={`action-${key}`} size="small" weight="plus">
            {t(`loyalty.settings.actions.${key}`)}
          </Label>
        </div>
        <NumberField
          label={t("loyalty.settings.points")}
          value={form.actions[key].points}
          onChange={(value) => set("actions", { ...form.actions, [key]: { ...form.actions[key], points: value ?? 0 } })}
          min={0}
          step={1}
          suffix={t("loyalty.pointsUnit")}
        />
      </div>
      <Text size="xsmall" className="text-ui-fg-subtle">
        {t(`loyalty.settings.actions.${key}Hint`)}
      </Text>
      {extra}
    </div>
  )

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
      <Container className="overflow-hidden flex flex-col gap-y-4 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level="h2">{t("loyalty.settings.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("loyalty.settings.subtitle")}
            </Text>
          </div>
          <div className="flex gap-x-2">
            <Button size="small" variant="secondary" disabled={!dirty} onClick={() => setForm(settings)}>
              {t("loyalty.settings.discard")}
            </Button>
            <Button size="small" variant="secondary" onClick={() => setForm(defaults)}>
              {t("loyalty.settings.defaults")}
            </Button>
            <Button size="small" onClick={onSave} disabled={!dirty} isLoading={save.isPending}>
              {t("loyalty.save")}
            </Button>
          </div>
        </div>

        <Section title={t("loyalty.settings.program")} hint={t("loyalty.settings.programHint")}>
          <div className="flex items-center gap-x-2">
            <Switch id="program" checked={form.enabled} onCheckedChange={(enabled) => set("enabled", enabled)} />
            <Label htmlFor="program" size="small" weight="plus">
              {form.enabled ? t("loyalty.settings.programOn") : t("loyalty.settings.programOff")}
            </Label>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex min-w-72 flex-1 flex-col gap-y-1">
              <Label size="xsmall" weight="plus">
                {t("loyalty.settings.terms")}
              </Label>
              <Input
                size="small"
                type="url"
                placeholder={t("loyalty.settings.termsPlaceholder")}
                value={form.terms_url ?? ""}
                onChange={(e) => set("terms_url", e.target.value.trim() || null)}
              />
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("loyalty.settings.termsHint")}
              </Text>
            </div>
            <div className="flex w-56 flex-col gap-y-1">
              <Label size="xsmall" weight="plus">
                {t("loyalty.settings.currency")}
              </Label>
              <Select
                size="small"
                value={form.currency_code ?? STORE_DEFAULT}
                onValueChange={(value) => set("currency_code", value === STORE_DEFAULT ? null : value)}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value={STORE_DEFAULT}>
                    {t("loyalty.settings.currencyStore", { currency: storeDefault.toUpperCase() })}
                  </Select.Item>
                  {currencyOptions.map((code) => (
                    <Select.Item key={code} value={code}>
                      {code.toUpperCase()}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              <Text
                size="xsmall"
                className={
                  form.currency_code && !storeCurrencies.includes(form.currency_code)
                    ? "text-ui-fg-error"
                    : "text-ui-fg-subtle"
                }
              >
                {form.currency_code && !storeCurrencies.includes(form.currency_code)
                  ? t("loyalty.settings.currencyMissing", { currency })
                  : t("loyalty.settings.currencyHint")}
              </Text>
            </div>
          </div>
        </Section>

        <Section title={t("loyalty.settings.earn")} hint={t("loyalty.settings.earnHint")}>
          <div className="flex flex-wrap items-end gap-4">
            <NumberField
              label={t("loyalty.settings.earnPoints")}
              value={form.earn.points}
              onChange={(v) => set("earn", { ...form.earn, points: v ?? 0 })}
              min={0}
              step={0.5}
              suffix={t("loyalty.pointsUnit")}
            />
            <NumberField
              label={t("loyalty.settings.earnPer")}
              value={form.earn.per_amount}
              onChange={(v) => set("earn", { ...form.earn, per_amount: v ?? 1 })}
              min={0.01}
              step={1}
              suffix={currency}
            />
            <div className="flex w-48 flex-col gap-y-1">
              <Label size="xsmall" weight="plus">
                {t("loyalty.settings.base")}
              </Label>
              <Select
                size="small"
                value={form.earn.base}
                onValueChange={(base) => set("earn", { ...form.earn, base: base as "gross" | "net" })}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="gross">{t("loyalty.settings.gross")}</Select.Item>
                  <Select.Item value="net">{t("loyalty.settings.net")}</Select.Item>
                </Select.Content>
              </Select>
            </div>
          </div>
        </Section>

        <Section title={t("loyalty.settings.actionsTitle")} hint={t("loyalty.settings.actionsHint")}>
          {action("signup")}
          {action("first_order")}
          {action(
            "birthday",
            <div className="flex flex-wrap gap-4">
              <NumberField
                label={t("loyalty.settings.birthdayInterval")}
                value={form.actions.birthday.change_interval_days}
                onChange={(v) =>
                  set("actions", {
                    ...form.actions,
                    birthday: { ...form.actions.birthday, change_interval_days: v ?? 0 },
                  })
                }
                min={0}
                step={1}
                suffix={t("loyalty.daysUnit")}
              />
              <NumberField
                label={t("loyalty.settings.birthdayMinDays")}
                value={form.actions.birthday.min_days_before}
                onChange={(v) =>
                  set("actions", { ...form.actions, birthday: { ...form.actions.birthday, min_days_before: v ?? 0 } })
                }
                min={0}
                step={1}
                suffix={t("loyalty.daysUnit")}
              />
            </div>
          )}
          {action("newsletter")}
        </Section>

        <Section title={t("loyalty.settings.tiers")} hint={t("loyalty.settings.tiersHint")}>
          <NumberField
            label={t("loyalty.settings.window")}
            value={form.tiers.window_months}
            onChange={(v) => set("tiers", { ...form.tiers, window_months: v ?? 12 })}
            min={1}
            step={1}
            suffix={t("loyalty.monthsUnit")}
          />
          {form.tiers.levels.map((tier, index) => {
            const update = (patch: Partial<typeof tier>) =>
              set("tiers", {
                ...form.tiers,
                levels: form.tiers.levels.map((l, i) => (i === index ? { ...l, ...patch } : l)),
              })
            return (
              <div key={index} className="flex flex-wrap items-end gap-3 rounded-md border border-ui-border-base p-3">
                <div className="flex w-40 flex-col gap-y-1">
                  <Label size="xsmall" weight="plus">
                    {t("loyalty.settings.tierName")}
                  </Label>
                  <Input size="small" value={tier.name} onChange={(e) => update({ name: e.target.value })} />
                </div>
                <NumberField
                  label={t("loyalty.settings.tierThreshold")}
                  value={tier.threshold}
                  onChange={(v) => update({ threshold: v ?? 0 })}
                  min={0}
                  step={1}
                  suffix={currency}
                />
                <NumberField
                  label={t("loyalty.settings.tierMultiplier")}
                  value={tier.multiplier}
                  onChange={(v) => update({ multiplier: v ?? 1 })}
                  min={0}
                  step={0.05}
                  width="w-24"
                  suffix="×"
                />
                <NumberField
                  label={t("loyalty.settings.tierBonus")}
                  value={tier.bonus_points}
                  onChange={(v) => update({ bonus_points: v ?? 0 })}
                  min={0}
                  step={1}
                  suffix={t("loyalty.pointsUnit")}
                />
                <IconButton
                  size="small"
                  variant="transparent"
                  aria-label={t("loyalty.remove")}
                  onClick={() =>
                    set("tiers", { ...form.tiers, levels: form.tiers.levels.filter((_, i) => i !== index) })
                  }
                >
                  <Trash />
                </IconButton>
              </div>
            )
          })}
          <Button
            size="small"
            variant="secondary"
            className="self-start"
            onClick={() => {
              const last = form.tiers.levels[form.tiers.levels.length - 1]
              const name = t("loyalty.settings.newTier", { n: form.tiers.levels.length + 1 })
              let id = slug(name)
              while (form.tiers.levels.some((l) => l.id === id)) id = `${id}-x`
              set("tiers", {
                ...form.tiers,
                levels: [
                  ...form.tiers.levels,
                  {
                    id,
                    name,
                    threshold: last ? last.threshold + 1000 : 0,
                    multiplier: last ? last.multiplier + 0.25 : 1,
                    bonus_points: 0,
                  },
                ],
              })
            }}
          >
            <Plus />
            {t("loyalty.settings.addTier")}
          </Button>
        </Section>

        <Section title={t("loyalty.settings.expiry")} hint={t("loyalty.settings.expiryHint")}>
          <div className="flex items-center gap-x-2">
            <Switch
              id="expiry"
              checked={form.expiry.enabled}
              onCheckedChange={(enabled) => set("expiry", { ...form.expiry, enabled })}
            />
            <Label htmlFor="expiry" size="small">
              {t("loyalty.settings.expiryOn")}
            </Label>
          </div>
          <div className="flex flex-wrap gap-4">
            <NumberField
              label={t("loyalty.settings.expiryMonths")}
              value={form.expiry.months}
              onChange={(v) => set("expiry", { ...form.expiry, months: v ?? 12 })}
              min={1}
              step={1}
              suffix={t("loyalty.monthsUnit")}
              disabled={!form.expiry.enabled}
            />
            <NumberField
              label={t("loyalty.settings.reminderDays")}
              value={form.expiry.reminder_days}
              onChange={(v) => set("expiry", { ...form.expiry, reminder_days: v ?? 0 })}
              min={0}
              step={1}
              suffix={t("loyalty.daysUnit")}
              disabled={!form.expiry.enabled}
            />
          </div>
        </Section>

        <Section title={t("loyalty.settings.rewards")}>
          <div className="flex items-center gap-x-2">
            <Switch
              id="return-codes"
              checked={form.rewards.return_points_on_code_expiry}
              onCheckedChange={(v) => set("rewards", { ...form.rewards, return_points_on_code_expiry: v })}
            />
            <Label htmlFor="return-codes" size="small">
              {t("loyalty.settings.returnOnExpiry")}
            </Label>
          </div>
          <NumberField
            label={t("loyalty.settings.giftRelease")}
            value={form.rewards.gift_release_days}
            onChange={(v) => set("rewards", { ...form.rewards, gift_release_days: v ?? 14 })}
            min={1}
            step={1}
            suffix={t("loyalty.daysUnit")}
          />
        </Section>

        <Section title={t("loyalty.settings.excluded")} hint={t("loyalty.settings.excludedHint")}>
          <Picker
            label={t("loyalty.settings.groups")}
            value={form.excluded_group_ids}
            onChange={(ids) => set("excluded_group_ids", ids)}
            options={groups.data ?? []}
            labels={groupLabels.data ?? {}}
            search={groupSearch}
            onSearch={setGroupSearch}
          />
        </Section>
      </Container>

      <Preview settings={settings} currency={(settings.currency_code ?? storeDefault).toUpperCase()} />
    </div>
  )
}

/** "What the customer sees": the texts the Store API returns, for a sample basket, with the saved settings. */
const Preview = ({ settings, currency }: { settings: SettingsValues; currency: string }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [amount, setAmount] = useState<number | null>(300)
  const [balance, setBalance] = useState<number | null>(1200)
  const [tier, setTier] = useState<string>("none")
  const { data } = usePreview({ amount: amount ?? 0, balance: balance ?? 0, tier_id: tier === "none" ? null : tier })
  const texts = data?.texts[adminLocale(lang)]

  return (
    <Container className="overflow-hidden flex h-fit flex-col gap-y-4 px-6 py-6">
      <div>
        <Heading level="h2">{t("loyalty.preview.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("loyalty.preview.hint")}
        </Text>
      </div>
      <div className="flex flex-wrap gap-3">
        <NumberField
          label={t("loyalty.preview.basket")}
          value={amount}
          onChange={setAmount}
          min={0}
          step={10}
          width="w-28"
          suffix={currency}
        />
        <NumberField
          label={t("loyalty.preview.balance")}
          value={balance}
          onChange={setBalance}
          step={10}
          width="w-28"
        />
      </div>
      {settings.tiers.levels.length > 0 && (
        <div className="flex flex-col gap-y-1">
          <Label size="xsmall" weight="plus">
            {t("loyalty.preview.tier")}
          </Label>
          <Select size="small" value={tier} onValueChange={setTier}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="none">{t("loyalty.dashboard.noTier")}</Select.Item>
              {settings.tiers.levels.map((l) => (
                <Select.Item key={l.id} value={l.id}>
                  {l.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-y-2 rounded-lg border border-dashed border-ui-border-interactive bg-ui-bg-subtle p-4">
        <Text size="xlarge" weight="plus" className="text-ui-fg-interactive">
          +{points(data?.points ?? 0, lang)} {t("loyalty.pointsUnit")}
        </Text>
        {texts &&
          Object.entries(texts)
            .filter(([, text]) => !!text)
            .map(([key, text]) => (
              <Text key={key} size="small">
                {text}
              </Text>
            ))}
      </div>
      <Text size="xsmall" className="text-ui-fg-muted">
        {t("loyalty.preview.saved")}
      </Text>
    </Container>
  )
}
