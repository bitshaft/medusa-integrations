/**
 * Exchange rate sources. A source publishes tables; a table lists, for each
 * currency, how much of the table's own base currency one unit is worth.
 * The rest of the plugin only sees `RateTable`, so another source (the ECB,
 * a bank) is one more `RateProvider` registered in `rates/index.ts`.
 */

export type RateTable = {
  /** The source's id, e.g. "nbp". */
  provider: string
  /** The table's number as published, e.g. "225/A/NBP/2026". */
  table: string
  /** The day the table applies to, `YYYY-MM-DD`. */
  date: string
  /** The currency the rates are quoted in, uppercase ("PLN"). */
  base: string
  /** Uppercase code → base units per one unit, as a decimal string ("4.4165"). */
  rates: Record<string, string>
}

export interface RateProvider {
  readonly id: string
  /** Name shown in the admin ("NBP, table A"). */
  readonly label: string
  /** The newest published table. */
  latest(): Promise<RateTable>
  /**
   * The table in effect on a day: the last one published on or before it
   * (there is none on weekends and holidays).
   */
  on(date: string): Promise<RateTable>
  /** When a table newer than this one can be expected; until then the saved one is current. */
  nextExpected(table: RateTable): Date
}

/** The rate source could not be reached or answered with nothing usable. */
export class RateSourceError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "no_data" | "invalid" = "unavailable"
  ) {
    super(message)
    this.name = "RateSourceError"
  }
}
