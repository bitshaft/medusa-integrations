import { HttpClient, HttpNetworkError, HttpStatusError, HttpTimeoutError } from "../http"

const SECRET = "very-secret-key"

function response(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
  })
}

function client(fetchImpl: jest.Mock, extra: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}) {
  return new HttpClient({
    baseUrl: "https://api.example.test/",
    fetch: fetchImpl as unknown as typeof fetch,
    sleep: async () => undefined,
    secrets: [SECRET],
    ...extra,
  })
}

describe("HttpClient", () => {
  it("parses JSON from a 2xx response", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, { ok: true }))
    await expect(client(fetchImpl).request({ path: "ping", idempotent: true })).resolves.toEqual({ ok: true })
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.example.test/ping")
  })

  it("retries idempotent calls on 5xx and network errors", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(503, "busy"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(response(200, { ok: 1 }))
    await expect(client(fetchImpl).request({ path: "x", idempotent: true })).resolves.toEqual({ ok: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("never retries writes", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(503, "busy"))
    await expect(
      client(fetchImpl).request({
        path: "x",
        method: "POST",
        idempotent: false,
      })
    ).rejects.toBeInstanceOf(HttpStatusError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("does not retry 4xx", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(400, "bad"))
    await expect(client(fetchImpl).request({ path: "x", idempotent: true })).rejects.toMatchObject({ status: 400 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("honours a custom retryOn rule thrown from parse", async () => {
    class Busy extends Error {}
    const fetchImpl = jest.fn().mockImplementation(async () => response(200, { status: "busy" }))
    const http = client(fetchImpl, {
      maxRetries: 1,
      retryOn: (error) => error instanceof Busy,
    })
    await expect(
      http.request({
        path: "x",
        idempotent: true,
        parse: () => {
          throw new Busy("busy")
        },
      })
    ).rejects.toBeInstanceOf(Busy)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("times out", async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))
    )
    const error = await client(fetchImpl as unknown as jest.Mock, {
      timeoutMs: 5,
      maxRetries: 0,
    })
      .request<never>({ path: "slow", idempotent: true })
      .catch((e: Error & { body?: string }) => e)
    expect(error).toBeInstanceOf(HttpTimeoutError)
    expect(error).toBeInstanceOf(HttpNetworkError)
  })

  it("masks secrets in logs and error messages", async () => {
    const warn = jest.fn()
    const debug = jest.fn()
    const fetchImpl = jest.fn().mockRejectedValue(new Error(`refused for key=${SECRET}`))
    const error = await client(fetchImpl, {
      maxRetries: 1,
      logger: { warn, debug },
    })
      .request<never>({ path: "x", idempotent: true })
      .catch((e: Error & { body?: string }) => e)

    expect(error.message).not.toContain(SECRET)
    expect(error.message).toContain("****")
    expect(warn.mock.calls.flat().join(" ")).not.toContain(SECRET)
  })

  it("masks secrets in error bodies", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(401, `{"echo":"${SECRET}"}`))
    const error = await client(fetchImpl)
      .request<never>({ path: "x", idempotent: false })
      .catch((e: Error & { body?: string }) => e)
    expect(error.body).not.toContain(SECRET)
  })
})
