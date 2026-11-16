import apaczkaFulfillmentChanged from "../../../subscribers/apaczka-fulfillment-changed"

const run = { sync: jest.fn(), create: jest.fn() }
const loadShipmentContext = jest.fn()

jest.mock("../../../workflows/apaczka/sync-apaczka-shipment-record", () => ({
  syncApaczkaShipmentRecordWorkflow: () => ({ run: run.sync }),
}))
jest.mock("../../../workflows/apaczka/create-apaczka-shipment", () => ({
  createApaczkaShipmentWorkflow: () => ({ run: run.create }),
}))
jest.mock("../../../workflows/apaczka/steps/load-shipment-context", () => ({
  loadShipmentContext: (...args: unknown[]) => loadShipmentContext(...args),
}))

function setup(hold: boolean, weight: number | null) {
  const update = jest.fn().mockResolvedValue(undefined)
  const apaczka = {
    isEnabled: async () => true,
    getSettings: async () => ({ hold_without_weight: hold }),
    updateApaczkaShipments: update,
  }
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const container = { resolve: (key: string) => (key === "apaczka" ? apaczka : logger) }
  run.sync.mockResolvedValue({
    result: {
      shipment: { id: "apzshp_1", status: "pending" },
      snapshot: { state: { state: "pending", auto_create: true }, canceled: false },
    },
  })
  run.create.mockResolvedValue({ result: {} })
  loadShipmentContext.mockResolvedValue({ items: [{ title: "Talerz", quantity: 1, variant: { weight } }] })
  return {
    update,
    call: () =>
      apaczkaFulfillmentChanged({
        event: { name: "order.fulfillment_created", data: { order_id: "order_1", fulfillment_id: "ful_1" } },
        container,
      } as never),
  }
}

describe("apaczka-fulfillment-changed: products without a weight", () => {
  beforeEach(() => jest.clearAllMocks())

  it("holds the shipment, with the reason, when the setting is on", async () => {
    const { update, call } = setup(true, null)
    await call()
    expect(run.create).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({ id: "apzshp_1", error: "missing_weight" })
  })

  it("creates it with the default weight when the setting is off", async () => {
    const { update, call } = setup(false, null)
    await call()
    expect(run.create).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
  })

  it("creates it when every product has a weight, setting on or off", async () => {
    const { call } = setup(true, 400)
    await call()
    expect(run.create).toHaveBeenCalledTimes(1)
  })
})
