import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

import { EMAILS_MODULE } from "../../modules/emails"
import type EmailsModuleService from "../../modules/emails/service"
import type { MessageRecord } from "../../modules/emails/service"
import { BUILT_IN_LOADERS } from "./data/loaders"
import { describeError, isOutcomeUnknown } from "./errors"
import { EmailsEvents } from "./events"
import { maskEmail } from "./format"
import { type EmailLocale, pickLocale } from "./locales"
import { buildUrl, type EmailsPluginOptions, PLUGIN_NAME } from "./options"
import { getDefinition } from "./registry"
import { renderEmail, type RenderedEmail } from "./render"
import { type EmailsSettings, isEmailAddress, teamRecipients } from "./settings"
import type {
  AttachmentResolver,
  EmailAttachment,
  EmailData,
  EmailLoader,
  EmailLoaderContext,
  LoadedEmail,
} from "./types"

export type SendEmailInput = {
  /** A built-in email type or one registered in the `templates` option. */
  type: string
  /**
   * Input of the type's loader: IDs for built-in types (`{ order_id }`), the
   * template data itself for custom types without a loader. Must be plain
   * JSON; it is stored so the email can be retried and resent.
   */
  data?: Record<string, unknown>
  /** Recipient(s). Defaults to the customer of the loaded data, or the team recipients. */
  to?: string | string[]
  /** Language. Defaults to the customer's. */
  locale?: string
  /**
   * Send at most one email per key and recipient, e.g. `my-reminder:<cart id>`.
   * Without a key every call sends an email.
   */
  dedupeKey?: string | null
  /** What triggered the email, for the send log: an event name, `workflow`, `test`… */
  trigger?: string
  /**
   * Extra files for this email. They are not stored: when the first attempts
   * fail the email is not retried later, and a resend goes out without them.
   * Prefer the `attachments` plugin option for files that can be generated again.
   */
  attachments?: EmailAttachment[]
  /** The data holds a secret: never store it. The email cannot be retried later or resent. */
  sensitive?: boolean
  /** Send even when the type is switched off in the admin. */
  force?: boolean
  /** Send log ID of the message this one resends. */
  originalMessageId?: string
  /** Internal: retry this failed message instead of creating a new one. */
  messageId?: string
  /** Internal: data prepared by the caller (previews, test sends); skips the loader. */
  prepared?: LoadedEmail
  /** Internal: prefix of the subject, e.g. `[Test]`. */
  subjectPrefix?: string
}

export type SendEmailMessageResult = {
  id: string
  recipient: string
  status: "sent" | "failed" | "demo" | "duplicate"
  error?: string
}

export type SendEmailResult = {
  /**
   * `sent` when at least one email went out, `demo` in demo mode,
   * `duplicate` when every email was already sent, `skipped` when nothing
   * had to be sent (see `reason`), `failed` otherwise.
   */
  status: "sent" | "failed" | "demo" | "duplicate" | "skipped"
  reason?: string
  messages: SendEmailMessageResult[]
}

type Dependencies = {
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
}

/** Minutes to wait before attempt 2, 3, 4… of a failed email. */
const RETRY_BACKOFF_MINUTES = [1, 5, 30, 120, 360]
/** Immediate attempts for emails that cannot be retried later (their data is not stored). */
const INLINE_ATTEMPTS = 3
const INLINE_DELAY_MS = 500
const MAX_ATTACHMENTS = 10

/**
 * Sends one email type to its recipients: checks the on/off toggle, loads
 * the data, makes sure the email goes out once per dedupe key, renders it in
 * the right language and hands it to Medusa's notification module (or only
 * logs it in demo mode). Every email gets a row in the send log.
 *
 * Provider failures never throw: the result says what happened, and failed
 * emails are retried by the `emails-retry-failed` job.
 */
