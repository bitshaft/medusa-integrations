import { createMaskedLogger, createSecretMasker, maskIdentifier } from "../secrets"

describe("createSecretMasker", () => {
  it("masks every occurrence, including the URL-encoded form", () => {
    const mask = createSecretMasker(["s3cr3t+/value", undefined, ""])
    expect(mask("a s3cr3t+/value b s3cr3t%2B%2Fvalue")).toBe("a **** b ****")
  })

  it("ignores very short values", () => {
    expect(createSecretMasker(["abc"])("abc abc")).toBe("abc abc")
  })

  it("masks the longer secret first", () => {
    const mask = createSecretMasker(["secret-1", "secret-1-long"])
    expect(mask("x secret-1-long y")).toBe("x **** y")
  })
})

describe("createMaskedLogger", () => {
  it("masks messages and falls back to warn for error", () => {
    const warn = jest.fn()
    const logger = createMaskedLogger({ warn }, createSecretMasker(["topsecret"]))
    logger.error("failed with topsecret")
    logger.info("dropped, no info method")
    expect(warn).toHaveBeenCalledWith("failed with ****")
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe("maskIdentifier", () => {
  it("shows only the ends of long values", () => {
    expect(maskIdentifier("1234567890ab")).toBe("1234••••90ab")
    expect(maskIdentifier("short")).toBe("••••")
    expect(maskIdentifier(undefined)).toBe("")
  })
})
