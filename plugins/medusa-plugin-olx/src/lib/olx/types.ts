/** One attribute of an advert, as OLX takes it. */
export type AdvertAttribute = { code: string; value?: string; values?: string[] }

export type SafetyParty = { name?: string; country?: string; address?: string; email?: string }

/** Product safety data, which OLX requires in some categories. */
export type ProductSafety = {
  placed_before_2024?: boolean
  manufacturer?: SafetyParty
  warning_and_safety?: string
}

/** What the admin decides about one advert. Saved with it, so edits start from what OLX has. */
export type AdvertInput = {
  title: string
  description: string
  /** In PLN, e.g. `"199.00"`. */
  price: string
  negotiable: boolean
  category_id: number
  attributes: AdvertAttribute[]
  images: string[]
  city_id: number
  district_id: number | null
  contact_name: string
  contact_phone: string | null
  advertiser_type: "private" | "business"
}

/** Visible to buyers, or about to be: what must come down when the item is gone. */
export const LIVE_STATUSES: readonly string[] = ["new", "active"]

export type SoldChannel = "store" | "olx"

export type AdvertRecord = {
  id: string
  variant_id: string
  product_id: string
  demo: boolean
  olx_advert_id: string | null
  /** OLX's status, or `publishing` / `failed` before OLX has the advert. */
  status: string
  url: string | null
  valid_to: Date | null
  title: string
  price: string
  payload: AdvertInput
  last_error: string | null
  pending_deactivate: boolean
  pending_success: boolean
  sold_channel: SoldChannel | null
  sold_at: Date | null
  claimed_at: Date | null
  write_started_at: Date | null
  synced_at: Date | null
  created_at?: Date
}

export type Connection = {
  olx_user_id: string | null
  olx_user_name: string | null
  is_business: boolean
  access_token: string
  refresh_token: string
  access_expires_at: Date
  needs_reconnect: boolean
  last_error: string | null
}

export type StoreDefaults = {
  contact_name: string
  contact_phone: string
  city_id: number | null
  city_name: string
  district_id: number | null
  advertiser_type: "private" | "business"
  negotiable: boolean
  category_id: number | null
  category_name: string
  safety: ProductSafety
}

export const DEFAULT_SETTINGS: StoreDefaults = {
  contact_name: "",
  contact_phone: "",
  city_id: null,
  city_name: "",
  district_id: null,
  advertiser_type: "business",
  negotiable: false,
  category_id: null,
  category_name: "",
  safety: {},
}

export type SyncCursor = {
  since: string
  cursor: string | null
  last_success_at: string | null
  /** OLX adverts the feed named while they were being written: read again on the next sync. */
  retry_ids?: string[]
}