export async function sendEmail(
  container: MedusaContainer,
  input: SendEmailInput,
  dependencies: Dependencies = {}
): Promise<SendEmailResult> {
  const emails = container.resolve<EmailsModuleService>(EMAILS_MODULE)
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const now = dependencies.now ?? (() => new Date())

  if (!(await emails.isEnabled())) {
    return skipped(`the emails plugin is disabled: ${await emails.getDisabledReason()}`)
  }
  const options = await emails.getOptions()
  const definition = getDefinition(options, input.type)
  if (!definition) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unknown email type "${input.type}". Use a built-in type or register it in the "templates" option of the emails plugin.`
    )
  }

  const settings = await emails.getSettings()
  const giveUp = async (reason: string): Promise<SendEmailResult> => {
    logger.debug(`[${PLUGIN_NAME}] Skipped ${input.type}: ${reason}`)
    if (input.messageId) {
      // A retry that no longer applies must not come back every few minutes.
      await emails.updateEmailsMessages({ id: input.messageId, status: "failed", retryable: false, error: reason })
    }
    return skipped(reason)
  }

  if (!input.force && !settings.types[input.type]?.enabled) {
    return giveUp(`the "${input.type}" email is switched off`)
  }

  const loaderInput = input.data ?? {}
  const loaded = input.prepared ?? (await load(container, options, input, loaderInput))
  if (loaded.skip) {
    return giveUp(loaded.skip)
  }

  const locale = pickLocale([input.locale, loaded.locale], options.defaultLocale)
  const recipients = resolveRecipients(input, loaded, settings, definition.audience)
  if (!recipients.length) {
    return giveUp(
      definition.audience === "team"
        ? "no store team recipients are set (Settings → Emails)"
        : "the email has no recipient address"
    )
  }

  const sensitive = definition.sensitive || input.sensitive === true
  // Previews and test sends use made-up data; there is nothing to load again.
  const storedInput = sensitive || input.prepared ? null : toJson(loaderInput)
  // Emails whose data or files are not stored cannot be retried by the job.
  const deferrable = storedInput !== null && !input.attachments?.length
  const dedupeBase = input.dedupeKey ? (loaded.dedupe_key ?? input.dedupeKey) : null
  const perRecipientKey = recipients.length > 1 || definition.audience === "team"
  const storeName = await loadStoreName(container)

  const results: SendEmailMessageResult[] = []
  for (const recipient of recipients) {
    let message: MessageRecord
    if (input.messageId) {
      message = (await emails.retrieveEmailsMessage(input.messageId)) as unknown as MessageRecord
      await emails.updateEmailsMessages({ id: message.id, status: "pending", retryable: false, next_retry_at: null })
    } else {
      const claim = await emails.claimMessage({
        type: input.type,
        locale,
        recipient,
        dedupe_key: dedupeBase ? (perRecipientKey ? `${dedupeBase}:${recipient}` : dedupeBase) : null,
        order_id: input.prepared ? null : (loaded.order_id ?? null),
        customer_id: input.prepared ? null : (loaded.customer_id ?? null),
        resource_type: loaded.resource_type ?? null,
        resource_id: loaded.resource_id ?? null,
        trigger_type: input.trigger ?? "workflow",
        input: storedInput,
        original_message_id: input.originalMessageId ?? null,
      })
      if (claim.duplicate) {
        results.push({ id: claim.message.id, recipient, status: "duplicate" })
        continue
      }
      message = claim.message
    }

    let rendered: RenderedEmail
    let attachments: EmailAttachment[]
    try {
      rendered = await renderEmail({
        options,
        type: input.type,
        locale,
        data: loaded.data,
        overrides: { type: settings.types[input.type]?.copy, common: settings.common_copy },
        storeName,
      })
      if (input.subjectPrefix) {
        rendered.subject = `${input.subjectPrefix} ${rendered.subject}`
      }
      attachments = await collectAttachments(container, options, logger, {
        type: input.type,
        locale,
        to: recipient,
        loaded,
        input: loaderInput,
        given: input.attachments,
      })
    } catch (error) {
      // A template or data problem: trying again would fail the same way.
      const reason = describeError(error)
      logger.error(`[${PLUGIN_NAME}] Could not render ${input.type} (${message.id}): ${reason}`)
      await emails.updateEmailsMessages({
        id: message.id,
        status: "failed",
        attempts: message.attempts + 1,
        retryable: false,
        error: reason,
      })
      results.push({ id: message.id, recipient, status: "failed", error: reason })
      continue
    }

    if (options.demo) {
      logger.info(
        `[${PLUGIN_NAME}] Demo mode, nothing sent: ${input.type} (${locale}) to ${maskEmail(recipient)}, ` +
          `subject "${rendered.subject}"${attachments.length ? `, ${attachments.length} attachment(s)` : ""}`
      )
      await emails.updateEmailsMessages({
        id: message.id,
        status: "demo",
        subject: rendered.subject,
        attempts: message.attempts + 1,
        error: null,
        sent_at: now(),
      })
      results.push({ id: message.id, recipient, status: "demo" })
      continue
    }

    const delivery = await deliver(
      container,
      options,
      message,
      rendered,
      attachments,
      unsubscribeHeaders(loaded.data),
      {
        attempts: deferrable ? 1 : INLINE_ATTEMPTS,
        sleep: dependencies.sleep ?? defaultSleep,
      }
    )
    const attempts = message.attempts + delivery.attempts

    if (delivery.ok) {
      await emails.updateEmailsMessages({
        id: message.id,
        status: "sent",
        subject: rendered.subject,
        attempts,
        retryable: false,
        next_retry_at: null,
        error: null,
        notification_id: delivery.notificationId,
        sent_at: now(),
      })
      results.push({ id: message.id, recipient, status: "sent" })
      await emitMessageEvent(container, EmailsEvents.MESSAGE_SENT, message, loaded)
      continue
    }

    const retryable = deferrable && !delivery.outcomeUnknown && attempts < options.retries.maxAttempts
    const waitMinutes = RETRY_BACKOFF_MINUTES[Math.min(attempts, RETRY_BACKOFF_MINUTES.length) - 1]
    await emails.updateEmailsMessages({
      id: message.id,
      status: "failed",
      subject: rendered.subject,
      attempts,
      retryable,
      next_retry_at: retryable ? new Date(now().getTime() + waitMinutes * 60_000) : null,
      error: delivery.error,
    })
    logger.error(
      `[${PLUGIN_NAME}] Could not send ${input.type} (${message.id}) to ${maskEmail(recipient)}: ${delivery.error}. ` +
        (retryable
          ? `Next attempt in ${waitMinutes} min.`
          : "It will not be retried automatically; resend it from the send log if needed.")
    )
    results.push({ id: message.id, recipient, status: "failed", error: delivery.error })
    await emitMessageEvent(container, EmailsEvents.MESSAGE_FAILED, message, loaded)
  }

  return { status: overallStatus(results), messages: results }
}

/** Retries one failed message from the send log with its stored input. */
export async function retryMessage(
  container: MedusaContainer,
  message: MessageRecord,
  dependencies: Dependencies = {}
) {
  return sendEmail(
    container,
    {
      type: message.type,
      data: message.input ?? {},
      to: message.recipient,
      locale: message.locale,
      trigger: message.trigger_type ?? undefined,
      messageId: message.id,
    },
    dependencies
  )
}

/**
 * Sends a logged email again as a new message, with the order's current
 * data. Works even when the type is switched off. Emails that carried a
 * secret (password reset, verification) cannot be resent.
 */
export async function resendMessage(container: MedusaContainer, messageId: string): Promise<SendEmailResult> {
  const emails = container.resolve<EmailsModuleService>(EMAILS_MODULE)
  const options = await emails.getOptions()
  const [message] = (await emails.listEmailsMessages({ id: messageId }, { take: 1 })) as unknown as MessageRecord[]
  if (!message) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Email ${messageId} was not found in the send log`)
  }
  const definition = getDefinition(options, message.type)
  if (!definition) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `The email type "${message.type}" is no longer registered, so this email cannot be resent`
    )
  }
  if (definition.sensitive || !message.input) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This email carried a one-time link or code, or was a test, so its data was not kept. Ask the customer to request a new one."
    )
  }
  return sendEmail(container, {
    type: message.type,
    data: message.input,
    to: message.recipient,
    locale: message.locale,
    trigger: "resend",
    force: true,
    originalMessageId: message.id,
  })
}

