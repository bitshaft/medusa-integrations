import type {
  OlxAdvert,
  OlxApi,
  OlxAttribute,
  OlxCategorySuggestion,
  OlxCity,
  OlxCommand,
  OlxDistrict,
  OlxPage,
  OlxUser,
} from "./client"
import type { AdvertInput, AdvertRecord } from "./types"

const CATEGORIES: OlxCategorySuggestion[] = [
  { id: 9001, name: "Jackets and suits", path: ["Fashion", "Men's clothing"] },
  { id: 9002, name: "Shirts", path: ["Fashion", "Men's clothing"] },
  { id: 9003, name: "Trousers", path: ["Fashion", "Men's clothing"] },
  { id: 9004, name: "Knitwear", path: ["Fashion", "Men's clothing"] },
  { id: 9005, name: "Other clothing", path: ["Fashion"] },
]

const ATTRIBUTES: OlxAttribute[] = [
  {
    code: "state",
    label: "Condition",
    unit: null,
    required: true,
    numeric: false,
    multiple: false,
    values: [
      { code: "new", label: "New" },
      { code: "used", label: "Used" },
    ],
  },
  {
    code: "size",
    label: "Size",
    unit: null,
    required: true,
    numeric: false,
    multiple: false,
    values: ["S", "M", "L", "XL"].map((size) => ({ code: size.toLowerCase(), label: size })),
  },
]

const CITIES: OlxCity[] = [
  { id: 8001, name: "Warszawa", county: "Warszawa" },
  { id: 8002, name: "Kraków", county: "Kraków" },
  { id: 8003, name: "Wrocław", county: "Wrocław" },
  { id: 8004, name: "Poznań", county: "Poznań" },
  { id: 8005, name: "Gdańsk", county: "Gdańsk" },
]

const in30Days = () => new Date(Date.now() + 30 * 86_400_000)

/** Sample adverts on no real product use these ids; stock is not checked for them. */
export const previewVariantId = (key: string) => `demo_variant_${key}`
export const previewProductId = (key: string) => `demo_product_${key}`
export const isPreviewVariant = (id: string) => id.startsWith("demo_variant_")

/** The "OLX id" of a demo advert: derived from its row, so it never repeats. */
export const demoOlxId = (rowId: string) => `demo-${rowId}`

export type DemoStore = {
  getRecord(id: string): Promise<AdvertRecord | null>
  findByOlxId(olxId: string): Promise<AdvertRecord | null>
  patchRecord(id: string, patch: Partial<AdvertRecord>): Promise<AdvertRecord>
}

const toOlx = (row: AdvertRecord): OlxAdvert => ({
  id: row.olx_advert_id ?? demoOlxId(row.id),
  status: row.status,
  // No link: there is no such page on OLX.
  url: null,
  valid_to: row.valid_to?.toISOString() ?? null,
  external_id: row.id,
  title: row.payload.title,
  description: row.payload.description,
  price: { value: row.payload.price },
})

/**
 * A simulated OLX whose state is the demo adverts in the database, so it
 * survives a restart. Moderation passes on the next read. Nothing leaves the
 * store.
 */
export class DemoOlxApi implements OlxApi {
  constructor(private readonly store: DemoStore) {}

  async me(): Promise<OlxUser> {
    return { id: "demo", name: "Demo account", is_business: true }
  }

  async createAdvert(_input: AdvertInput, externalId: string): Promise<OlxAdvert> {
    return {
      id: demoOlxId(externalId),
      status: "new",
      url: null,
      valid_to: in30Days().toISOString(),
      external_id: externalId,
    }
  }

  async updateAdvert(id: string): Promise<OlxAdvert> {
    return (await this.getAdvert(id)) ?? { id, status: "removed_by_user" }
  }

  async getAdvert(id: string): Promise<OlxAdvert | null> {
    const row = await this.store.findByOlxId(id)
    if (!row) {
      return null
    }
    const advert = toOlx(row)
    return advert.status === "new" ? { ...advert, status: "active" } : advert
  }

  async findByExternalId(externalId: string): Promise<OlxAdvert | null> {
    const row = await this.store.getRecord(externalId)
    return row?.olx_advert_id ? toOlx(row) : null
  }

  async command(id: string, command: OlxCommand): Promise<void> {
    const row = await this.store.findByOlxId(id)
    if (row) {
      await this.store.patchRecord(
        row.id,
        command.command === "activate"
          ? { status: "active", valid_to: in30Days(), last_error: null }
          : { status: "removed_by_user" }
      )
    }
  }

  async suggestCategories(q: string): Promise<OlxCategorySuggestion[]> {
    const text = q.toLowerCase()
    const hits = CATEGORIES.filter((category) => text.includes(category.name.toLowerCase().slice(0, 5)))
    return hits.length ? hits : CATEGORIES
  }

  async categoryAttributes(): Promise<OlxAttribute[]> {
    return ATTRIBUTES
  }

  async cities(): Promise<OlxCity[]> {
    return CITIES
  }

  async districts(): Promise<OlxDistrict[]> {
    return []
  }

  async advertChanges(): Promise<OlxPage> {
    return { ids: [], hasMore: false, nextCursor: null }
  }
}
