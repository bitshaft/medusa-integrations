import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import { sendEmailsMessageStep, type SendEmailsMessageStepInput } from "./steps/send-message"

export type SendEmailsMessageWorkflowInput = SendEmailsMessageStepInput

export const sendEmailsMessageWorkflowId = "send-emails-message"

/**
 * Sends an email through the same pipeline as the built-in ones: on/off
 * toggle, language, branding, admin-edited text, send log, retries and
 * demo mode.
 *
 * ```ts
 * await sendEmailsMessageWorkflow(container).run({
 *   input: {
 *     type: "abandoned-cart",            // registered in the "templates" option
 *     to: cart.email,
 *     locale: "pl",
 *     data: { cart_id: cart.id, count: cart.items.length },
 *     dedupeKey: `abandoned-cart:${cart.id}`,
 *   },
 * })
 * ```
 *
 * The result tells what happened (`sent`, `demo`, `duplicate`, `skipped`
 * or `failed`); provider errors do not throw.
 */
export const sendEmailsMessageWorkflow = createWorkflow(
  sendEmailsMessageWorkflowId,
  (input: SendEmailsMessageWorkflowInput) => {
    return new WorkflowResponse(sendEmailsMessageStep(input))
  }
)
