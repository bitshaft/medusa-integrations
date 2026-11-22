import type { AdvertInput } from "./types"

/** OLX's own limits (Partner API, "Create advert"). */
export const LIMITS = { titleMin: 16, titleMax: 150, descriptionMin: 80, descriptionMax: 9000 } as const

export type ValidationIssue = {
  field: "title" | "description" | "price" | "category" | "city" | "contact" | "images"
  code: string
}

const REPEATED = /([!?.,\-=+#%&@*_><:()|])\1\1/
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/
const WEBSITE = /\b(?:https?:\/\/|www\.)\S+/i
/** Three groups of three digits, optionally after +48, and no longer run of digits around them. */
const PHONE = /(?<![\d.-])(?:\+?48[\s.-]?)?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}(?![\d])/

function capsShare(text: string): number {
  const letters = [...text].filter((char) => char.toLowerCase() !== char.toUpperCase())
  if (!letters.length) {
    return 0
  }
  return letters.filter((char) => char === char.toUpperCase()).length / letters.length
}

function textIssues(field: "title" | "description", text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (REPEATED.test(text)) issues.push({ field, code: "repeated_punctuation" })
  if (capsShare(text) > 0.5) issues.push({ field, code: "too_many_capitals" })
  if (EMAIL.test(text)) issues.push({ field, code: "contains_email" })
  if (WEBSITE.test(text)) issues.push({ field, code: "contains_website" })
  return issues
}

/**
 * Something that may be a phone number, which OLX does not allow. Only a
 * warning in the form: `100 200 300` can as well be a size or a SKU, so OLX
 * has the last word.
 */
export const looksLikePhone = (text: string): boolean => PHONE.test(text)

/** Whether OLX can fetch an image address: public https, not this computer or a private network. */
export function isPublicImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== "https:" || host === "localhost" || host.endsWith(".local")) {
      return false
    }
    return !/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(host)
  } catch {
    return false
  }
}

/** Everything OLX would refuse that can be told before sending. An empty list means "send it". */
export function validateAdvert(input: AdvertInput): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const title = input.title.trim()
  const description = input.description.trim()
  if (title.length < LIMITS.titleMin) issues.push({ field: "title", code: "too_short" })
  if (title.length > LIMITS.titleMax) issues.push({ field: "title", code: "too_long" })
  issues.push(...textIssues("title", title))
  if (description.length < LIMITS.descriptionMin) issues.push({ field: "description", code: "too_short" })
  if (description.length > LIMITS.descriptionMax) issues.push({ field: "description", code: "too_long" })
  issues.push(...textIssues("description", description))
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(input.price) || Number(input.price) <= 0) {
    issues.push({ field: "price", code: "invalid" })
  }
  if (!Number.isInteger(input.category_id) || input.category_id <= 0) {
    issues.push({ field: "category", code: "missing" })
  }
  if (!Number.isInteger(input.city_id) || input.city_id <= 0) issues.push({ field: "city", code: "missing" })
  if (!input.contact_name.trim()) issues.push({ field: "contact", code: "missing" })
  if (!input.images.length) issues.push({ field: "images", code: "missing" })
  if (input.images.some((image) => !isPublicImageUrl(image))) issues.push({ field: "images", code: "not_public" })
  return issues
}

/** Plain text from a product description that may hold HTML. */
export function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
