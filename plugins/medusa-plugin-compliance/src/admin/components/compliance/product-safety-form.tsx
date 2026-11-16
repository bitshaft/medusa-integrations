import { ArrowUpTray, Photo } from "@medusajs/icons"
import { Badge, Button, Label, Select, Text, toast } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type Party,
  type ProductSafety,
  type ProductSafetyData,
  useManufacturers,
  useSaveProductSafety,
  useSettings,
} from "../../lib/compliance/api"
import { errorMessage, languageLabel } from "../../lib/compliance/format"
import { sdk } from "../../lib/compliance/kit/sdk"
import { MarkdownEditor } from "./markdown-editor"
import { Gaps, LanguageSelect, Section, TextAreaField, TextField, Toggle } from "./shared"

const EMPTY: ProductSafetyData = {
  manufacturer_id: null,
  manufacturer: {},
  outside_eu: null,
  responsible: {},
  identification: { type: null, model: null, batch: null, batch_applicable: false },
  label_image_url: null,
  warnings: {},
}

const NONE = "__none__"

/** Fields of a manufacturer or a responsible person. Placeholders show the profile's values. */
export const PartyFields = ({
  value,
  onChange,
  fallback,
}: {
  value: Partial<Party>
  onChange: (value: Partial<Party>) => void
  fallback?: Partial<Party> | null
}) => {
  const { t } = useTranslation()
  const set = (key: keyof Party) => (v: string) => onChange({ ...value, [key]: v || null })
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <TextField
        label={t("compliance.gpsr.fields.name")}
        value={value.name}
        placeholder={fallback?.name ?? undefined}
        onChange={set("name")}
      />
      <TextField
        label={t("compliance.gpsr.fields.trade_name")}
        value={value.trade_name}
        placeholder={fallback?.trade_name ?? undefined}
        onChange={set("trade_name")}
      />
      <TextAreaField
        label={t("compliance.gpsr.fields.postal_address")}
        value={value.postal_address}
        rows={2}
        hint={
          fallback?.postal_address ? t("compliance.gpsr.fromProfile", { value: fallback.postal_address }) : undefined
        }
        onChange={set("postal_address")}
      />
      <TextField
        label={t("compliance.gpsr.fields.electronic_address")}
        value={value.electronic_address}
        placeholder={fallback?.electronic_address ?? undefined}
        hint={t("compliance.gpsr.fields.electronic_address_hint")}
        onChange={set("electronic_address")}
      />
    </div>
  )
}

