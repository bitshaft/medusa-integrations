import { Alert, Badge, Button, Container, Heading, Input, Label, Select, Switch, Text, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type CurrencyRule,
  RATE_MODES,
  ROUNDINGS,
  type Settings,
  type SettingsResponse,
  useSample,
  useSaveSettings,
  useSettings,
} from "../../lib/currency/api"
import { errorMessage } from "../../lib/currency/kit/format"
import { useDebounced } from "../../lib/currency/kit/hooks"
import { LoadingBlock } from "../../lib/currency/kit/page"
import { countryName, formatMoney, inputDecimal, parseDecimal } from "../../lib/currency/format"
import { Warnings } from "./shared"

const DEFAULT_RULE: CurrencyRule = {
  enabled: true,
  mode: "api",
  fixedRate: null,
  marginPercent: "0",
  rounding: "none",
  tax: "gross",
  taxCountry: null,
}

const AUTO = "__auto"

/** "Settings": the base currency and, for each other currency, how its prices are worked out. */
export const SettingsTab = () => {
  const settings = useSettings()
  if (settings.isLoading || !settings.data) return <LoadingBlock />
  return <SettingsForm data={settings.data} />
}

const SettingsForm = ({ data }: { data: SettingsResponse }) => {
  const { t, i18n } = useTranslation()
  const save = useSaveSettings()
  const initial = (): Settings => ({ ...data.settings, currencies: { ...data.rules, ...data.settings.currencies } })
  const [draft, setDraft] = useState<Settings>(initial)
  // Text as typed (with a comma), checked on save.
  const [texts, setTexts] = useState<Record<string, { fixedRate: string; marginPercent: string }>>({})
  useEffect(() => setDraft(initial()), [data])

  const store = data.store
  const baseCode = draft.baseCurrency ?? store.currencies.find((c) => c.is_default)?.code ?? store.currencies[0]?.code
  const others = store.currencies.filter((currency) => currency.code !== baseCode)
  const countries = [...new Set(store.regions.flatMap((region) => region.countries))].sort()
  const ruleOf = (code: string) => draft.currencies[code] ?? DEFAULT_RULE
  const setRule = (code: string, patch: Partial<CurrencyRule>) =>
    setDraft((current) => ({
      ...current,
      currencies: { ...current.currencies, [code]: { ...ruleOf(code), ...patch } },
    }))
  const textOf = (code: string) =>
    texts[code] ?? {
      fixedRate: inputDecimal(ruleOf(code).fixedRate, i18n.language),
      marginPercent: inputDecimal(ruleOf(code).marginPercent, i18n.language),
    }

  const onSave = () => {
    const currencies: Record<string, CurrencyRule> = {}
    for (const currency of others) {
      const rule = ruleOf(currency.code)
      const text = textOf(currency.code)
      const fixedRate = text.fixedRate.trim() ? parseDecimal(text.fixedRate) : null
      const margin = text.marginPercent.trim() ? parseDecimal(text.marginPercent, true) : "0"
      if (text.fixedRate.trim() && !fixedRate) {
        return toast.error(t("currency.settings.invalidRate", { code: currency.code.toUpperCase() }))
      }
      if (!margin) return toast.error(t("currency.settings.invalidMargin", { code: currency.code.toUpperCase() }))
      if (rule.mode === "fixed" && !fixedRate) {
        return toast.error(t("currency.settings.fixedRequired", { code: currency.code.toUpperCase() }))
      }
      currencies[currency.code] = { ...rule, fixedRate, marginPercent: margin }
    }
    save.mutate(
      { ...draft, currencies },
      {
        onSuccess: () => {
          setTexts({})
          toast.success(t("currency.settings.saved"))
        },
        onError: (error) => toast.error(t("currency.settings.saveFailed"), { description: errorMessage(error) }),
      }
    )
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="overflow-hidden divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("currency.settings.baseTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("currency.settings.baseHint")}
          </Text>
        </div>
        <div className="grid gap-4 px-6 py-4 md:grid-cols-2">
          <div className="flex flex-col gap-y-1">
            <Label size="small" weight="plus">
              {t("currency.settings.baseCurrency")}
            </Label>
            <Select
              value={draft.baseCurrency ?? AUTO}
              onValueChange={(value) => setDraft({ ...draft, baseCurrency: value === AUTO ? null : value })}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={AUTO}>
                  {t("currency.settings.storeDefault", {
                    code: (store.currencies.find((c) => c.is_default)?.code ?? "").toUpperCase(),
                  })}
                </Select.Item>
                {store.currencies.map((currency) => (
                  <Select.Item key={currency.code} value={currency.code}>
                    {currency.code.toUpperCase()} · {currency.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small" weight="plus">
              {t("currency.settings.baseTaxCountry")}
            </Label>
            <CountrySelect
              value={draft.baseTaxCountry}
              countries={countries}
              rates={store.taxRates}
              onChange={(value) => setDraft({ ...draft, baseTaxCountry: value })}
            />
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("currency.settings.baseTaxHint", {
                state: store.taxInclusive.currency[baseCode ?? ""] ? t("currency.tax.gross") : t("currency.tax.net"),
              })}
            </Text>
          </div>
        </div>
      </Container>

      {others.map((currency) => (
        <CurrencyCard
          key={currency.code}
          code={currency.code}
          name={currency.name}
          rule={ruleOf(currency.code)}
          text={textOf(currency.code)}
          onRule={(patch) => setRule(currency.code, patch)}
          onText={(patch) => setTexts({ ...texts, [currency.code]: { ...textOf(currency.code), ...patch } })}
          countries={countries}
          data={data}
          baseCode={baseCode ?? ""}
          draft={draft}
        />
      ))}
      {!others.length && (
        <Container>
          <Text size="small" className="text-ui-fg-subtle">
            {t("currency.settings.noOthers")}
          </Text>
        </Container>
      )}

      <div className="flex justify-end">
        <Button size="small" isLoading={save.isPending} onClick={onSave}>
          {t("currency.settings.save")}
        </Button>
      </div>
    </div>
  )
}

const CountrySelect = ({
  value,
  countries,
  rates,
  onChange,
}: {
  value: string | null
  countries: string[]
  rates: Record<string, string | null>
  onChange: (value: string | null) => void
}) => {
  const { t, i18n } = useTranslation()
  return (
    <Select value={value ?? AUTO} onValueChange={(next) => onChange(next === AUTO ? null : next)}>
      <Select.Trigger>
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value={AUTO}>{t("currency.settings.countryAuto")}</Select.Item>
        {countries.map((country) => (
          <Select.Item key={country} value={country}>
            {countryName(country, i18n.language)} ·{" "}
            {rates[country] !== null && rates[country] !== undefined
              ? `${rates[country]} %`
              : t("currency.settings.noRate")}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  )
}

const CurrencyCard = ({
  code,
  name,
  rule,
  text,
  onRule,
  onText,
  countries,
  data,
  baseCode,
  draft,
}: {
  code: string
  name: string
  rule: CurrencyRule
  text: { fixedRate: string; marginPercent: string }
  onRule: (patch: Partial<CurrencyRule>) => void
  onText: (patch: Partial<{ fixedRate: string; marginPercent: string }>) => void
  countries: string[]
  data: SettingsResponse
  baseCode: string
  draft: Settings
}) => {
  const { t, i18n } = useTranslation()
  const fixedRate = parseDecimal(text.fixedRate)
  const margin = text.marginPercent.trim() ? parseDecimal(text.marginPercent, true) : "0"
  // Debounced as text: a new object every render would never settle.
  const ruleText = useDebounced(JSON.stringify({ ...rule, fixedRate, marginPercent: margin ?? "0" }), 400)
  const sampleRule = useMemo(() => JSON.parse(ruleText) as CurrencyRule, [ruleText])
  const sample = useSample(
    rule.enabled && (sampleRule.mode !== "fixed" || sampleRule.fixedRate)
      ? { currency: code, rule: sampleRule, base_currency: draft.baseCurrency, base_tax_country: draft.baseTaxCountry }
      : null
  )
  const result = sample.data
  const inclusive = data.store.taxInclusive.currency

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-x-2">
          <Heading level="h2">{code.toUpperCase()}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {name}
          </Text>
          {!rule.enabled && (
            <Badge size="2xsmall" color="grey">
              {t("currency.mode.off")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-x-2">
          <Label htmlFor={`enabled-${code}`} size="small">
            {t("currency.settings.enabled")}
          </Label>
          <Switch id={`enabled-${code}`} checked={rule.enabled} onCheckedChange={(enabled) => onRule({ enabled })} />
        </div>
      </div>
      {rule.enabled && (
        <div className="grid gap-4 px-6 py-4 md:grid-cols-3">
          <div className="flex flex-col gap-y-1">
            <Label size="small" weight="plus">
              {t("currency.settings.mode")}
            </Label>
            <Select value={rule.mode} onValueChange={(mode) => onRule({ mode: mode as CurrencyRule["mode"] })}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {RATE_MODES.map((mode) => (
                  <Select.Item key={mode} value={mode}>
                    {t(`currency.mode.${mode}`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            {rule.mode === "fixed" && (
              <div className="flex items-center gap-x-2 pt-1">
                <Text size="small" className="whitespace-nowrap">
                  1 {code.toUpperCase()} =
                </Text>
                <Input
                  size="small"
                  inputMode="decimal"
                  placeholder="4,00"
                  value={text.fixedRate}
                  aria-invalid={Boolean(text.fixedRate) && !fixedRate}
                  onChange={(event) => onText({ fixedRate: event.target.value })}
                />
                <Text size="small">{baseCode.toUpperCase()}</Text>
              </div>
            )}
            {rule.mode === "api_margin" && (
              <div className="flex items-center gap-x-2 pt-1">
                <Input
                  size="small"
                  inputMode="decimal"
                  placeholder="3"
                  value={text.marginPercent}
                  aria-invalid={!margin}
                  onChange={(event) => onText({ marginPercent: event.target.value })}
                />
                <Text size="small">%</Text>
              </div>
            )}
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t(`currency.mode.${rule.mode}Hint`)}
            </Text>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small" weight="plus">
              {t("currency.settings.rounding")}
            </Label>
            <Select
              value={rule.rounding}
              onValueChange={(rounding) => onRule({ rounding: rounding as CurrencyRule["rounding"] })}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {ROUNDINGS.map((rounding) => (
                  <Select.Item key={rounding} value={rounding}>
                    {t(`currency.rounding.${rounding}`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small" weight="plus">
              {t("currency.settings.tax")}
            </Label>
            <Select value={rule.tax} onValueChange={(tax) => onRule({ tax: tax as CurrencyRule["tax"] })}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="gross">{t("currency.tax.mode.gross")}</Select.Item>
                <Select.Item value="net">{t("currency.tax.mode.net")}</Select.Item>
              </Select.Content>
            </Select>
            <CountrySelect
              value={rule.taxCountry}
              countries={countries}
              rates={data.store.taxRates}
              onChange={(taxCountry) => onRule({ taxCountry })}
            />
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("currency.settings.taxHint", {
                base: inclusive[baseCode] ? t("currency.tax.gross") : t("currency.tax.net"),
                target: inclusive[code] ? t("currency.tax.gross") : t("currency.tax.net"),
              })}
            </Text>
          </div>
        </div>
      )}
      {rule.enabled && (
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Text size="small" weight="plus">
            {t("currency.settings.sample")}
          </Text>
          {result?.conversion?.ok ? (
            <div className="flex flex-wrap items-center gap-2">
              <Text size="large" weight="plus">
                {formatMoney("100", baseCode, i18n.language, 2)} →{" "}
                {formatMoney(result.conversion.amount, code, i18n.language)}
              </Text>
              <Warnings
                row={{
                  warnings: result.conversion.warnings,
                  tax: result.conversion.tax,
                  tax_rates: { base: result.tax?.base.rate ?? null, target: result.tax?.target.rate ?? null },
                }}
              />
            </div>
          ) : result ? (
            <Text size="small" className="text-ui-fg-error">
              {t(
                `currency.reason.${result.conversion && !result.conversion.ok ? result.conversion.reason : result.reason}`
              )}
            </Text>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              {rule.mode === "fixed" && !fixedRate ? t("currency.settings.enterRate") : "…"}
            </Text>
          )}
          {result?.conversion?.ok && result.conversion.warnings.includes("tax_differs") && (
            <Alert variant="warning">
              {t("currency.settings.taxDiffers", { base: result.tax?.base.rate, target: result.tax?.target.rate })}
            </Alert>
          )}
        </div>
      )}
    </Container>
  )
}
