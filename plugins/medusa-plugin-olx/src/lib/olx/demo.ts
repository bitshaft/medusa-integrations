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
import type { AdvertInput } from "./types"

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

type DemoAdvert = OlxAdvert & { id: string; status: string; external_id: string }

const in30Days = () => new Date(Date.now() + 30 * 86_400_000).toISOString()

/** An OLX that lives in memory: moderation passes on the next read. Nothing leaves the store. */
export class DemoOlxApi implements OlxApi {
  private readonly adverts = new Map<string, DemoAdvert>()
  private next = 100_000

  async me(): Promise<OlxUser> {
    return { id: "demo", name: "Demo account", is_business: true }
  }

  async createAdvert(_input: AdvertInput, externalId: string): Promise<OlxAdvert> {
    const id = String(this.next++)
    const advert: DemoAdvert = {
      id,
      status: "new",
      url: `https://www.olx.pl/d/oferta/demo-${id}.html`,
      valid_to: in30Days(),
      external_id: externalId,
    }
    this.adverts.set(id, advert)
    return { ...advert }
  }

  async updateAdvert(id: string): Promise<OlxAdvert> {
    return (await this.getAdvert(id)) ?? { id, status: "removed_by_user" }
  }

  async getAdvert(id: string): Promise<OlxAdvert | null> {
    const advert = this.adverts.get(id)
    if (!advert) {
      return null
    }
    if (advert.status === "new") {
      advert.status = "active"
    }
    return { ...advert }
  }

  async findByExternalId(externalId: string): Promise<OlxAdvert | null> {
    return [...this.adverts.values()].find((advert) => advert.external_id === externalId) ?? null
  }

  async command(id: string, command: OlxCommand): Promise<void> {
    const advert = this.adverts.get(id)
    if (advert) {
      advert.status = command.command === "activate" ? "active" : "removed_by_user"
      if (command.command === "activate") advert.valid_to = in30Days()
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

  reset(): void {
    this.adverts.clear()
  }
}
