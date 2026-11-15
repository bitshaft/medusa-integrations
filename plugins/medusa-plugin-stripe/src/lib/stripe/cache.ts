/**
 * Answers from Stripe, kept for `ttlMs`, with in-flight sharing: while one
 * request for a key is running, every other caller waits for the same
 * promise, so several admins at once cause one request to Stripe.
 * Failures are not cached.
 */
export class ResponseCache {
  private readonly values = new Map<string, { at: number; value: unknown }>()
  private readonly inflight = new Map<string, Promise<unknown>>()

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now
  ) {}

  async get<T>(key: string, load: () => Promise<T>, options: { fresh?: boolean } = {}): Promise<T> {
    const cached = this.values.get(key)
    if (!options.fresh && cached && this.now() - cached.at < this.ttlMs) return cached.value as T
    const running = this.inflight.get(key)
    if (running) return running as Promise<T>
    const promise = load()
      .then((value) => {
        if (this.ttlMs > 0) this.values.set(key, { at: this.now(), value })
        return value
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, promise)
    return promise
  }

  /** Forgets every key that contains `fragment` (all keys without one). */
  invalidate(fragment?: string): number {
    let removed = 0
    for (const key of [...this.values.keys()]) {
      if (!fragment || key.includes(fragment)) {
        this.values.delete(key)
        removed++
      }
    }
    return removed
  }

  get size(): number {
    return this.values.size
  }
}
