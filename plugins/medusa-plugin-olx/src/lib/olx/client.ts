import { HttpClient, type HttpResponse, HttpStatusError } from "./kit/http"
import { buildUserAgent, readPackageVersion } from "./kit/package-info"
import type { KitLogger } from "./kit/secrets"
import { PACKAGE_NAME } from "./options"
import type { AdvertInput, ProductSafety } from "./types"

export type OlxAdvert = {
  id: number | string
  status: string
  url?: string | null
  valid_to?: string | null
  external_id?: string | null
}
export type OlxUser = { id: number | string; name?: string | null; is_business?: boolean }
export type OlxCategorySuggestion = { id: number; name: string; path: string[] }
export type OlxAttribute = {
  code: string
  label: string
  unit: string | null
  required: boolean
  numeric: boolean
  multiple: boolean
  values: Array<{ code: string; label: string }>
}
export type OlxCity = { id: number; name: string; county: string | null }
export type OlxDistrict = { id: number; name: string }
export type OlxPage = { ids: string[]; hasMore: boolean; nextCursor: string | null }
export type OlxCommand = { command: "activate" } | { command: "deactivate"; is_success: boolean }

/** Everything the plugin asks of OLX. The demo implements the same interface. */
export interface OlxApi {
  me(): Promise<OlxUser>
  createAdvert(input: AdvertInput, externalId: string, safety: ProductSafety): Promise<OlxAdvert>
  updateAdvert(id: string, input: AdvertInput, externalId: string, safety: ProductSafety): Promise<OlxAdvert>
  getAdvert(id: string): Promise<OlxAdvert | null>
  findByExternalId(externalId: string): Promise<OlxAdvert | null>
  command(id: string, command: OlxCommand): Promise<void>
  suggestCategories(q: string): Promise<OlxCategorySuggestion[]>
  categoryAttributes(id: number): Promise<OlxAttribute[]>
  cities(): Promise<OlxCity[]>
  districts(cityId: number): Promise<OlxDistrict[]>
  advertChanges(since: string, cursor: string | null): Promise<OlxPage>
}

/** OLX answered and refused: nothing was written, and what is wrong is in the message. */
export class OlxRefusedError extends Error {
  readonly status: number
  readonly fields: Array<{ field: string; detail: string }>

  constructor(status: number, message: string, fields: Array<{ field: string; detail: string }> = []) {
    super(message)
    this.name = "OlxRefusedError"
    this.status = status
    this.fields = fields
  }
}

/** Reads OLX's error body. HTTP 4xx means the request was refused; 5xx may still have been applied. */
export function toOlxError(error: unknown): unknown {
  if (!(error instanceof HttpStatusError) || error.status < 400 || error.status >= 500) {
    return error
  }
  let detail = `OLX refused the request (HTTP ${error.status})`
  let fields: Array<{ field: string; detail: string }> = []
  try {
    const parsed = JSON.parse(error.body) as {
      error?: {
        title?: string
        detail?: string
        validation?: Array<{ field?: string; title?: string; detail?: string }>
      }
    }
    const body = parsed.error
    if (body) {
      detail = body.detail || body.title || detail
      fields = (body.validation ?? []).map((row) => ({
        field: String(row.field ?? ""),
        detail: String(row.detail ?? row.title ?? ""),
      }))
    }
  } catch {
    // Not JSON (e.g. the CDN's block page): the status says enough.
  }
  const summary = fields.length ? `${detail}: ${fields.map((f) => `${f.field}: ${f.detail}`).join("; ")}` : detail
  return new OlxRefusedError(error.status, summary, fields)
}

/** OLX wraps most answers in `{ data }`, and the reference shows some without it. */
function unwrap<T>(value: unknown): T {
  return (value && typeof value === "object" && "data" in value ? (value as { data: unknown }).data : value) as T
}

/** The advert body OLX takes on create and update. */
export function advertBody(input: AdvertInput, externalId: string, safety: ProductSafety): Record<string, unknown> {
  const hasSafety = Object.keys(safety ?? {}).length > 0
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    category_id: input.category_id,
    advertiser_type: input.advertiser_type,
    external_id: externalId,
    contact: { name: input.contact_name.trim(), ...(input.contact_phone ? { phone: input.contact_phone } : {}) },
    location: { city_id: input.city_id, ...(input.district_id ? { district_id: input.district_id } : {}) },
    images: input.images.map((url) => ({ url })),
    price: { value: Number(input.price), currency: "PLN", negotiable: input.negotiable, trade: false, budget: false },
    attributes: input.attributes,
    ...(hasSafety ? { product_safety_regulation: safety } : {}),
  }
}

export type RawAttribute = {
  code: string
  label: string
  unit?: string | null
  validation?: {
    type?: string
    required?: boolean
    numeric?: boolean
    allow_multiple_values?: boolean
  }
  values?: Array<{ code: string; label: string }>
}

/** Attributes the advert form fills in: price is its own field, delivery is out of scope. */
export function formAttributes(raw: RawAttribute[]): OlxAttribute[] {
  return raw
    .filter((row) => row?.code && !row.code.startsWith("delivery."))
    .filter((row) => !["price", "salary"].includes(row.validation?.type ?? ""))
    .map((row) => ({
      code: row.code,
      label: row.label,
      unit: row.unit ?? null,
      required: Boolean(row.validation?.required),
      numeric: Boolean(row.validation?.numeric),
      multiple: Boolean(row.validation?.allow_multiple_values),
      values: row.values ?? [],
    }))
}

const PAGE = 1000
const MAX_CITY_PAGES = 30

