import { Modules } from "@medusajs/framework/utils"
import { MedusaWorkflow } from "@medusajs/framework/workflows-sdk"

import {
  deliverEmail,
  type DeliveryInput,
  EMAILS_MODULE_KEY,
  EMAILS_SEND_WORKFLOW,
  emailsTemplateAvailable,
  unsubscribeHeaders,
} from "../deliver"
import { backInStockEmailTemplate } from "../emails-template"
import { pluginOptionsSchema } from "../options"

const options = (extra: Record<string, unknown> = {}) =>
  pluginOptionsSchema.parse({ backendUrl: "https://api.shop.test", from: "Shop <orders@shop.test>", ...extra })

const input: DeliveryInput = {
  to: "anna@example.com",
  dedupe_key: "back-in-stock:binot_1",
  demo: false,
  customer_id: "cus_1",
  subscription_id: "bisub_1",
  one_click_unsubscribe: true,
  view: {
    kind: "restock",
    locale: "pl",
    store_name: "Sklep",
    product_title: "Bluza",
    variant_title: "M",
    product_label: "Bluza · M",
    thumbnail: null,
    action_url: "https://shop.test/pl/products/bluza",
    unsubscribe_url: "https://api.shop.test/hooks/back-in-stock/unsubscribe/abc",
  },
}

function container(config: { emails?: { enabled: boolean; templates: Record<string, unknown> }; notify?: jest.Mock }) {
  const createNotifications = config.notify ?? jest.fn(async () => ({ id: "noti_1" }))
  const registrations: Record<string, unknown> = { [Modules.NOTIFICATION]: { createNotifications } }
  if (config.emails) {
    registrations[EMAILS_MODULE_KEY] = {
      isEnabled: async () => config.emails!.enabled,
      getOptions: async () => ({ templates: config.emails!.templates }),
    }
  }
  return {
    createNotifications,
    container: {
      resolve: (key: string) => {
        if (!(key in registrations)) {
          throw new Error(`Could not resolve '${key}'`)
        }
        return registrations[key]
      },
    } as never,
  }
}

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) as never

