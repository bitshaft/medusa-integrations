import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import { resendEmailsMessageStep } from "./steps/send-message"

export type ResendEmailsMessageWorkflowInput = {
  /** ID of the email in the send log (`emsg_…`). */
  message_id: string
}

export const resendEmailsMessageWorkflowId = "resend-emails-message"

/**
 * Sends an email from the send log again, as a new message with the
 * current data. Emails that carried a one-time link or code cannot be resent.
 */
export const resendEmailsMessageWorkflow = createWorkflow(
  resendEmailsMessageWorkflowId,
  (input: ResendEmailsMessageWorkflowInput) => {
    return new WorkflowResponse(resendEmailsMessageStep(input))
  }
)