export type OlxClientConfig = {
  baseUrl: string
  timeoutMs: number
  clientSecret?: string
  logger: KitLogger
  /** The current access token; `force` asks for a new one after OLX answered 401. */
  token: (force: boolean) => Promise<string>
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

/** The OLX Partner API, version 2.0. Only reads are retried; every write is sent once. */
export class OlxClient implements OlxApi {
  private http_: HttpClient | null = null
  private httpToken_: string | null = null

  constructor(private readonly config: OlxClientConfig) {}

  /** Built per token, so the token in use is always one of the masked secrets. */
  private http(token: string): HttpClient {
    if (!this.http_ || this.httpToken_ !== token) {
      this.http_ = new HttpClient({
        baseUrl: `${this.config.baseUrl.replace(/\/+$/, "")}/api/partner`,
        timeoutMs: this.config.timeoutMs,
        userAgent: buildUserAgent("medusa-plugin-olx", readPackageVersion(PACKAGE_NAME, __dirname)),
        logPrefix: "[olx]",
        logger: this.config.logger,
        secrets: [this.config.clientSecret, token],
        fetch: this.config.fetch,
        sleep: this.config.sleep,
      })
      this.httpToken_ = token
    }
    return this.http_
  }

  private async call<T>(request: {
    path: string
    method?: string
    body?: unknown
    idempotent: boolean
    parse?: (response: HttpResponse) => T
  }): Promise<T> {
    const send = async (force: boolean) => {
      const token = await this.config.token(force)
      return this.http(token).request<T>({
        path: request.path,
        method: request.method,
        idempotent: request.idempotent,
        parse: request.parse,
        headers: {
          Authorization: `Bearer ${token}`,
          Version: "2.0",
          Accept: "application/json",
          ...(request.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      })
    }
    try {
      return await send(false)
    } catch (error) {
      // A 401 is answered before anything is applied, so one more try is safe for writes too.
      if (error instanceof HttpStatusError && error.status === 401) {
        try {
          return await send(true)
        } catch (second) {
          throw toOlxError(second)
        }
      }
      throw toOlxError(error)
    }
  }

  async me(): Promise<OlxUser> {
    return unwrap<OlxUser>(await this.call({ path: "/users/me", idempotent: true }))
  }

  async createAdvert(input: AdvertInput, externalId: string, safety: ProductSafety): Promise<OlxAdvert> {
    const body = advertBody(input, externalId, safety)
    return unwrap<OlxAdvert>(await this.call({ path: "/adverts", method: "POST", body, idempotent: false }))
  }

  async updateAdvert(id: string, input: AdvertInput, externalId: string, safety: ProductSafety): Promise<OlxAdvert> {
    const body = advertBody(input, externalId, safety)
    const path = `/adverts/${encodeURIComponent(id)}`
    return unwrap<OlxAdvert>(await this.call({ path, method: "PUT", body, idempotent: false }))
  }

  async getAdvert(id: string): Promise<OlxAdvert | null> {
    try {
      return unwrap<OlxAdvert>(await this.call({ path: `/adverts/${encodeURIComponent(id)}`, idempotent: true }))
    } catch (error) {
      if (error instanceof OlxRefusedError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async findByExternalId(externalId: string): Promise<OlxAdvert | null> {
    const path = `/adverts?external_id=${encodeURIComponent(externalId)}&limit=2`
    const rows = unwrap<OlxAdvert[]>(await this.call({ path, idempotent: true })) ?? []
    return rows.find((row) => row.external_id === externalId) ?? null
  }

  async command(id: string, command: OlxCommand): Promise<void> {
    await this.call({
      path: `/adverts/${encodeURIComponent(id)}/commands`,
      method: "POST",
      body: command,
      idempotent: false,
    })
  }

  async suggestCategories(q: string): Promise<OlxCategorySuggestion[]> {
    const path = `/categories/suggestion?q=${encodeURIComponent(q)}`
    const rows =
      unwrap<Array<{ id: number; name: string; path?: Array<{ name: string }> }>>(
        await this.call({ path, idempotent: true })
      ) ?? []
    return rows.map((row) => ({ id: row.id, name: row.name, path: (row.path ?? []).map((part) => part.name) }))
  }

  async categoryAttributes(id: number): Promise<OlxAttribute[]> {
    const rows = unwrap<RawAttribute[]>(await this.call({ path: `/categories/${id}/attributes`, idempotent: true }))
    return formAttributes(rows ?? [])
  }

  async cities(): Promise<OlxCity[]> {
    const out: OlxCity[] = []
    for (let page = 0; page < MAX_CITY_PAGES; page++) {
      const path = `/cities?offset=${page * PAGE}&limit=${PAGE}`
      const rows =
        unwrap<Array<{ id: number; name: string; county?: string | null }>>(
          await this.call({ path, idempotent: true })
        ) ?? []
      out.push(...rows.map((row) => ({ id: row.id, name: row.name, county: row.county ?? null })))
      if (rows.length < PAGE) {
        break
      }
    }
    return out
  }

  async districts(cityId: number): Promise<OlxDistrict[]> {
    const rows =
      unwrap<Array<{ id: number; name?: string | null }>>(
        await this.call({ path: `/cities/${cityId}/districts`, idempotent: true })
      ) ?? []
    return rows.map((row) => ({ id: row.id, name: row.name ?? String(row.id) }))
  }

  async advertChanges(since: string, cursor: string | null): Promise<OlxPage> {
    const query = new URLSearchParams({ since, limit: "200", ...(cursor ? { cursor } : {}) })
    const page = await this.call<{ data?: Array<string | number>; hasMore?: boolean; nextCursor?: string | null }>({
      path: `/status/adverts?${query}`,
      idempotent: true,
    })
    return {
      ids: (page?.data ?? []).map(String),
      hasMore: Boolean(page?.hasMore),
      nextCursor: page?.nextCursor ?? null,
    }
  }
}
