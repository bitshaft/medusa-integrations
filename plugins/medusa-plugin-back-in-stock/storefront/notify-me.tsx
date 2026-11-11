"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"

import { getConsent, subscribe } from "./client"
import { BackInStockError, type BackInStockStoreConfig } from "./types"

export type NotifyMeLabels = {
  title: string
  email: string
  submit: string
  sending: string
  done: string
  confirm: string
  inStock: string
  tooMany: string
  failed: string
}

export const NOTIFY_ME_LABELS: Record<"en" | "pl", NotifyMeLabels> = {
  en: {
    title: "Notify me when it's available",
    email: "Your email",
    submit: "Notify me",
    sending: "Saving…",
    done: "Done. We'll email you when it's back in stock.",
    confirm: "Almost done: check your inbox and confirm with the link we sent.",
    inStock: "Good news: it's in stock now and can be ordered.",
    tooMany: "Too many attempts. Try again in a minute.",
    failed: "Something went wrong. Try again.",
  },
  pl: {
    title: "Powiadom mnie o dostępności",
    email: "Twój e-mail",
    submit: "Powiadom mnie",
    sending: "Zapisywanie…",
    done: "Gotowe. Wyślemy Ci e-mail, gdy produkt wróci do sprzedaży.",
    confirm: "Jeszcze chwila: sprawdź skrzynkę i potwierdź linkiem, który wysłaliśmy.",
    inStock: "Dobra wiadomość: produkt jest już dostępny i można go zamówić.",
    tooMany: "Zbyt wiele prób. Spróbuj ponownie za minutę.",
    failed: "Coś poszło nie tak. Spróbuj ponownie.",
  },
}

export type NotifyMeProps = {
  config: BackInStockStoreConfig
  /** The selected variant. Show the component only when it is sold out. */
  variantId: string
  /** `pl` or `en`: texts and the language of the emails. */
  locale?: "en" | "pl"
  countryCode?: string
  salesChannelId?: string
  /** Prefill (e.g. the logged-in customer's email). */
  defaultEmail?: string
  labels?: Partial<NotifyMeLabels>
  className?: string
  /** Called after a successful subscription. */
  onSubscribed?: (result: { confirmationRequired: boolean }) => void
}

type State = "idle" | "sending" | "done" | "confirm" | "inStock" | "error"

/**
 * "Notify me when available": an email field, the consent text from the
 * backend (editable in the admin) and a button. Unstyled apart from a few
 * class names, so it fits any design; restyle freely, it is your copy.
 */
export function NotifyMe({
  config,
  variantId,
  locale = "en",
  countryCode,
  salesChannelId,
  defaultEmail = "",
  labels,
  className,
  onSubscribed,
}: NotifyMeProps) {
  const text = { ...NOTIFY_ME_LABELS[locale], ...labels }
  const [email, setEmail] = useState(defaultEmail)
  const [consent, setConsent] = useState<string | null>(null)
  const [state, setState] = useState<State>("idle")
  const [error, setError] = useState<string | null>(null)

  // The config object is usually created inline, so it is read through a ref:
  // only a change of language fetches the consent text again.
  const configRef = useRef(config)
  configRef.current = config

  useEffect(() => {
    let active = true
    getConsent(configRef.current, locale)
      .then((result) => active && setConsent(result.consent_text))
      .catch(() => active && setConsent(null))
    return () => {
      active = false
    }
  }, [locale])

  useEffect(() => {
    setState("idle")
    setError(null)
  }, [variantId])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setState("sending")
    setError(null)
    try {
      const result = await subscribe(config, {
        variantId,
        email: email.trim() || undefined,
        locale,
        countryCode,
        salesChannelId,
      })
      setState(result.confirmation_required ? "confirm" : "done")
      onSubscribed?.({ confirmationRequired: result.confirmation_required })
    } catch (failure) {
      if (failure instanceof BackInStockError && failure.code === "variant_in_stock") {
        setState("inStock")
        return
      }
      setState("error")
      setError(failure instanceof BackInStockError && failure.status === 429 ? text.tooMany : text.failed)
    }
  }

  if (state === "done" || state === "confirm" || state === "inStock") {
    return (
      <p className={className} role="status">
        {state === "done" ? text.done : state === "confirm" ? text.confirm : text.inStock}
      </p>
    )
  }

  return (
    <form className={className} onSubmit={onSubmit} noValidate={false}>
      <p className="notify-me__title">{text.title}</p>
      <label className="notify-me__label">
        <span>{text.email}</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {consent && <p className="notify-me__consent">{consent}</p>}
      <button type="submit" disabled={state === "sending" || !email.trim()}>
        {state === "sending" ? text.sending : text.submit}
      </button>
      {error && (
        <p className="notify-me__error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
