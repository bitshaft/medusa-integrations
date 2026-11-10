import { z } from "@medusajs/framework/zod"

import { logPluginDisabled, overrideOf, parsePluginOptions } from "../options"

const schema = z.object({
  apiKey: z.string().min(1),
  timeoutMs: z.number().int().positive().default(1000),
})

describe("parsePluginOptions", () => {
  it("returns parsed options with defaults", () => {
    expect(parsePluginOptions(schema, { apiKey: "k" }, { required: ["apiKey"] })).toEqual({
      enabled: true,
      options: { apiKey: "k", timeoutMs: 1000 },
    })
  })

  it("is disabled, not throwing, when a required option is missing or blank", () => {
    expect(parsePluginOptions(schema, { apiKey: "  " }, { required: ["apiKey"] })).toEqual({
      enabled: false,
      reason: "missing option apiKey",
    })
    expect(parsePluginOptions(schema, undefined, { required: ["apiKey", "x"] })).toEqual({
      enabled: false,
      reason: "missing options apiKey, x",
    })
  })

  it("reports invalid options on one line without their values", () => {
    const result = parsePluginOptions(schema, {
      apiKey: "secret-value",
      timeoutMs: -5,
    })
    expect(result.enabled).toBe(false)
    const reason = (result as { reason: string }).reason
    expect(reason).toContain("timeoutMs")
    expect(reason).not.toContain("secret-value")
    expect(reason).not.toContain("\n")
  })
})

describe("overrideOf", () => {
  it("drops defaults so overrides only contain what was set", () => {
    expect(overrideOf(schema).parse({})).toEqual({})
  })
})

describe("logPluginDisabled", () => {
  it("logs once per plugin name", () => {
    const warn = jest.fn()
    const name = `test-${Math.random()}`
    logPluginDisabled({ warn }, name, "missing option apiKey")
    logPluginDisabled({ warn }, name, "missing option apiKey")
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/Disabled: missing option apiKey/)
  })
})
