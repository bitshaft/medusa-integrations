import { Button, clx, Container, Heading, Input, Label, Select, Skeleton, Switch, Text, toast } from "@medusajs/ui"
import { type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type Alignment,
  type ButtonShape,
  type CardShape,
  type ColorKey,
  type EmailLocale,
  type EmailTheme,
  type FontKey,
  type ThemeResponse,
  useEmailPreview,
  useEmailTheme,
  useEmailTypes,
  useSaveEmailTheme,
} from "../../lib/emails/api"
import { errorMessage } from "../../lib/emails/kit/format"

const COLOR_KEYS: ColorKey[] = ["primary", "primaryText", "background", "card", "text", "muted", "border"]
const FONTS: Record<FontKey, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  verdana: "Verdana, Geneva, Tahoma, sans-serif",
  trebuchet: "'Trebuchet MS', 'Lucida Grande', Tahoma, sans-serif",
  georgia: "Georgia, 'Times New Roman', Times, serif",
  mono: "'SFMono-Regular', Menlo, Consolas, monospace",
}
const BUTTON_RADIUS: Record<ButtonShape, number> = { square: 0, rounded: 6, pill: 999 }
const CARD_RADIUS: Record<CardShape, number> = { square: 0, rounded: 8, soft: 16 }
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Ready palettes; a click fills every colour, which can then be adjusted. */
const PRESETS: Array<{ id: string; colors: Record<ColorKey, string> }> = [
  {
    id: "neutral",
    colors: {
      primary: "#18181b",
      primaryText: "#ffffff",
      background: "#f4f4f5",
      card: "#ffffff",
      text: "#18181b",
      muted: "#71717a",
      border: "#e4e4e7",
    },
  },
  {
    id: "navy",
    colors: {
      primary: "#1d4ed8",
      primaryText: "#ffffff",
      background: "#eff6ff",
      card: "#ffffff",
      text: "#0f172a",
      muted: "#64748b",
      border: "#dbeafe",
    },
  },
  {
    id: "forest",
    colors: {
      primary: "#047857",
      primaryText: "#ffffff",
      background: "#ecfdf5",
      card: "#ffffff",
      text: "#022c22",
      muted: "#4b5563",
      border: "#d1fae5",
    },
  },
  {
    id: "violet",
    colors: {
      primary: "#7c3aed",
      primaryText: "#ffffff",
      background: "#f5f3ff",
      card: "#ffffff",
      text: "#1e1b4b",
      muted: "#6b7280",
      border: "#ede9fe",
    },
  },
  {
    id: "sunset",
    colors: {
      primary: "#ea580c",
      primaryText: "#ffffff",
      background: "#fff7ed",
      card: "#ffffff",
      text: "#1c1917",
      muted: "#78716c",
      border: "#fed7aa",
    },
  },
  {
    id: "night",
    colors: {
      primary: "#fbbf24",
      primaryText: "#111827",
      background: "#111827",
      card: "#1f2937",
      text: "#f9fafb",
      muted: "#9ca3af",
      border: "#374151",
    },
  },
]

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Drops values equal to the plugin options, so they keep following the options. */
function compact(theme: EmailTheme, defaults: ThemeResponse["defaults"]): EmailTheme {
  const out: EmailTheme = {}
  const colors = Object.fromEntries(
    Object.entries(theme.colors ?? {}).filter(
      ([key, value]) => value && value.toLowerCase() !== defaults.colors[key as ColorKey].toLowerCase()
    )
  )
  if (Object.keys(colors).length) out.colors = colors
  if (theme.font && theme.font !== defaults.font) out.font = theme.font
  if (theme.button_shape && theme.button_shape !== defaults.button_shape) out.button_shape = theme.button_shape
  if (theme.card_shape && theme.card_shape !== defaults.card_shape) out.card_shape = theme.card_shape
  if (theme.header_align && theme.header_align !== defaults.header_align) out.header_align = theme.header_align
  if (theme.logo_url !== undefined && theme.logo_url !== defaults.logo_url) out.logo_url = theme.logo_url
  if (theme.logo_width !== undefined && theme.logo_width !== defaults.logo_width) out.logo_width = theme.logo_width
  return out
}

