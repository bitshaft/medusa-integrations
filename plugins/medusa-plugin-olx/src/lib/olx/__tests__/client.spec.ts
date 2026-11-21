import { authorizeUrl, exchangeCode, OlxReconnectError, OlxTokens, type TokenSet } from "../auth"
import { advertBody, formAttributes, OlxClient, OlxRefusedError } from "../client"
import { adminReturnUrl, parseOptions } from "../options"
import type { AdvertInput, Connection } from "../types"

const SECRET = "fake-secret-1"
const TOKEN = "fake-access-1"

const input: AdvertInput = {
  title: "  Marynarka wełniana vintage  ",
  description: "Opis",
  price: "399.50",
  negotiable: true,
  category_id: 9001,
  attributes: [{ code: "state", value: "used" }],
  images: ["https://cdn.example.com/a.jpg"],
  city_id: 8001,
  district_id: 12,
  contact_name: "Sklep",
  contact_phone: "500100200",
  advertiser_type: "business",
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function client(handler: (url: string, init: RequestInit) => Response | Promise<Response>, tokens = [TOKEN]) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const asked: boolean[] = []
  const logs: string[] = []
  const api = new OlxClient({
    baseUrl: "https://olx.test",
    timeoutMs: 1000,
    clientSecret: SECRET,
    logger: { warn: (m) => logs.push(m), debug: (m) => logs.push(m) },
    token: async (force) => {
      asked.push(force)
      return tokens[force ? 1 : 0] ?? tokens[0]
    },
    sleep: async () => undefined,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return handler(url, init)
    }) as unknown as typeof fetch,
  })
  return { api, calls, asked, logs }
}

