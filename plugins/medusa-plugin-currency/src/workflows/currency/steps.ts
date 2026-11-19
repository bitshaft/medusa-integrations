import type { IPricingModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { CURRENCY_MODULE } from "../../modules/currency"
import type CurrencyModuleService from "../../modules/currency/service"

/** One price to write, exactly as the preview showed it. */
export type FillWrite = {
  key: string
  action: "add" | "overwrite"
  variant_id: string
  product_id: string
  price_set_id: string
  currency_code: string
  price_list_id: string | null
  region_id: string | null
  min_quantity: string | null
  max_quantity: string | null
  /** The existing price for `overwrite`. */
  price_id: string | null
  previous_amount: string | null
  amount: string
  base_amount: string
  mode: string
  rate: string
  margin: string
  table_no: string | null
  rate_date: string | null
}

export type WrittenPrice = FillWrite & { price_id: string }

type Row = Record<string, any>

const quantity = (value: string | null) => (value === null ? null : Number(value))

const sameSlot = (price: Row, write: FillWrite) =>
  String(price.currency_code).toLowerCase() === write.currency_code &&
  (price.price_list_id ?? null) === write.price_list_id &&
  (((price.price_rules ?? []) as Row[]).find((rule) => rule.attribute === "region_id")?.value ?? null) ===
    write.region_id &&
  ((price.price_rules ?? []) as Row[]).every((rule) => rule.attribute === "region_id") &&
  (price.min_quantity === null || price.min_quantity === undefined ? null : String(price.min_quantity)) ===
    write.min_quantity &&
  (price.max_quantity === null || price.max_quantity === undefined ? null : String(price.max_quantity)) ===
    write.max_quantity

type Compensation = {
  created: string[]
  restored: Array<{
    id: string
    amount: string
    price_set_id: string
    price_list_id: string | null
    region_id: string | null
    currency_code: string
  }>
}

async function writeAmounts(pricing: IPricingModuleService, writes: Array<FillWrite & { price_id?: string | null }>) {
  const plain = writes.filter((write) => !write.price_list_id)
  const listed = writes.filter((write) => write.price_list_id)

  if (plain.length) {
    const bySet = new Map<string, FillWrite[]>()
    for (const write of plain) bySet.set(write.price_set_id, [...(bySet.get(write.price_set_id) ?? []), write])
    await pricing.addPrices(
      [...bySet].map(([priceSetId, items]) => ({
        priceSetId,
        prices: items.map((write) => ({
          ...(write.price_id ? { id: write.price_id } : {}),
          currency_code: write.currency_code,
          amount: write.amount,
          rules: write.region_id ? { region_id: write.region_id } : {},
          min_quantity: quantity(write.min_quantity),
          max_quantity: quantity(write.max_quantity),
        })),
      })) as never
    )
  }

  const byList = (items: FillWrite[]) => {
    const map = new Map<string, FillWrite[]>()
    for (const write of items) map.set(write.price_list_id!, [...(map.get(write.price_list_id!) ?? []), write])
    return [...map]
  }
  const listAdds = listed.filter((write) => !write.price_id)
  const listUpdates = listed.filter((write) => write.price_id)
  if (listAdds.length) {
    await pricing.addPriceListPrices(
      byList(listAdds).map(([price_list_id, items]) => ({
        price_list_id,
        prices: items.map((write) => ({
          currency_code: write.currency_code,
          amount: write.amount,
          price_set_id: write.price_set_id,
          rules: write.region_id ? { region_id: write.region_id } : {},
          min_quantity: quantity(write.min_quantity),
          max_quantity: quantity(write.max_quantity),
        })),
      })) as never
    )
  }
  if (listUpdates.length) {
    await pricing.updatePriceListPrices(
      byList(listUpdates).map(([price_list_id, items]) => ({
        price_list_id,
        prices: items.map((write) => ({
          id: write.price_id!,
          amount: write.amount,
          price_set_id: write.price_set_id,
          currency_code: write.currency_code,
        })),
      })) as never
    )
  }
}

/**
 * Writes the prices of a fill through Medusa's Pricing module (so its
 * `pricing.price.*` events fire as for any admin change). New prices are
 * removed and overwritten ones restored if a later step fails.
 */
export const currencyWritePricesStep = createStep(
  "currency-write-prices",
  async (input: { writes: FillWrite[]; demo: boolean }, { container }) => {
    if (input.demo || !input.writes.length) {
      return new StepResponse({ written: [] as WrittenPrice[] }, { created: [], restored: [] } as Compensation)
    }
    const pricing = container.resolve<IPricingModuleService>(Modules.PRICING)
    const compensation: Compensation = {
      created: [],
      restored: input.writes
        .filter((write) => write.action === "overwrite" && write.price_id && write.previous_amount !== null)
        .map((write) => ({
          id: write.price_id!,
          amount: write.previous_amount!,
          price_set_id: write.price_set_id,
          price_list_id: write.price_list_id,
          region_id: write.region_id,
          currency_code: write.currency_code,
        })),
    }

    try {
      await writeAmounts(pricing, input.writes)
    } catch (error) {
      // Whatever got created before the failure is found and removed by the compensation below.
      await rollback(pricing, input.writes, compensation)
      throw error
    }

    // The ids of the new prices: the price in the same slot.
    const prices = (await pricing.listPrices(
      {
        price_set_id: [...new Set(input.writes.map((write) => write.price_set_id))],
        currency_code: [...new Set(input.writes.map((write) => write.currency_code))],
      } as never,
      { relations: ["price_rules"], take: 100_000 }
    )) as Row[]
    const written: WrittenPrice[] = input.writes.map((write) => {
      const price = write.price_id
        ? { id: write.price_id }
        : prices.find((row) => row.price_set_id === write.price_set_id && sameSlot(row, write))
      return { ...write, price_id: price?.id ?? "" }
    })
    compensation.created = written.filter((write) => write.action === "add" && write.price_id).map((w) => w.price_id)
    return new StepResponse({ written: written.filter((write) => write.price_id) }, compensation)
  },
  async (compensation, { container }) => {
    if (!compensation) return
    const pricing = container.resolve<IPricingModuleService>(Modules.PRICING)
    await rollback(pricing, [], compensation)
  }
)

async function rollback(pricing: IPricingModuleService, writes: FillWrite[], compensation: Compensation) {
  const created = new Set(compensation.created)
  if (writes.length) {
    // After a failed write: find prices that did get created.
    const prices = (await pricing.listPrices(
      {
        price_set_id: [...new Set(writes.map((write) => write.price_set_id))],
        currency_code: [...new Set(writes.map((write) => write.currency_code))],
      } as never,
      { relations: ["price_rules"], take: 100_000 }
    )) as Row[]
    for (const write of writes.filter((w) => w.action === "add")) {
      const price = prices.find((row) => row.price_set_id === write.price_set_id && sameSlot(row, write))
      if (price) created.add(price.id)
    }
  }
  if (created.size) await pricing.removePrices([...created])
  if (compensation.restored.length) {
    await writeAmounts(
      pricing,
      compensation.restored.map((price) => ({
        key: price.id,
        action: "overwrite",
        variant_id: "",
        product_id: "",
        price_set_id: price.price_set_id,
        currency_code: price.currency_code,
        price_list_id: price.price_list_id,
        region_id: price.region_id,
        min_quantity: null,
        max_quantity: null,
        price_id: price.id,
        previous_amount: null,
        amount: price.amount,
        base_amount: "",
        mode: "",
        rate: "",
        margin: "",
        table_no: null,
        rate_date: null,
      }))
    )
  }
}

export type RunRecord = {
  actor_id: string | null
  actor_name: string | null
  demo: boolean
  base_currency: string
  scope: Record<string, unknown>
  run_options: Record<string, unknown>
  rates: Record<string, unknown>
  added: number
  overwritten: number
  skipped: number
  skipped_by: Record<string, number>
  products: Array<{ id: string; title: string }>
}

/** The history entry and one record per written price (the "filled on … at …" note). */
export const currencyRecordRunStep = createStep(
  "currency-record-run",
  async (input: { run: RunRecord; written: WrittenPrice[] }, { container }) => {
    const service = container.resolve<CurrencyModuleService>(CURRENCY_MODULE)
    const run = await service.createCurrencyFillRuns(input.run as never)
    if (input.written.length) {
      await service.createCurrencyFilledPrices(
        input.written.map((write) => ({
          price_id: write.price_id,
          run_id: run.id,
          variant_id: write.variant_id,
          product_id: write.product_id,
          currency_code: write.currency_code,
          price_list_id: write.price_list_id,
          region_id: write.region_id,
          action: write.action,
          amount: write.amount,
          previous_amount: write.previous_amount,
          base_amount: write.base_amount,
          mode: write.mode,
          rate: write.rate,
          margin: write.margin,
          table_no: write.table_no,
          rate_date: write.rate_date,
        }))
      )
    }
    return new StepResponse({ id: run.id as string, created_at: String(run.created_at) }, run.id as string)
  },
  async (runId, { container }) => {
    if (!runId) return
    const service = container.resolve<CurrencyModuleService>(CURRENCY_MODULE)
    const records = await service.listCurrencyFilledPrices({ run_id: runId }, { select: ["id"], take: 100_000 })
    if (records.length) await service.deleteCurrencyFilledPrices(records.map((record) => record.id))
    await service.deleteCurrencyFillRuns(runId)
  }
)