/* Loading ----------------------------------------------------------------- */

/** For custom types without a loader: the input is the template data. */
const passThroughLoader: EmailLoader = async (input) => ({
  data: input,
  to:
    typeof input.email === "string" ? input.email : ((input.customer as { email?: string } | undefined)?.email ?? null),
  locale: typeof input.locale === "string" ? input.locale : null,
  order_id: typeof input.order_id === "string" ? input.order_id : null,
  customer_id: typeof input.customer_id === "string" ? input.customer_id : null,
})

export function loaderContext(
  container: MedusaContainer,
  options: EmailsPluginOptions,
  requestedLocale?: string
): EmailLoaderContext {
  return {
    container,
    defaultLocale: pickLocale([requestedLocale], options.defaultLocale),
    url: (name, values) => buildUrl(options, name, values),
    locale: (candidates, countryCode): EmailLocale =>
      pickLocale(
        [requestedLocale, ...candidates, countryCode ? options.localeByCountry[countryCode.toLowerCase()] : undefined],
        options.defaultLocale
      ),
  }
}

async function load(
  container: MedusaContainer,
  options: EmailsPluginOptions,
  input: SendEmailInput,
  loaderInput: Record<string, unknown>
): Promise<LoadedEmail> {
  const loader = options.templates[input.type]?.loadData ?? BUILT_IN_LOADERS[input.type] ?? passThroughLoader
  return loader(loaderInput, loaderContext(container, options, input.locale))
}