describe("OlxClient", () => {
  it("sends the token and the API version", async () => {
    const t = client(() => json(200, { data: { id: 1 } }))
    await t.api.me()
    const headers = t.calls[0].init.headers as Record<string, string>
    expect(t.calls[0].url).toBe("https://olx.test/api/partner/users/me")
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(headers.Version).toBe("2.0")
  })

  it("builds the advert body the way OLX takes it", () => {
    expect(advertBody(input, "olxad_1", {})).toEqual({
      title: "Marynarka wełniana vintage",
      description: "Opis",
      category_id: 9001,
      advertiser_type: "business",
      external_id: "olxad_1",
      contact: { name: "Sklep", phone: "500100200" },
      location: { city_id: 8001, district_id: 12 },
      images: [{ url: "https://cdn.example.com/a.jpg" }],
      price: { value: 399.5, currency: "PLN", negotiable: true, trade: false, budget: false },
      attributes: [{ code: "state", value: "used" }],
    })
    expect(advertBody(input, "x", { placed_before_2024: true }).product_safety_regulation).toEqual({
      placed_before_2024: true,
    })
  })

  it("never repeats a create, even after a server error", async () => {
    const t = client(() => json(503, {}))
    await expect(t.api.createAdvert(input, "olxad_1", {})).rejects.toThrow("HTTP 503")
    expect(t.calls).toHaveLength(1)
  })

  it("retries reads", async () => {
    let n = 0
    const t = client(() => (++n === 1 ? json(503, {}) : json(200, { data: [] })))
    await t.api.findByExternalId("olxad_1")
    expect(t.calls).toHaveLength(2)
  })

  it("after a 401 gets a new token and tries once more", async () => {
    let n = 0
    const t = client(
      () => (++n === 1 ? json(401, {}) : json(200, { data: { id: 5, status: "new" } })),
      [TOKEN, "fake-access-2"]
    )
    const advert = await t.api.createAdvert(input, "olxad_1", {})
    expect(advert.id).toBe(5)
    expect(t.asked).toEqual([false, true])
    expect((t.calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer fake-access-2")
  })

  it("turns OLX's validation answer into a readable refusal", async () => {
    const t = client(() =>
      json(400, {
        error: {
          status: 400,
          title: "Invalid request",
          detail: "Data validation error occurred",
          validation: [{ field: "title", title: "Musisz podać tytuł", detail: "Musisz podać tytuł" }],
        },
      })
    )
    const error = await t.api.createAdvert(input, "x", {}).catch((e) => e)
    expect(error).toBeInstanceOf(OlxRefusedError)
    expect(error.status).toBe(400)
    expect(error.message).toBe("Data validation error occurred: title: Musisz podać tytuł")
  })

  it("does not take a similar external id for this advert", async () => {
    const t = client(() => json(200, { data: [{ id: 1, status: "active", external_id: "olxad_12" }] }))
    expect(await t.api.findByExternalId("olxad_1")).toBeNull()
  })

  it("answers null for an advert that is gone", async () => {
    const t = client(() => json(404, { error: { status: 404, title: "Not found", detail: "Not found" } }))
    expect(await t.api.getAdvert("1")).toBeNull()
  })

  it("reads the change feed with the cursor", async () => {
    const t = client(() => json(200, { data: ["1", 2], hasMore: true, nextCursor: "abc" }))
    expect(await t.api.advertChanges("2026-11-21T12:00:00.000Z", "prev")).toEqual({
      ids: ["1", "2"],
      hasMore: true,
      nextCursor: "abc",
    })
    expect(t.calls[0].url).toContain("cursor=prev")
    expect(t.calls[0].url).toContain("since=2026-11-21T12%3A00%3A00.000Z")
  })

  it("never logs the token or the secret", async () => {
    const t = client(() => {
      throw new Error(`socket failed with ${TOKEN} and ${SECRET}`)
    })
    const error = await t.api.me().catch((e) => e)
    expect(error.message).not.toContain(TOKEN)
    expect(error.message).not.toContain(SECRET)
    expect(t.logs.join(" ")).not.toContain(TOKEN)
  })

  it("leaves price and delivery out of the form's attributes", () => {
    expect(
      formAttributes([
        { code: "price", label: "Cena", validation: { type: "price", required: true } },
        { code: "delivery.x", label: "Dostawa" },
        { code: "state", label: "Stan", validation: { type: "attribute", required: true }, values: [] },
      ]).map((row) => row.code)
    ).toEqual(["state"])
  })
})

describe("options", () => {
  const full = {
    clientId: "id",
    clientSecret: SECRET,
    redirectUri: "https://shop.example/hooks/olx/oauth/callback",
    encryptionKey: "k".repeat(32),
  }

  it("stays disabled without credentials, naming what is missing and no values", () => {
    expect(parseOptions({})).toEqual({
      enabled: false,
      reason: "missing options clientId, clientSecret, redirectUri, encryptionKey",
    })
  })

  it("needs no credentials in demo mode", () => {
    expect(parseOptions({ demo: true }).enabled).toBe(true)
  })

  it("refuses a redirect that is not https and a short key, without their values", () => {
    const http = parseOptions({ ...full, redirectUri: "http://shop.example/x" })
    expect(http).toMatchObject({ enabled: false })
    const short = parseOptions({ ...full, encryptionKey: "short-key-value" })
    expect(short.enabled).toBe(false)
    expect(JSON.stringify(short)).not.toContain("short-key-value")
  })

  it("returns to the admin of the redirect's backend", () => {
    const parsed = parseOptions(full)
    expect(parsed.enabled && adminReturnUrl(parsed.options)).toBe("https://shop.example/app/olx")
  })

  it("builds the consent address", () => {
    const parsed = parseOptions(full)
    const url = new URL(parsed.enabled ? authorizeUrl(parsed.options, "st4te") : "")
    expect(url.origin + url.pathname).toBe("https://www.olx.pl/oauth/authorize/")
    expect(url.searchParams.get("state")).toBe("st4te")
    expect(url.searchParams.get("scope")).toBe("v2 read write")
    expect(url.searchParams.get("response_type")).toBe("code")
  })
})

describe("tokens", () => {
  const parsed = parseOptions({
    clientId: "id",
    clientSecret: SECRET,
    redirectUri: "https://shop.example/cb",
    encryptionKey: "k".repeat(32),
    baseUrl: "https://olx.test",
  })
  if (!parsed.enabled) throw new Error("options")
  const options = parsed.options
  const logger = { warn: () => undefined }

  function store(overrides: Partial<Connection> = {}) {
    let row: Connection | null = {
      olx_user_id: "1",
      olx_user_name: "Sklep",
      is_business: true,
      access_token: "old-access",
      refresh_token: "old-refresh",
      access_expires_at: new Date(Date.now() + 3_600_000),
      needs_reconnect: false,
      last_error: null,
      ...overrides,
    }
    const saved: TokenSet[] = []
    const reasons: string[] = []
    return {
      saved,
      reasons,
      set: (next: Partial<Connection>) => {
        row = { ...row!, ...next }
      },
      api: {
        readConnection: async () => row,
        saveTokens: async (tokens: TokenSet) => {
          saved.push(tokens)
          row = { ...row!, ...tokens }
        },
        markNeedsReconnect: async (reason: string) => {
          reasons.push(reason)
          row = { ...row!, needs_reconnect: true }
        },
      },
    }
  }

  const fresh = () => json(200, { access_token: "new-access", refresh_token: "new-refresh", expires_in: 86400 })

  it("uses a valid token without asking OLX", async () => {
    const s = store()
    const fetchMock = jest.fn()
    expect(await new OlxTokens(options, s.api, logger, fetchMock as never).accessToken()).toBe("old-access")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("refreshes an expiring token and keeps OLX's new refresh token", async () => {
    const s = store({ access_expires_at: new Date(Date.now() + 1000) })
    const fetchMock = jest.fn(async () => fresh())
    expect(await new OlxTokens(options, s.api, logger, fetchMock as never).accessToken()).toBe("new-access")
    expect(s.saved[0].refresh_token).toBe("new-refresh")
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ grant_type: "refresh_token", refresh_token: "old-refresh" })
  })

  it("spends a refresh token once when many requests need it", async () => {
    const s = store({ access_expires_at: new Date(Date.now() + 1000) })
    const fetchMock = jest.fn(async () => fresh())
    const tokens = new OlxTokens(options, s.api, logger, fetchMock as never)
    await Promise.all([tokens.accessToken(), tokens.accessToken(), tokens.accessToken()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("asks to connect again when OLX refuses the refresh token", async () => {
    const s = store({ access_expires_at: new Date(Date.now() + 1000) })
    const fetchMock = jest.fn(async () => json(400, { error: "invalid_grant" }))
    await expect(new OlxTokens(options, s.api, logger, fetchMock as never).accessToken()).rejects.toBeInstanceOf(
      OlxReconnectError
    )
    expect(s.reasons).toHaveLength(1)
  })

  it("uses the tokens of another instance that refreshed first", async () => {
    const s = store({ access_expires_at: new Date(Date.now() + 1000) })
    const fetchMock = jest.fn(async () => {
      s.set({ access_token: "from-other", refresh_token: "other-refresh" })
      return json(400, { error: "invalid_grant" })
    })
    expect(await new OlxTokens(options, s.api, logger, fetchMock as never).accessToken()).toBe("from-other")
    expect(s.reasons).toHaveLength(0)
  })

  it("a network failure does not end the connection", async () => {
    const s = store({ access_expires_at: new Date(Date.now() + 1000) })
    const fetchMock = jest.fn(async () => {
      throw new Error("offline")
    })
    await expect(new OlxTokens(options, s.api, logger, fetchMock as never).accessToken()).rejects.toThrow("offline")
    expect(s.reasons).toHaveLength(0)
  })

  it("exchanges the code with the redirect address", async () => {
    const fetchMock = jest.fn(async () => fresh())
    const tokens = await exchangeCode(options, logger, "the-code-value", fetchMock as never)
    expect(tokens.access_token).toBe("new-access")
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://olx.test/api/open/oauth/token")
    expect(JSON.parse(init.body as string)).toMatchObject({
      grant_type: "authorization_code",
      code: "the-code-value",
      redirect_uri: "https://shop.example/cb",
    })
  })
})
