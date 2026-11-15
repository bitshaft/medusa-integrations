/**
 * The look of the emails that admins change on the "Appearance" tab:
 * colours, font, shapes, header alignment and logo. It is stored as the
 * `theme` settings row and laid over `brand` from the plugin options, so a
 * value an admin never touched keeps following the options.
 */

export const COLOR_KEYS = ["primary", "primaryText", "background", "card", "text", "muted", "border"] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

/** Fonts every mail client has; a web font would fall back unpredictably. */
export const FONTS = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
  helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  verdana: "Verdana, Geneva, Tahoma, sans-serif",
  trebuchet: "'Trebuchet MS', 'Lucida Grande', Tahoma, sans-serif",
  georgia: "Georgia, 'Times New Roman', Times, serif",
  mono: "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace",
} as const
export type FontKey = keyof typeof FONTS

/** Corner radius in pixels, by name. */
export const BUTTON_SHAPES = { square: 0, rounded: 6, pill: 999 } as const
export type ButtonShape = keyof typeof BUTTON_SHAPES
export const CARD_SHAPES = { square: 0, rounded: 8, soft: 16 } as const
export type CardShape = keyof typeof CARD_SHAPES
export const ALIGNMENTS = ["center", "left"] as const
export type Alignment = (typeof ALIGNMENTS)[number]

/** The resolved style every template gets in `brand.style`. */
export type BrandStyle = {
  font: FontKey
  fontFamily: string
  buttonShape: ButtonShape
  buttonRadius: number
  cardShape: CardShape
  cardRadius: number
  headerAlign: Alignment
}

export const DEFAULT_STYLE: Pick<BrandStyle, "font" | "buttonShape" | "cardShape" | "headerAlign"> = {
  font: "system",
  buttonShape: "rounded",
  cardShape: "rounded",
  headerAlign: "center",
}

/** What the admin saved. Every field is optional: missing means "as in the options". */
export type StoredTheme = {
  colors?: Partial<Record<ColorKey, string>>
  font?: FontKey
  button_shape?: ButtonShape
  card_shape?: CardShape
  header_align?: Alignment
  /** `null` hides the logo set in the options (the store name is shown instead). */
  logo_url?: string | null
  logo_width?: number
}

export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value)

/** Keeps only valid values of a stored theme, so a bad row never breaks rendering. */
export function cleanTheme(value: unknown): StoredTheme {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  const raw = value as Record<string, unknown>
  const theme: StoredTheme = {}

  if (raw.colors && typeof raw.colors === "object") {
    const colors: Partial<Record<ColorKey, string>> = {}
    for (const key of COLOR_KEYS) {
      const color = (raw.colors as Record<string, unknown>)[key]
      if (typeof color === "string" && HEX_COLOR.test(color)) {
        colors[key] = color.toLowerCase()
      }
    }
    if (Object.keys(colors).length) {
      theme.colors = colors
    }
  }
  if (isOneOf(Object.keys(FONTS) as FontKey[], raw.font)) theme.font = raw.font
  if (isOneOf(Object.keys(BUTTON_SHAPES) as ButtonShape[], raw.button_shape)) theme.button_shape = raw.button_shape
  if (isOneOf(Object.keys(CARD_SHAPES) as CardShape[], raw.card_shape)) theme.card_shape = raw.card_shape
  if (isOneOf(ALIGNMENTS, raw.header_align)) theme.header_align = raw.header_align
  if (raw.logo_url === null) {
    theme.logo_url = null
  } else if (typeof raw.logo_url === "string" && /^https:\/\/\S+$/i.test(raw.logo_url.trim())) {
    theme.logo_url = raw.logo_url.trim()
  }
  if (
    typeof raw.logo_width === "number" &&
    Number.isInteger(raw.logo_width) &&
    raw.logo_width >= 40 &&
    raw.logo_width <= 600
  ) {
    theme.logo_width = raw.logo_width
  }
  return theme
}

export function resolveStyle(base: Partial<typeof DEFAULT_STYLE>, theme: StoredTheme = {}): BrandStyle {
  const font = theme.font ?? base.font ?? DEFAULT_STYLE.font
  const buttonShape = theme.button_shape ?? base.buttonShape ?? DEFAULT_STYLE.buttonShape
  const cardShape = theme.card_shape ?? base.cardShape ?? DEFAULT_STYLE.cardShape
  return {
    font,
    fontFamily: FONTS[font],
    buttonShape,
    buttonRadius: BUTTON_SHAPES[buttonShape],
    cardShape,
    cardRadius: CARD_SHAPES[cardShape],
    headerAlign: theme.header_align ?? base.headerAlign ?? DEFAULT_STYLE.headerAlign,
  }
}
