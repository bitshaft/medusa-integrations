import type { Budget } from "./budget"
import { ResponseCache } from "./cache"
import { encodeQuery, type Query, StripeReadClient } from "./client"

/** At most this many items are read for one list (10 pages of 100). */
export const LIST_LIMIT = 1000

export type ListResult<T> = {
  data: T[]
  /** More items exist than were read: totals built from `data` are incomplete. */
  truncated: boolean
}

type StripeList<T> = { data: T[]; has_more: boolean }

/**
 * Reads Stripe through the read-only client and a shared cache. Nothing
 * runs in the background: every read is caused by someone opening a page
 * or pressing Refresh.
 */
export class StripeReader {
  constructor(
    readonly client: StripeReadClient,
    readonly cache: ResponseCache
  ) {}

  get<T = Record<string, any>>(path: string, query: Query = {}, options: { fresh?: boolean } = {}): Promise<T> {
    return this.cache.get(`${path}${encodeQuery(query)}`, () => this.client.get<T>(path, query), options)
  }

  /** Every page of a list, up to `max` items, stopping early when the budget runs out. */
  async list<T extends Record<string, any> = Record<string, any>>(
    path: string,
    query: Query = {},
    options: { max?: number; fresh?: boolean; budget?: Budget } = {}
  ): Promise<ListResult<T>> {
    const max = options.max ?? LIST_LIMIT
    const data: T[] = []
    let startingAfter: string | undefined
    for (;;) {
      if (options.budget?.expired) return { data, truncated: true }
      const page = await this.get<StripeList<T>>(
        path,
        { ...query, limit: Math.min(100, max - data.length), starting_after: startingAfter },
        { fresh: options.fresh }
      )
      data.push(...page.data)
      if (!page.has_more || !page.data.length) return { data, truncated: false }
      if (data.length >= max) return { data, truncated: true }
      startingAfter = String(page.data[page.data.length - 1].id)
    }
  }
}
