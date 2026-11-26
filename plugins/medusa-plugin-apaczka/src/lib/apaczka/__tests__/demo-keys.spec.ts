import { inspect } from "node:util"

import { GET as listPoints } from "../../../api/admin/apaczka/points/route"
import { GET as listServices } from "../../../api/admin/apaczka/services/route"
import { GET as getStatus } from "../../../api/admin/apaczka/status/route"
import ApaczkaModuleService from "../../../modules/apaczka/service"
import { ApaczkaFulfillmentProviderService } from "../../../providers/apaczka/service"
import { APP_ID, APP_SECRET } from "./fixtures"
import { useMemoryPointStore } from "./memory-point-store"

/**
 * Demo mode with `livePoints` gets real keys, but only the points request
 * may use them. Nothing the plugin keeps or returns may contain them: one
 * logged object or one response would leak a key that can't be limited.
 */
const LIVE_DEMO = { demo: true, livePoints: true, appId: APP_ID, appSecret: APP_SECRET }

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }

/** Everything a log line could print from the object. */
const printed = (value: unknown) => inspect(value, { depth: Infinity, showHidden: true })

function call(handler: (req: never, res: never) => Promise<unknown>, apaczka: ApaczkaModuleService) {
  const res = { json: jest.fn(), status: jest.fn() }
  res.status.mockReturnValue(res)
  return handler({ scope: { resolve: () => apaczka }, query: {} } as never, res as never).then(() => res.json)
}

describe("keys in demo mode with livePoints", () => {
  beforeEach(() => useMemoryPointStore())
  afterEach(() => jest.restoreAllMocks())

  it("are kept only as placeholders by the module and the fulfillment provider", async () => {
    const apaczka = new ApaczkaModuleService({ logger } as never, LIVE_DEMO)
    expect(await apaczka.getOptions()).toMatchObject({ appId: "demo", appSecret: "demo" })
    expect(printed(apaczka)).not.toContain(APP_SECRET)

    const provider = new ApaczkaFulfillmentProviderService({ logger } as never, LIVE_DEMO)
    expect(printed(provider)).not.toContain(APP_SECRET)
  })

  it("never appear in admin responses", async () => {
    const apaczka = new ApaczkaModuleService({ logger } as never, LIVE_DEMO)
    for (const handler of [getStatus, listServices, listPoints]) {
      const json = await call(handler, apaczka)
      expect(json).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(json.mock.calls)).not.toContain(APP_SECRET)
    }
  })
})