function resolveRecipients(
  input: SendEmailInput,
  loaded: LoadedEmail,
  settings: EmailsSettings,
  audience: string
): string[] {
  const candidates = input.to
    ? Array.isArray(input.to)
      ? input.to
      : [input.to]
    : audience === "team"
      ? teamRecipients(settings, input.type)
      : [loaded.to]
  return [...new Set(candidates.filter(isEmailAddress).map((address) => address.trim()))]
}

let storeNameCache: { value: string | null; expires: number } | undefined

/** The store's name in Medusa, cached for a minute. */
export async function loadStoreName(container: MedusaContainer): Promise<string | null> {
  if (storeNameCache && storeNameCache.expires > Date.now()) {
    return storeNameCache.value
  }
  let value: string | null = null
  try {
    const [store] = await container.resolve(Modules.STORE).listStores({}, { select: ["name"], take: 1 })
    value = store?.name ?? null
  } catch {
    // The store module is optional for emails; `brand.name` or a generic name is used instead.
  }
  storeNameCache = { value, expires: Date.now() + 60_000 }
  return value
}

/* Attachments ------------------------------------------------------------- */

async function collectAttachments(
  container: MedusaContainer,
  options: EmailsPluginOptions,
  logger: Logger,
  context: {
    type: string
    locale: EmailLocale
    to: string
    loaded: LoadedEmail
    input: Record<string, unknown>
    given?: EmailAttachment[]
  }
): Promise<EmailAttachment[]> {
  const resolver: AttachmentResolver | undefined =
    typeof options.attachments === "function" ? options.attachments : options.attachments?.[context.type]

  let resolved: EmailAttachment[] = []
  if (resolver) {
    try {
      resolved =
        (await resolver({
          type: context.type,
          locale: context.locale,
          to: context.to,
          data: context.loaded.data,
          input: context.input,
          order_id: context.loaded.order_id ?? null,
          customer_id: context.loaded.customer_id ?? null,
          container,
        })) ?? []
    } catch (error) {
      // A missing invoice should not hold back the email itself.
      logger.warn(
        `[${PLUGIN_NAME}] The attachments resolver failed for ${context.type}: ${describeError(error)}. ` +
          "The email is sent without those files."
      )
    }
  }

  const valid = [...(context.given ?? []), ...resolved].filter(
    (file): file is EmailAttachment =>
      Boolean(file) && typeof file.filename === "string" && typeof file.content === "string" && file.content.length > 0
  )
  if (valid.length > MAX_ATTACHMENTS) {
    logger.warn(`[${PLUGIN_NAME}] ${context.type}: only the first ${MAX_ATTACHMENTS} attachments are sent`)
  }
  return valid.slice(0, MAX_ATTACHMENTS).map((file) => ({
    filename: file.filename.replace(/[\r\n"]/g, ""),
    content: file.content,
    content_type: file.content_type,
    disposition: file.disposition ?? "attachment",
    id: file.id,
  }))
}

/* Delivery ---------------------------------------------------------------- */

type Delivery =
  | { ok: true; attempts: number; notificationId: string | null }
  | { ok: false; attempts: number; error: string; outcomeUnknown: boolean }

async function deliver(
  container: MedusaContainer,
  options: EmailsPluginOptions,
  message: MessageRecord,
  rendered: RenderedEmail,
  attachments: EmailAttachment[],
  headers: Record<string, string> | undefined,
  config: { attempts: number; sleep: (ms: number) => Promise<void> }
): Promise<Delivery> {
  const notifications = container.resolve(Modules.NOTIFICATION)
  for (let attempt = 1; ; attempt++) {
    try {
      const notification = await notifications.createNotifications({
        to: message.recipient,
        from: options.from,
        channel: options.channel,
        template: message.type,
        content: rendered,
        attachments: attachments.length ? attachments : undefined,
        provider_data: {
          reply_to: options.replyTo,
          // The same key on every attempt, so a provider that supports
          // idempotency keys (Resend) can never deliver this email twice.
          idempotency_key: `emails-${message.id}`,
          ...(headers ? { headers } : {}),
        },
        trigger_type: message.trigger_type,
        resource_type: message.resource_type,
        resource_id: message.resource_id,
        receiver_id: message.customer_id,
      })
      return { ok: true, attempts: attempt, notificationId: notification?.id ?? null }
    } catch (error) {
      const outcomeUnknown = isOutcomeUnknown(error)
      if (attempt >= config.attempts || outcomeUnknown) {
        return { ok: false, attempts: attempt, error: describeError(error), outcomeUnknown }
      }
      await config.sleep(INLINE_DELAY_MS * attempt)
    }
  }
}

async function emitMessageEvent(container: MedusaContainer, name: string, message: MessageRecord, loaded: LoadedEmail) {
  try {
    await container.resolve(Modules.EVENT_BUS).emit({
      name,
      data: {
        id: message.id,
        type: message.type,
        recipient: message.recipient,
        order_id: loaded.order_id ?? null,
        customer_id: loaded.customer_id ?? null,
      },
    })
  } catch {
    // Events are a convenience for other code; the email itself is done.
  }
}

/* Helpers ----------------------------------------------------------------- */

/**
 * `List-Unsubscribe` (and `List-Unsubscribe-Post` for one-click) when the
 * email data has an unsubscribe URL. Providers that support custom headers
 * (Resend, SMTP) pass them on; mail clients then show their own button.
 */
export function unsubscribeHeaders(data: EmailData): Record<string, string> | undefined {
  const url = typeof data.unsubscribe_url === "string" ? data.unsubscribe_url : null
  if (!url || !/^https?:\/\//i.test(url)) {
    return undefined
  }
  return {
    "List-Unsubscribe": `<${url}>`,
    ...(data.unsubscribe_one_click === true ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
  }
}

function skipped(reason: string): SendEmailResult {
  return { status: "skipped", reason, messages: [] }
}

function overallStatus(results: SendEmailMessageResult[]): SendEmailResult["status"] {
  for (const status of ["sent", "demo", "failed"] as const) {
    if (results.some((result) => result.status === status)) {
      return status
    }
  }
  return "duplicate"
}

/** A JSON-safe copy of the loader input, or null when it cannot be stored. */
function toJson(value: Record<string, unknown>): Record<string, unknown> | null {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
