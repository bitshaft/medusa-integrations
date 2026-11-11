export type EmailCopy = {
  subject: string
  preview: string
  heading: string
  body: string
  button: string
  footnote: string
}

export type Copy = {
  /** Default consent text shown next to the form. */
  consent: string
  restock: EmailCopy
  confirm: EmailCopy
  footer: { unsubscribe: string; reason: string }
  /** The confirm and unsubscribe pages under `/hooks/back-in-stock/…`. */
  pages: {
    confirmTitle: string
    confirmText: string
    confirmButton: string
    confirmedTitle: string
    confirmedText: string
    unsubscribeTitle: string
    unsubscribeText: string
    unsubscribeButton: string
    unsubscribedTitle: string
    unsubscribedText: string
    invalidTitle: string
    invalidText: string
  }
}