/** The "Appearance" tab: colours, font, shapes and logo of every email, with a live preview. */
export const Appearance = ({ locale }: { locale: EmailLocale }) => {
  const query = useEmailTheme(true)
  if (!query.data) {
    return (
      <Container className="overflow-hidden p-6">
        <Skeleton className="h-64 w-full" />
      </Container>
    )
  }
  return <AppearanceForm key={JSON.stringify(query.data.theme)} data={query.data} locale={locale} />
}

const AppearanceForm = ({ data, locale }: { data: ThemeResponse; locale: EmailLocale }) => {
  const { t } = useTranslation()
  const { defaults } = data
  const [draft, setDraft] = useState<EmailTheme>(data.theme)
  const [previewType, setPreviewType] = useState("order-confirmation")
  const save = useSaveEmailTheme()
  const types = useEmailTypes(true)

  const value = {
    colors: { ...defaults.colors, ...draft.colors },
    font: draft.font ?? defaults.font,
    button_shape: draft.button_shape ?? defaults.button_shape,
    card_shape: draft.card_shape ?? defaults.card_shape,
    header_align: draft.header_align ?? defaults.header_align,
    logo_url: draft.logo_url === undefined ? defaults.logo_url : draft.logo_url,
    logo_width: draft.logo_width ?? defaults.logo_width,
  }
  const [colorText, setColorText] = useState<Record<ColorKey, string>>(value.colors)
  const [logoText, setLogoText] = useState(value.logo_url ?? "")
  const logoValid = !logoText.trim() || /^https:\/\/\S+$/i.test(logoText.trim())

  const next = compact(draft, defaults)
  const dirty = JSON.stringify(next) !== JSON.stringify(compact(data.theme, defaults))
  const customized = Object.keys(compact(data.theme, defaults)).length > 0
  // Debounced as text: a new object on every render would restart the timer for ever.
  const debouncedTheme = useDebounced(JSON.stringify(next), 400)
  const preview = useEmailPreview(previewType, { locale, theme: JSON.parse(debouncedTheme) as EmailTheme }, true)

  const discard = () => {
    setDraft(data.theme)
    setColorText({ ...defaults.colors, ...data.theme.colors })
    setLogoText((data.theme.logo_url === undefined ? defaults.logo_url : data.theme.logo_url) ?? "")
  }

  const setColor = (key: ColorKey, color: string) => {
    setColorText((current) => ({ ...current, [key]: color }))
    if (HEX.test(color))
      setDraft((current) => ({ ...current, colors: { ...current.colors, [key]: color.toLowerCase() } }))
  }
  const applyPreset = (colors: Record<ColorKey, string>) => {
    setColorText(colors)
    setDraft((current) => ({ ...current, colors }))
  }

  const persist = (theme: EmailTheme | null) =>
    save.mutate(theme, {
      onSuccess: () => toast.success(t("emails.appearance.saved")),
      onError: (error) => toast.error(`${t("emails.appearance.saveError")} ${errorMessage(error)}`),
    })

  const customerTypes = (types.data?.types ?? []).filter((type) => type.audience !== "team")

  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,420px)_1fr]">
      <div className="flex flex-col gap-y-3">
        <Container className="overflow-hidden divide-y p-0">
          <Block title={t("emails.appearance.palettes")} hint={t("emails.appearance.palettesHint")}>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((preset) => {
                const active = COLOR_KEYS.every((key) => value.colors[key].toLowerCase() === preset.colors[key])
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.colors)}
                    className={clx(
                      "flex flex-col gap-y-1.5 rounded-lg border p-2 text-left transition-fg",
                      active
                        ? "border-ui-border-interactive shadow-borders-interactive-with-active"
                        : "border-ui-border-base hover:bg-ui-bg-base-hover"
                    )}
                  >
                    <div className="flex h-6 overflow-hidden rounded-md border border-ui-border-base">
                      {(["background", "card", "primary", "text"] as ColorKey[]).map((key) => (
                        <span key={key} className="flex-1" style={{ backgroundColor: preset.colors[key] }} />
                      ))}
                    </div>
                    <Text size="xsmall" weight="plus">
                      {t(`emails.appearance.preset.${preset.id}`)}
                    </Text>
                  </button>
                )
              })}
            </div>
          </Block>

          <Block title={t("emails.appearance.colors")}>
            <div className="flex flex-col gap-y-2">
              {COLOR_KEYS.map((key) => {
                const changed = value.colors[key].toLowerCase() !== defaults.colors[key].toLowerCase()
                return (
                  <div key={key} className="grid grid-cols-[1fr_auto_110px] items-center gap-2">
                    <div className="min-w-0">
                      <Label size="small" htmlFor={`emails-color-${key}`}>
                        {t(`emails.appearance.color.${key}`)}
                      </Label>
                      <Text size="xsmall" className="truncate text-ui-fg-subtle">
                        {t(`emails.appearance.colorHint.${key}`)}
                      </Text>
                    </div>
                    <input
                      type="color"
                      aria-label={t(`emails.appearance.color.${key}`)}
                      value={
                        HEX.test(colorText[key]) && colorText[key].length === 7 ? colorText[key] : value.colors[key]
                      }
                      onChange={(event) => setColor(key, event.target.value)}
                      className="h-8 w-10 cursor-pointer rounded-md border border-ui-border-base bg-ui-bg-field p-0.5"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        id={`emails-color-${key}`}
                        size="small"
                        className="font-mono"
                        value={colorText[key]}
                        aria-invalid={!HEX.test(colorText[key])}
                        onChange={(event) => setColor(key, event.target.value.trim())}
                      />
                      {changed && (
                        <button
                          type="button"
                          title={t("emails.appearance.restoreColor")}
                          className="text-ui-fg-muted hover:text-ui-fg-base txt-compact-small"
                          onClick={() => setColor(key, defaults.colors[key])}
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Block>

          <Block title={t("emails.appearance.font")} hint={t("emails.appearance.fontHint")}>
            <Select
              size="small"
              value={value.font}
              onValueChange={(font) => setDraft({ ...draft, font: font as FontKey })}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {(Object.keys(FONTS) as FontKey[]).map((font) => (
                  <Select.Item key={font} value={font}>
                    <span style={{ fontFamily: FONTS[font] }}>{t(`emails.appearance.fonts.${font}`)}</span>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </Block>

          <Block title={t("emails.appearance.buttons")}>
            <Choice
              options={(Object.keys(BUTTON_RADIUS) as ButtonShape[]).map((shape) => ({
                value: shape,
                label: t(`emails.appearance.buttonShape.${shape}`),
                sample: (
                  <span
                    className="inline-block px-3 py-1 txt-compact-xsmall-plus"
                    style={{
                      backgroundColor: value.colors.primary,
                      color: value.colors.primaryText,
                      borderRadius: BUTTON_RADIUS[shape],
                    }}
                  >
                    {t("emails.appearance.button")}
                  </span>
                ),
              }))}
              value={value.button_shape}
              onChange={(shape) => setDraft({ ...draft, button_shape: shape })}
            />
          </Block>

          <Block title={t("emails.appearance.card")}>
            <Choice
              options={(Object.keys(CARD_RADIUS) as CardShape[]).map((shape) => ({
                value: shape,
                label: t(`emails.appearance.cardShape.${shape}`),
                sample: (
                  <span
                    className="inline-block h-6 w-10 border"
                    style={{
                      backgroundColor: value.colors.card,
                      borderColor: value.colors.border,
                      borderRadius: Math.min(CARD_RADIUS[shape], 10),
                    }}
                  />
                ),
              }))}
              value={value.card_shape}
              onChange={(shape) => setDraft({ ...draft, card_shape: shape })}
            />
          </Block>

          <Block title={t("emails.appearance.header")}>
            <div className="flex flex-col gap-y-3">
              <Choice
                options={(["center", "left"] as Alignment[]).map((align) => ({
                  value: align,
                  label: t(`emails.appearance.align.${align}`),
                }))}
                value={value.header_align}
                onChange={(align) => setDraft({ ...draft, header_align: align })}
              />
              <div className="flex items-center justify-between gap-2">
                <Label size="small" htmlFor="emails-logo-on">
                  {t("emails.appearance.showLogo")}
                </Label>
                <Switch
                  id="emails-logo-on"
                  checked={value.logo_url !== null}
                  onCheckedChange={(checked) => {
                    const url = checked ? logoText.trim() || defaults.logo_url : null
                    setDraft({ ...draft, logo_url: url && /^https:\/\//i.test(url) ? url : checked ? undefined : null })
                  }}
                />
              </div>
              {value.logo_url !== null && (
                <div className="grid grid-cols-[1fr_96px] gap-2">
                  <div className="flex flex-col gap-y-1">
                    <Label size="small" htmlFor="emails-logo-url">
                      {t("emails.appearance.logoUrl")}
                    </Label>
                    <Input
                      id="emails-logo-url"
                      size="small"
                      placeholder="https://…/logo.png"
                      value={logoText}
                      aria-invalid={!logoValid}
                      onChange={(event) => {
                        setLogoText(event.target.value)
                        const url = event.target.value.trim()
                        if (!url) setDraft({ ...draft, logo_url: undefined })
                        else if (/^https:\/\/\S+$/i.test(url)) setDraft({ ...draft, logo_url: url })
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-y-1">
                    <Label size="small" htmlFor="emails-logo-width">
                      {t("emails.appearance.logoWidth")}
                    </Label>
                    <Input
                      id="emails-logo-width"
                      size="small"
                      type="number"
                      min={40}
                      max={600}
                      value={value.logo_width}
                      onChange={(event) => {
                        const width = Number(event.target.value)
                        if (Number.isInteger(width) && width >= 40 && width <= 600)
                          setDraft({ ...draft, logo_width: width })
                      }}
                    />
                  </div>
                  <Text
                    size="xsmall"
                    className={clx("col-span-2", logoValid ? "text-ui-fg-subtle" : "text-ui-fg-error")}
                  >
                    {logoValid ? t("emails.appearance.logoHint") : t("emails.appearance.logoInvalid")}
                  </Text>
                </div>
              )}
            </div>
          </Block>

          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
            <Button
              size="small"
              variant="secondary"
              disabled={!customized}
              isLoading={save.isPending}
              onClick={() => persist(null)}
            >
              {t("emails.appearance.restoreAll")}
            </Button>
            <div className="flex gap-2">
              <Button size="small" variant="secondary" disabled={!dirty} onClick={discard}>
                {t("emails.editor.discard")}
              </Button>
              <Button
                size="small"
                disabled={!dirty || !logoValid}
                isLoading={save.isPending}
                onClick={() => persist(next)}
              >
                {t("emails.editor.save")}
              </Button>
            </div>
          </div>
        </Container>
      </div>

      <Container className="overflow-hidden divide-y p-0 xl:sticky xl:top-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <Heading level="h2">{t("emails.editor.preview")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {dirty ? t("emails.appearance.previewUnsaved") : t("emails.appearance.previewHint")}
            </Text>
          </div>
          <div className="w-60">
            <Select size="small" value={previewType} onValueChange={setPreviewType}>
              <Select.Trigger aria-label={t("emails.appearance.previewType")}>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {customerTypes.map((type) => (
                  <Select.Item key={type.type} value={type.type}>
                    {t(`emails.types.${type.type}.name`, { defaultValue: type.type })}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>
        {preview.isError && (
          <Text size="small" className="px-6 py-4 text-ui-fg-error">
            {t("emails.editor.previewError")} {errorMessage(preview.error)}
          </Text>
        )}
        {preview.isLoading && (
          <div className="px-6 py-4">
            <Skeleton className="h-96 w-full" />
          </div>
        )}
        {preview.data && (
          // The email is shown as mail clients would: no scripts, no access to the admin.
          <iframe
            title={t("emails.editor.preview")}
            sandbox=""
            srcDoc={preview.data.preview.html}
            className="h-[760px] w-full rounded-b-lg border-0 bg-white"
          />
        )}
      </Container>
    </div>
  )
}

const Block = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-y-3 px-6 py-4">
    <div>
      <Text size="small" weight="plus">
        {title}
      </Text>
      {hint && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </div>
    {children}
  </div>
)

function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; sample?: ReactNode }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={clx(
            "flex flex-col items-center gap-y-2 rounded-lg border px-2 py-3 transition-fg",
            value === option.value
              ? "border-ui-border-interactive shadow-borders-interactive-with-active"
              : "border-ui-border-base hover:bg-ui-bg-base-hover"
          )}
        >
          {option.sample}
          <Text size="xsmall" weight="plus">
            {option.label}
          </Text>
        </button>
      ))}
    </div>
  )
}
