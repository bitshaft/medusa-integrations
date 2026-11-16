import {
  consentState,
  type ConsentVersionRecord,
  linkEntries,
  planVersion,
  resolveGrantVersion,
  textHash,
  withPlaceholders,
} from "../consents"
import { LAWYER_PLACEHOLDER } from "../settings"

const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 10, minute))
const version = (type_key: string, n: number, pl: string): ConsentVersionRecord => ({
  type_key,
  version: n,
  text: { pl },
  text_hash: textHash({ pl }),
  created_at: at(n),
})

describe("consent versions", () => {
  const versions = [version("newsletter", 1, "Zgoda v1"), version("newsletter", 2, "Zgoda v2")]

  it("starts at version 1", () => {
    expect(planVersion([], "newsletter", { pl: "Tekst" })).toMatchObject({ create: true, version: 1 })
  })

  it("keeps the version when the text is the same", () => {
    expect(planVersion(versions, "newsletter", { pl: "  Zgoda v2 " })).toEqual({ create: false, version: 2 })
  })

  it("creates the next version when the text changes and keeps the old ones", () => {
    const plan = planVersion(versions, "newsletter", { pl: "Zgoda v3" })
    expect(plan).toMatchObject({ create: true, version: 3 })
    expect(versions).toHaveLength(2)
  })

  it("counts versions per consent type", () => {
    expect(planVersion(versions, "terms", { pl: "Zgoda v2" })).toMatchObject({ create: true, version: 1 })
  })

  it("treats a change in any language as a new version", () => {
    expect(textHash({ pl: "A", en: "B" })).not.toBe(textHash({ pl: "A", en: "C" }))
    expect(textHash({ en: "B", pl: "A" })).toBe(textHash({ pl: "A", en: "B" }))
  })

  it("fills empty languages with the lawyer placeholder", () => {
    expect(withPlaceholders({ pl: "Treść", en: " " }, ["pl", "en"])).toEqual({ pl: "Treść", en: LAWYER_PLACEHOLDER })
    // Any store language; text in a language the store doesn't offer is dropped.
    expect(withPlaceholders({ pl: "Treść", de: "Text" }, ["pl", "fr"])).toEqual({ pl: "Treść", fr: LAWYER_PLACEHOLDER })
  })

  it("accepts a grant only for the current version", () => {
    expect(resolveGrantVersion(versions, "newsletter", undefined)).toEqual({ ok: true, version: 2 })
    expect(resolveGrantVersion(versions, "newsletter", 2)).toEqual({ ok: true, version: 2 })
    expect(resolveGrantVersion(versions, "newsletter", 1)).toEqual({ ok: false, reason: "outdated" })
    expect(resolveGrantVersion(versions, "nope", undefined)).toEqual({ ok: false, reason: "unknown" })
  })
})

describe("consentState", () => {
  const versions = [version("newsletter", 1, "v1"), version("newsletter", 2, "v2"), version("analytics", 1, "a")]
  const types = [{ key: "newsletter" }, { key: "analytics" }]

  it("takes the last entry and flags consents given to an older text", () => {
    const state = consentState(
      [
        { type_key: "newsletter", version: 1, granted: true, created_at: at(1) },
        { type_key: "analytics", version: 1, granted: true, created_at: at(2) },
        { type_key: "analytics", version: 1, granted: false, created_at: at(3) },
      ],
      types,
      versions
    )
    expect(state).toEqual([
      { type_key: "newsletter", granted: true, version: 1, latest_version: 2, at: at(1), outdated: true },
      { type_key: "analytics", granted: false, version: 1, latest_version: 1, at: at(3), outdated: false },
    ])
  })

  it("is not granted without entries", () => {
    expect(consentState([], types, versions)[0]).toMatchObject({ granted: false, version: null, at: null })
  })
})

describe("linkEntries", () => {
  const versions = [version("analytics", 1, "a"), version("marketing", 1, "m")]
  const types = [{ key: "analytics" }, { key: "marketing" }]

  it("copies the browser's choices to the customer", () => {
    const result = linkEntries(
      [
        { type_key: "analytics", version: 1, granted: true, created_at: at(5) },
        { type_key: "marketing", version: 1, granted: false, created_at: at(5) },
      ],
      [],
      types,
      versions
    )
    expect(result).toEqual([
      { type_key: "analytics", version: 1, granted: true },
      { type_key: "marketing", version: 1, granted: false },
    ])
  })

  it("skips choices the customer already has and newer customer choices", () => {
    const result = linkEntries(
      [
        { type_key: "analytics", version: 1, granted: true, created_at: at(5) },
        { type_key: "marketing", version: 1, granted: true, created_at: at(5) },
      ],
      [
        { type_key: "analytics", version: 1, granted: true, created_at: at(1) },
        { type_key: "marketing", version: 1, granted: false, created_at: at(9) },
      ],
      types,
      versions
    )
    expect(result).toEqual([])
  })
})