/** The GPSR form of one product, used by the product page widget. */
export const ProductSafetyForm = ({
  productId,
  current,
  demo,
}: {
  productId: string
  current: ProductSafety
  demo: boolean
}) => {
  const { t, i18n } = useTranslation()
  const manufacturers = useManufacturers()
  const settings = useSettings()
  const save = useSaveProductSafety(productId)
  const [form, setForm] = useState<ProductSafetyData>(current.data ?? EMPTY)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // The store's languages, the default (the original the store falls back to) first.
  // Text in other languages is dropped on save, as on the server.
  const languages = settings.data?.store_languages ?? []
  const original = languages[0] ?? null
  const requiredInStore = settings.data?.settings.gpsr.require.warnings
    ? settings.data.settings.gpsr.warning_languages.filter((lang) => languages.includes(lang))
    : null
  const required = requiredInStore === null ? [] : requiredInStore.length ? requiredInStore : languages.slice(0, 1)
  const [picked, setPicked] = useState<string | null>(null)
  const language = picked && languages.includes(picked) ? picked : original
  const filled = (lang: string) => Boolean(form.warnings[lang]?.trim())
  const dropped = Object.keys(form.warnings).some((lang) => !languages.includes(lang) && filled(lang))

  useEffect(() => setForm(current.data ?? EMPTY), [current.data])

  const profile = manufacturers.data?.manufacturers.find((m) => m.id === form.manufacturer_id) ?? null
  const outsideEu = form.outside_eu ?? profile?.outside_eu ?? false

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const { files } = await sdk.admin.upload.create({ files: [file] })
      setForm((f) => ({ ...f, label_image_url: files[0]?.url ?? f.label_image_url }))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  const submit = () =>
    save.mutate(
      {
        ...form,
        warnings: Object.fromEntries(languages.filter(filled).map((lang) => [lang, form.warnings[lang] ?? ""])),
      },
      {
        onSuccess: (result) =>
          result.gaps.length
            ? toast.warning(t("compliance.gpsr.savedWithGaps", { count: result.gaps.length }))
            : toast.success(t("compliance.gpsr.saved")),
        onError: (error) => toast.error(errorMessage(error)),
      }
    )

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Text size="small" weight="plus">
          {t("compliance.gpsr.status")}
        </Text>
        <Gaps gaps={current.gaps} />
      </div>

      <Section title={t("compliance.gpsr.manufacturer")} hint={t("compliance.gpsr.manufacturerHint")}>
        <div className="flex flex-col gap-y-1">
          <Label size="xsmall" weight="plus">
            {t("compliance.gpsr.profile")}
          </Label>
          <Select
            size="small"
            value={form.manufacturer_id ?? NONE}
            onValueChange={(v) => setForm({ ...form, manufacturer_id: v === NONE ? null : v })}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={NONE}>{t("compliance.gpsr.noProfile")}</Select.Item>
              {(manufacturers.data?.manufacturers ?? []).map((m) => (
                <Select.Item key={m.id} value={m.id}>
                  {m.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <Text size="xsmall" className="text-ui-fg-subtle">
          {profile ? t("compliance.gpsr.overrideHint") : t("compliance.gpsr.ownDataHint")}
        </Text>
        <PartyFields
          value={form.manufacturer}
          fallback={profile?.manufacturer}
          onChange={(manufacturer) => setForm({ ...form, manufacturer })}
        />
        <div className="flex flex-col gap-y-1">
          <Label size="xsmall" weight="plus">
            {t("compliance.gpsr.outsideEu")}
          </Label>
          <Select
            size="small"
            value={form.outside_eu === null ? "profile" : form.outside_eu ? "yes" : "no"}
            onValueChange={(v) => setForm({ ...form, outside_eu: v === "profile" ? null : v === "yes" })}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="profile">
                {t("compliance.gpsr.outsideEuProfile", {
                  value: profile?.outside_eu ? t("compliance.yes") : t("compliance.no"),
                })}
              </Select.Item>
              <Select.Item value="yes">{t("compliance.gpsr.outsideEuYes")}</Select.Item>
              <Select.Item value="no">{t("compliance.gpsr.outsideEuNo")}</Select.Item>
            </Select.Content>
          </Select>
        </div>
      </Section>

      {outsideEu && (
        <Section title={t("compliance.gpsr.responsible")} hint={t("compliance.gpsr.responsibleHint")}>
          <PartyFields
            value={form.responsible}
            fallback={profile?.responsible}
            onChange={(responsible) => setForm({ ...form, responsible })}
          />
        </Section>
      )}

      <Section title={t("compliance.gpsr.identification")} hint={t("compliance.gpsr.identificationHint")}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextField
            label={t("compliance.gpsr.fields.type")}
            value={form.identification.type}
            onChange={(type) => setForm({ ...form, identification: { ...form.identification, type: type || null } })}
          />
          <TextField
            label={t("compliance.gpsr.fields.model")}
            value={form.identification.model}
            onChange={(model) => setForm({ ...form, identification: { ...form.identification, model: model || null } })}
          />
        </div>
        <Toggle
          label={t("compliance.gpsr.fields.batch_applicable")}
          hint={t("compliance.gpsr.fields.batch_applicable_hint")}
          checked={form.identification.batch_applicable}
          onChange={(batch_applicable) =>
            setForm({ ...form, identification: { ...form.identification, batch_applicable } })
          }
        />
        {form.identification.batch_applicable && (
          <TextField
            label={t("compliance.gpsr.fields.batch")}
            value={form.identification.batch}
            onChange={(batch) => setForm({ ...form, identification: { ...form.identification, batch: batch || null } })}
          />
        )}
        <div className="flex flex-col gap-y-2">
          <Label size="xsmall" weight="plus">
            {t("compliance.gpsr.fields.label_image")}
          </Label>
          <div className="flex items-center gap-x-4">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-subtle">
              {form.label_image_url ? (
                <img src={form.label_image_url} alt="" className="size-full object-contain" />
              ) : (
                <Photo className="text-ui-fg-muted" />
              )}
            </div>
            <div className="flex flex-col gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="small"
                  variant="secondary"
                  type="button"
                  isLoading={uploading}
                  disabled={demo}
                  onClick={() => fileInput.current?.click()}
                >
                  <ArrowUpTray />
                  {form.label_image_url ? t("compliance.gpsr.imageChange") : t("compliance.gpsr.imageChoose")}
                </Button>
                {form.label_image_url && (
                  <Button
                    size="small"
                    variant="transparent"
                    type="button"
                    onClick={() => setForm({ ...form, label_image_url: null })}
                  >
                    {t("compliance.remove")}
                  </Button>
                )}
              </div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("compliance.gpsr.imageHint")}
              </Text>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label={t("compliance.gpsr.fields.label_image")}
              onChange={(e) => {
                void upload(e.target.files?.[0])
                e.target.value = ""
              }}
            />
          </div>
        </div>
      </Section>

      <Section
        title={t("compliance.gpsr.warnings")}
        hint={t("compliance.gpsr.warningsHint", { language: languageLabel(original ?? "pl", i18n.language) })}
        actions={
          language && (
            <LanguageSelect
              languages={languages}
              value={language}
              onChange={setPicked}
              note={(lang) =>
                filled(lang)
                  ? null
                  : required.includes(lang)
                    ? t("compliance.languages.requiredEmpty")
                    : t("compliance.languages.empty")
              }
            />
          )
        }
      >
        {language && (
          <MarkdownEditor
            // Each language starts in edit mode.
            key={language}
            label={languageLabel(language, i18n.language)}
            badge={
              required.includes(language) ? (
                <Badge size="2xsmall" color={filled(language) ? "green" : "orange"}>
                  {t("compliance.gpsr.requiredLanguage")}
                </Badge>
              ) : undefined
            }
            value={form.warnings[language] ?? ""}
            // An empty translation shows what the store falls back to.
            placeholder={language !== original && original ? form.warnings[original] || undefined : undefined}
            onChange={(text) => setForm({ ...form, warnings: { ...form.warnings, [language]: text } })}
          />
        )}
        {dropped && (
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("compliance.languages.dropped")}
          </Text>
        )}
      </Section>

      <div className="flex justify-end">
        {/* Saving keeps warnings only in the store's languages, so it waits for them. */}
        <Button size="small" onClick={submit} isLoading={save.isPending} disabled={demo || !languages.length}>
          {t("compliance.save")}
        </Button>
      </div>
    </div>
  )
}
