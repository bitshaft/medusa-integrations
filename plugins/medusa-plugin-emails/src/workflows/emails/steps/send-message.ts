import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { resendMessage, sendEmail, type SendEmailInput } from "../../../lib/emails/send"

export type SendEmailsMessageStepInput = Omit<SendEmailInput, "messageId" | "prepared" | "subjectPrefix">

export const sendEmailsMessageStepId = "emails-send-message"

/**
 * Sends one email type through the plugin's pipeline. There is nothing to
 * compensate: an email cannot be unsent, and the dedupe key keeps a retried
 * workflow from sending it again.
 */
export const sendEmailsMessageStep = createStep(
  sendEmailsMessageStepId,
  async (input: SendEmailsMessageStepInput, { container }) => {
    return new StepResponse(await sendEmail(container, input))
  }
)

export const resendEmailsMessageStepId = "emails-resend-message"

/** Sends a logged email again as a new message. Nothing to compensate, as above. */
export const resendEmailsMessageStep = createStep(
  resendEmailsMessageStepId,
  async (input: { message_id: string }, { container }) => {
    return new StepResponse(await resendMessage(container, input.message_id))
  }
)
