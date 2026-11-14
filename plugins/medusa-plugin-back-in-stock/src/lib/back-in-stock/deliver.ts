import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { MedusaWorkflow } from "@medusajs/framework/workflows-sdk"

import { EMAILS_CONFIRM_TYPE, EMAILS_RESTOCK_TYPE } from "./emails-template"
import { type BackInStockPluginOptions, PLUGIN_NAME } from "./options"
import { type EmailView, renderEmail } from "./render"

/** Container key and workflow ID of @bitshaft/medusa-plugin-emails. Looked up at runtime, never imported. */
export const EMAILS_MODULE_KEY = "emails"
export const EMAILS_SEND_WORKFLOW = "send-emails-message"

export type DeliveryResult = {
  status: "sent" | "demo" | "skipped" | "failed"
  via: "emails" | "notification" | "demo"
  error?: string
}

export type DeliveryInput = {
  to: string
  view: EmailView
  /** One key per email: the emails plugin and providers use it to never send it twice. */
  dedupe_key: string
  /** Render and log only (demo mode or a demo subscription). */
  demo: boolean
  customer_id?: string | null
  subscription_id: string
  /** The unsubscribe link accepts a POST (RFC 8058 one-click). */
  one_click_unsubscribe?: boolean
}

type EmailsModule = {
  isEnabled(): Promise<boolean>
  getOptions(): Promise<{ templates?: Record<string, unknown> }>
}

/**
 * Whether emails can go through @bitshaft/medusa-plugin-emails: it is
 * installed and enabled, has the given template registered (see
 * `backInStockEmailTemplate`), and its send workflow is loaded. Workflows
 * live in a registry shared through @medusajs/framework, so the workflow is
 * found by its ID without importing the package.
 */
export async function emailsTemplateAvailable(
  container: MedusaContainer,
  options: Pick<BackInStockPluginOptions, "emails">,
  type: string
): Promise<boolean> {
  if (options.emails === "off" || !MedusaWorkflow.getWorkflow(EMAILS_SEND_WORKFLOW)) {
    return false
  }
  try {
    const emails = container.resolve<EmailsModule>(EMAILS_MODULE_KEY)
    if (!(await emails.isEnabled())) {
      return false
    }
    return Boolean((await emails.getOptions()).templates?.[type])
  } catch {
    // Not installed: the container has no "emails" registration.
    return false
  }
}

const maskEmail = (address: string) => {
  const at = address.lastIndexOf("@")
  return at < 1 ? "***" : `${address[0]}***${address.slice(at)}`
}

/** `List-Unsubscribe` headers for providers that pass custom headers on. */
export function unsubscribeHeaders(url: string | null, oneClick: boolean): Record<string, string> | undefined {
  if (!url || !/^https?:\/\//i.test(url)) {
    return undefined
  }
  return {
    "List-Unsubscribe": `<${url}>`,
    ...(oneClick ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
  }
}

/**
 * Sends one back-in-stock or confirmation email. Never throws: the result
 * says what happened, so a provider error ends up in the sent history.
 */
export async function deliverEmail(
  container: MedusaContainer,
  options: BackInStockPluginOptions,
  logger: Logger,
  input: DeliveryInput
): Promise<DeliveryResult> {
  const { view } = input
  const type = view.kind === "restock" ? EMAILS_RESTOCK_TYPE : EMAILS_CONFIRM_TYPE

  if (input.demo) {
    const rendered = renderEmail(view)
    logger.info(
      `[${PLUGIN_NAME}] Demo mode, nothing sent: ${view.kind} email (${view.locale}) to ${maskEmail(input.to)}, ` +
        `subject "${rendered.subject}"`
    )
    return { status: "demo", via: "demo" }
  }

  try {
    if (await emailsTemplateAvailable(container, options, type)) {
      const workflow = MedusaWorkflow.getWorkflow(EMAILS_SEND_WORKFLOW)!
      const { result } = (await workflow(container).run({
        input: {
          type,
          to: input.to,
          locale: view.locale_code,
          data: {
            email: input.to,
            product_title: view.product_title,
            variant_title: view.variant_title,
            product_label: view.product_label,
            action_url: view.action_url,
            unsubscribe_url: view.unsubscribe_url,
            unsubscribe_one_click: input.one_click_unsubscribe === true,
          },
          dedupeKey: input.dedupe_key,
          trigger: "back-in-stock",
          // The data carries an unsubscribe token; the emails plugin must not store it.
          sensitive: true,
        },
      })) as { result: { status: string; reason?: string; messages?: Array<{ error?: string }> } }

      switch (result.status) {
        case "sent":
        case "duplicate":
          return { status: "sent", via: "emails" }
        case "demo":
          return { status: "demo", via: "emails" }
        case "skipped":
          return { status: "skipped", via: "emails", error: result.reason ?? "skipped by the emails plugin" }
        default:
          return {
            status: "failed",
            via: "emails",
            error: result.messages?.find((message) => message.error)?.error ?? "the emails plugin could not send it",
          }
      }
    }

    const rendered = renderEmail(view)
    const headers = unsubscribeHeaders(view.unsubscribe_url, input.one_click_unsubscribe === true)
    await container.resolve(Modules.NOTIFICATION).createNotifications({
      to: input.to,
      from: options.from ?? null,
      channel: options.channel,
      template: type,
      content: rendered,
      data: { ...view },
      provider_data: {
        idempotency_key: input.dedupe_key,
        ...(headers ? { headers } : {}),
      },
      trigger_type: "back-in-stock",
      resource_type: "back_in_stock_subscription",
      resource_id: input.subscription_id,
      receiver_id: input.customer_id ?? null,
    })
    return { status: "sent", via: "notification" }
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 1000)
    return { status: "failed", via: "notification", error: message }
  }
}