describe("deliverEmail", () => {
  let getWorkflow: jest.SpyInstance
  const run = jest.fn()

  beforeEach(() => {
    run.mockReset()
    getWorkflow = jest
      .spyOn(MedusaWorkflow, "getWorkflow")
      .mockImplementation((id: string) =>
        id === EMAILS_SEND_WORKFLOW ? ((() => ({ run })) as unknown as never) : undefined
      )
  })
  afterEach(() => getWorkflow.mockRestore())

  it("goes through the emails plugin when its template is registered, without storing the token", async () => {
    run.mockResolvedValue({ result: { status: "sent", messages: [{}] } })
    const test = container({ emails: { enabled: true, templates: { ...backInStockEmailTemplate } } })

    const result = await deliverEmail(test.container, options(), logger(), input)

    expect(result).toEqual({ status: "sent", via: "emails" })
    expect(run).toHaveBeenCalledWith({
      input: {
        type: "back-in-stock",
        to: "anna@example.com",
        locale: "pl",
        data: {
          email: "anna@example.com",
          product_title: "Bluza",
          variant_title: "M",
          product_label: "Bluza · M",
          action_url: "https://shop.test/pl/products/bluza",
          unsubscribe_url: "https://api.shop.test/hooks/back-in-stock/unsubscribe/abc",
          unsubscribe_one_click: true,
        },
        dedupeKey: "back-in-stock:binot_1",
        trigger: "back-in-stock",
        sensitive: true,
      },
    })
    expect(test.createNotifications).not.toHaveBeenCalled()
  })

  it.each([
    [{ status: "duplicate" }, { status: "sent", via: "emails" }],
    [{ status: "demo" }, { status: "demo", via: "emails" }],
    [
      { status: "skipped", reason: "switched off" },
      { status: "skipped", via: "emails", error: "switched off" },
    ],
    [
      { status: "failed", messages: [{ error: "HTTP 503" }] },
      { status: "failed", via: "emails", error: "HTTP 503" },
    ],
  ])("maps the emails plugin result %j", async (emailsResult, expected) => {
    run.mockResolvedValue({ result: emailsResult })
    const test = container({ emails: { enabled: true, templates: { ...backInStockEmailTemplate } } })
    expect(await deliverEmail(test.container, options(), logger(), input)).toEqual(expected)
  })

  it.each([
    ["the emails plugin is not installed", {}],
    ["the emails plugin is disabled", { emails: { enabled: false, templates: { ...backInStockEmailTemplate } } }],
    ["the template is not registered", { emails: { enabled: true, templates: {} } }],
  ])("uses the built-in template when %s", async (_name, config) => {
    const test = container(config)
    const result = await deliverEmail(test.container, options(), logger(), input)

    expect(result).toEqual({ status: "sent", via: "notification" })
    expect(run).not.toHaveBeenCalled()
    const notification = test.createNotifications.mock.calls[0][0]
    expect(notification).toMatchObject({
      to: "anna@example.com",
      from: "Shop <orders@shop.test>",
      channel: "email",
      template: "back-in-stock",
      provider_data: {
        idempotency_key: "back-in-stock:binot_1",
        headers: {
          "List-Unsubscribe": "<https://api.shop.test/hooks/back-in-stock/unsubscribe/abc>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      },
      resource_type: "back_in_stock_subscription",
      resource_id: "bisub_1",
      receiver_id: "cus_1",
    })
    expect(notification.content.subject).toBe("Bluza · M jest znowu dostępny")
    expect(notification.content.html).toContain("https://api.shop.test/hooks/back-in-stock/unsubscribe/abc")
  })

  it("can be told never to use the emails plugin", async () => {
    const test = container({ emails: { enabled: true, templates: { ...backInStockEmailTemplate } } })
    expect(await deliverEmail(test.container, options({ emails: "off" }), logger(), input)).toMatchObject({
      via: "notification",
    })
  })

  it("reports a provider error instead of throwing", async () => {
    const test = container({ notify: jest.fn().mockRejectedValue(new Error("No provider for channel email")) })
    expect(await deliverEmail(test.container, options(), logger(), input)).toEqual({
      status: "failed",
      via: "notification",
      error: "No provider for channel email",
    })
  })

  it("only renders and logs in demo mode, with the address masked", async () => {
    const log = logger() as unknown as { info: jest.Mock }
    const test = container({ emails: { enabled: true, templates: { ...backInStockEmailTemplate } } })
    const result = await deliverEmail(test.container, options(), log as never, { ...input, demo: true })

    expect(result).toEqual({ status: "demo", via: "demo" })
    expect(run).not.toHaveBeenCalled()
    expect(test.createNotifications).not.toHaveBeenCalled()
    expect(log.info.mock.calls[0][0]).toContain("Demo mode, nothing sent: restock email (pl) to a***@example.com")
    expect(log.info.mock.calls[0][0]).not.toContain("anna@example.com")
  })

  it("needs the workflow to be loaded", async () => {
    getWorkflow.mockReturnValue(undefined)
    const test = container({ emails: { enabled: true, templates: { ...backInStockEmailTemplate } } })
    expect(await emailsTemplateAvailable(test.container, options(), "back-in-stock")).toBe(false)
  })
})

describe("unsubscribeHeaders", () => {
  it("sets one-click only for the plugin's own page", () => {
    expect(unsubscribeHeaders("https://shop.test/u?t=1", false)).toEqual({
      "List-Unsubscribe": "<https://shop.test/u?t=1>",
    })
    expect(unsubscribeHeaders(null, true)).toBeUndefined()
    expect(unsubscribeHeaders("javascript:alert(1)", true)).toBeUndefined()
  })
})
