/** Total time allowed for one page of data; parts that did not finish in time are left out. */
export const DEFAULT_BUDGET_MS = 25_000

export class Budget {
  readonly startedAt: number
  /** Names of the parts that were cut short. */
  readonly missed: string[] = []

  constructor(
    readonly ms: number = DEFAULT_BUDGET_MS,
    private readonly now: () => number = Date.now
  ) {
    this.startedAt = now()
  }

  remaining(): number {
    return Math.max(0, this.ms - (this.now() - this.startedAt))
  }

  get expired(): boolean {
    return this.remaining() === 0
  }

  /**
   * Runs `task` within the remaining time. When time runs out (or the task
   * fails with a timeout) the part is recorded as missed and `fallback` is
   * returned, so the page still shows what it has.
   */
  async run<T>(part: string, task: () => Promise<T>, fallback: T): Promise<T> {
    const left = this.remaining()
    if (left === 0) {
      this.missed.push(part)
      return fallback
    }
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), left)
    })
    try {
      const result = await Promise.race([task(), timeout])
      if (result === TIMED_OUT) {
        this.missed.push(part)
        return fallback
      }
      return result as T
    } finally {
      clearTimeout(timer)
    }
  }

  get partial(): boolean {
    return this.missed.length > 0
  }
}

const TIMED_OUT = Symbol("timed out")
