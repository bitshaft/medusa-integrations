import { Plus, Trash } from "@medusajs/icons"
import { Button, Container, Heading, IconButton, Input, Label, Select, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type OmnibusException,
  type Settings as SettingsType,
  type SettingsResponse,
  useSaveSettings,
} from "../../lib/compliance/api"
import { errorMessage, languageLabel, shortDate } from "../../lib/compliance/format"
import { LegalNote, NumberField, Section, TextAreaField, TextField, Toggle } from "./shared"

/** The Settings tab: every rule of the three modules, with the defaults a new store starts with. */
export const Settings = ({ data }: { data: SettingsResponse }) => {
  const { t, i18n } = useTranslation()
  const save = useSaveSettings()
  const [s, setS] = useState<SettingsType>(data.settings)
  useEffect(() => setS(data.settings), [data.settings])

  const set = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => setS({ ...s, [key]: value })
  const gdpr = (patch: Partial<SettingsType["gdpr"]>) => set("gdpr", { ...s.gdpr, ...patch })
  const anon = (patch: Partial<SettingsType["gdpr"]["anonymize"]>) =>
    gdpr({ anonymize: { ...s.gdpr.anonymize, ...patch } })
  const omnibus = (patch: Partial<SettingsType["omnibus"]>) => set("omnibus", { ...s.omnibus, ...patch })
  const require = (patch: Partial<SettingsType["gpsr"]["require"]>) =>
    set("gpsr", { ...s.gpsr, require: { ...s.gpsr.require, ...patch } })
  const exception = (index: number, patch: Partial<OmnibusException>) =>
    omnibus({ exceptions: s.omnibus.exceptions.map((e, i) => (i === index ? { ...e, ...patch } : e)) })

  const submit = () =>
    save.mutate(s, {
      onSuccess: () => toast.success(t("compliance.settings.saved")),
      onError: (error) => toast.error(errorMessage(error)),
    })

  return (
    <Container className="overflow-hidden flex flex-col gap-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">{t("compliance.settings.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("compliance.settings.hint")}
          </Text>
        </div>
        <Button size="small" onClick={submit} isLoading={save.isPending}>
          {t("compliance.save")}
        </Button>
      </div>
      <LegalNote>{t("compliance.settings.legal")}</LegalNote>

      <Section title={t("compliance.settings.modules")}>
        <Toggle
          label={t("compliance.modules.gpsr")}
          hint={t("compliance.settings.gpsrHint")}
          checked={s.modules.gpsr}
          onChange={(gpsr) => set("modules", { ...s.modules, gpsr })}
        />
        <Toggle
          label={t("compliance.modules.gdpr")}
          hint={t("compliance.settings.gdprHint")}
          checked={s.modules.gdpr}
          onChange={(v) => set("modules", { ...s.modules, gdpr: v })}
        />
        <Toggle
          label={t("compliance.modules.omnibus")}
          hint={t("compliance.settings.omnibusHint")}
          checked={s.modules.omnibus}
          onChange={(v) => set("modules", { ...s.modules, omnibus: v })}
        />
        <Toggle
          label={t("compliance.settings.demo")}
          hint={t("compliance.settings.demoHint")}
          checked={s.demo}
          onChange={(demo) => set("demo", demo)}
        />
      </Section>

      <Section title={t("compliance.settings.gpsrTitle")} hint={t("compliance.settings.gpsrRequiredHint")}>
        <Toggle
          label={t("compliance.gpsr.fields.trade_name")}
          checked={s.gpsr.require.manufacturer_trade_name}
          onChange={(v) => require({ manufacturer_trade_name: v })}
        />
        <Toggle
          label={t("compliance.gpsr.fields.type")}
          checked={s.gpsr.require.identification_type}
          onChange={(v) => require({ identification_type: v })}
        />
        <Toggle
          label={t("compliance.gpsr.fields.model")}
          checked={s.gpsr.require.identification_model}
          onChange={(v) => require({ identification_model: v })}
        />
        <Toggle
          label={t("compliance.gpsr.fields.label_image")}
          checked={s.gpsr.require.label_image}
          onChange={(v) => require({ label_image: v })}
        />
        <Toggle
          label={t("compliance.gpsr.warnings")}
          checked={s.gpsr.require.warnings}
          onChange={(v) => require({ warnings: v })}
        />
        {s.gpsr.require.warnings && (
          <div className="flex flex-col gap-y-2">
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("compliance.settings.warningLanguagesHint")}
            </Text>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {[...new Set([...data.store_languages, ...s.gpsr.warning_languages])].map((lang) => (
                <Toggle
                  key={lang}
                  label={languageLabel(lang, i18n.language)}
                  checked={s.gpsr.warning_languages.includes(lang)}
                  onChange={(on) =>
                    set("gpsr", {
                      ...s.gpsr,
                      warning_languages: on
                        ? [...new Set([...s.gpsr.warning_languages, lang])]
                        : s.gpsr.warning_languages.filter((l) => l !== lang).length
                          ? s.gpsr.warning_languages.filter((l) => l !== lang)
                          : s.gpsr.warning_languages,
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title={t("compliance.settings.requestsTitle")} hint={t("compliance.settings.requestsHint")}>
        <div className="flex flex-wrap gap-4">
          <NumberField
            label={t("compliance.settings.responseDays")}
            value={s.gdpr.response_days}
            min={1}
            suffix={t("compliance.days")}
            onChange={(v) => gdpr({ response_days: v })}
          />
          <NumberField
            label={t("compliance.settings.warnDays")}
            value={s.gdpr.warn_days}
            min={0}
            suffix={t("compliance.days")}
            onChange={(v) => gdpr({ warn_days: v })}
          />
          <NumberField
            label={t("compliance.settings.tokenHours")}
            value={s.gdpr.token_hours}
            min={1}
            suffix={t("compliance.hours")}
            onChange={(v) => gdpr({ token_hours: v })}
          />
        </div>
        <TextField
          label={t("compliance.settings.verifyUrl")}
          hint={t("compliance.settings.verifyUrlHint")}
          placeholder={t("compliance.settings.verifyUrlPlaceholder")}
          value={s.gdpr.verify_url}
          onChange={(v) => gdpr({ verify_url: v })}
        />
        <TextField
          label={t("compliance.settings.privacyUrl")}
          value={s.gdpr.privacy_policy_url}
          onChange={(v) => gdpr({ privacy_policy_url: v })}
        />
        <TextAreaField
          label={t("compliance.settings.requestNotice")}
          hint={t("compliance.settings.requestNoticeHint")}
          value={s.gdpr.request_notice}
          onChange={(v) => gdpr({ request_notice: v })}
        />
        <div className="flex flex-wrap gap-4">
          <NumberField
            label={t("compliance.settings.perEmail")}
            value={s.gdpr.rate_limit.per_email}
            min={1}
            onChange={(v) => gdpr({ rate_limit: { ...s.gdpr.rate_limit, per_email: v } })}
          />
          <NumberField
            label={t("compliance.settings.perIp")}
            value={s.gdpr.rate_limit.per_ip}
            min={1}
            onChange={(v) => gdpr({ rate_limit: { ...s.gdpr.rate_limit, per_ip: v } })}
          />
          <NumberField
            label={t("compliance.settings.window")}
            value={s.gdpr.rate_limit.window_minutes}
            min={1}
            suffix={t("compliance.minutes")}
            onChange={(v) => gdpr({ rate_limit: { ...s.gdpr.rate_limit, window_minutes: v } })}
          />
        </div>
      </Section>

      <Section title={t("compliance.settings.anonymizeTitle")} hint={t("compliance.settings.anonymizeHint")}>
        <TextField
          label={t("compliance.settings.placeholder")}
          value={s.gdpr.anonymize.placeholder}
          onChange={(v) => anon({ placeholder: v })}
        />
        <Toggle
          label={t("compliance.settings.customerMetadata")}
          checked={s.gdpr.anonymize.customer_metadata}
          onChange={(v) => anon({ customer_metadata: v })}
        />
        <Toggle
          label={t("compliance.settings.orderEmail")}
          checked={s.gdpr.anonymize.order_email}
          onChange={(v) => anon({ order_email: v })}
        />
        <Toggle
          label={t("compliance.settings.orderPhone")}
          checked={s.gdpr.anonymize.order_phone}
          onChange={(v) => anon({ order_phone: v })}
        />
        <Toggle
          label={t("compliance.settings.orderShipping")}
          checked={s.gdpr.anonymize.order_shipping_address}
          onChange={(v) => anon({ order_shipping_address: v })}
        />
        <Toggle
          label={t("compliance.settings.orderBilling")}
          hint={t("compliance.settings.orderBillingHint")}
          checked={s.gdpr.anonymize.order_billing_address}
          onChange={(v) => anon({ order_billing_address: v })}
        />
        {!s.gdpr.anonymize.order_billing_address && (
          <NumberField
            label={t("compliance.settings.retention")}
            hint={t("compliance.settings.retentionHint")}
            value={s.gdpr.anonymize.billing_retention_months}
            min={0}
            suffix={t("compliance.months")}
            onChange={(v) => anon({ billing_retention_months: v })}
          />
        )}
        <Toggle
          label={t("compliance.settings.carts")}
          checked={s.gdpr.anonymize.carts}
          onChange={(v) => anon({ carts: v })}
        />
      </Section>

      <Section
        title={t("compliance.settings.omnibusTitle")}
        hint={
          data.omnibus_started_at
            ? t("compliance.settings.omnibusStarted", { date: shortDate(data.omnibus_started_at, i18n.language) })
            : t("compliance.omnibus.notStarted")
        }
      >
        <NumberField
          label={t("compliance.settings.period")}
          value={s.omnibus.period_days}
          min={1}
          suffix={t("compliance.days")}
          onChange={(v) => omnibus({ period_days: v })}
        />
        <Toggle
          label={t("compliance.settings.automaticPromotions")}
          hint={t("compliance.settings.automaticPromotionsHint")}
          checked={s.omnibus.automatic_promotions}
          onChange={(v) => omnibus({ automatic_promotions: v })}
        />
        <Toggle
          label={t("compliance.settings.codePromotions")}
          hint={t("compliance.settings.codePromotionsHint")}
          checked={s.omnibus.code_promotions}
          onChange={(v) => omnibus({ code_promotions: v })}
        />
        {data.regions.some((r) => r.countries.length > 1) && (
          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              {t("compliance.settings.taxCountry")}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("compliance.settings.taxCountryHint")}
            </Text>
            {data.regions
              .filter((r) => r.countries.length > 1)
              .map((region) => (
                <div key={region.id} className="flex items-center gap-x-3">
                  <Text size="small" className="w-40">
                    {region.name}
                  </Text>
                  <Select
                    size="small"
                    value={s.omnibus.tax_country[region.id] ?? region.countries[0]}
                    onValueChange={(v) => omnibus({ tax_country: { ...s.omnibus.tax_country, [region.id]: v } })}
                  >
                    <Select.Trigger className="w-28">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {region.countries.map((c) => (
                        <Select.Item key={c} value={c}>
                          {c.toUpperCase()}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
              ))}
          </div>
        )}
      </Section>

      <Section
        title={t("compliance.settings.exceptionsTitle")}
        hint={t("compliance.settings.exceptionsHint")}
        actions={
          <Button
            size="small"
            variant="secondary"
            onClick={() =>
              omnibus({
                exceptions: [
                  ...s.omnibus.exceptions,
                  { target: "category", id: "", label: "", rule: "exempt", note: "" },
                ],
              })
            }
          >
            <Plus />
            {t("compliance.settings.addException")}
          </Button>
        }
      >
        {!s.omnibus.exceptions.length && (
          <Text size="small" className="text-ui-fg-subtle">
            {t("compliance.settings.noExceptions")}
          </Text>
        )}
        {s.omnibus.exceptions.map((e, i) => (
          <div
            key={i}
            className="grid grid-cols-1 items-end gap-2 rounded-md bg-ui-bg-subtle p-3 md:grid-cols-[140px_1fr_1fr_170px_auto]"
          >
            <div className="flex flex-col gap-y-1">
              <Label size="xsmall" weight="plus">
                {t("compliance.settings.target")}
              </Label>
              <Select
                size="small"
                value={e.target}
                onValueChange={(v) => exception(i, { target: v as OmnibusException["target"] })}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="category">{t("compliance.settings.category")}</Select.Item>
                  <Select.Item value="product">{t("compliance.settings.product")}</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="xsmall" weight="plus">
                ID
              </Label>
              <Input
                size="small"
                value={e.id}
                placeholder={e.target === "category" ? "pcat_…" : "prod_…"}
                onChange={(ev) => exception(i, { id: ev.target.value.trim() })}
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="xsmall" weight="plus">
                {t("compliance.settings.label")}
              </Label>
              <Input size="small" value={e.label} onChange={(ev) => exception(i, { label: ev.target.value })} />
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="xsmall" weight="plus">
                {t("compliance.settings.rule")}
              </Label>
              <Select
                size="small"
                value={e.rule}
                onValueChange={(v) => exception(i, { rule: v as OmnibusException["rule"] })}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="exempt">{t("compliance.settings.ruleExempt")}</Select.Item>
                  <Select.Item value="gradual">{t("compliance.settings.ruleGradual")}</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <IconButton
              size="small"
              variant="transparent"
              onClick={() => omnibus({ exceptions: s.omnibus.exceptions.filter((_, j) => j !== i) })}
            >
              <Trash />
            </IconButton>
            <div className="md:col-span-5">
              <Input
                size="small"
                value={e.note}
                placeholder={t("compliance.settings.notePlaceholder")}
                onChange={(ev) => exception(i, { note: ev.target.value })}
              />
            </div>
          </div>
        ))}
      </Section>

      <Section title={t("compliance.settings.technical")} hint={t("compliance.settings.technicalHint")}>
        <Text size="small">
          {t("compliance.settings.timeZone")}: <span className="font-mono">{data.options.timeZone}</span>
        </Text>
        <Text size="small">
          {t("compliance.settings.providers")}:{" "}
          {data.options.dataProviders.length ? data.options.dataProviders.join(", ") : "—"}
        </Text>
      </Section>

      <div className="flex justify-end">
        <Button size="small" onClick={submit} isLoading={save.isPending}>
          {t("compliance.save")}
        </Button>
      </div>
    </Container>
  )
}
