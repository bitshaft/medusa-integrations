# Storefront kit: "notify me when available"

Drop-in React code for the product page: when the selected variant is sold
out, customers leave their email and get one when it is back in stock. It
talks to the plugin's Store API.

The kit is copied into your storefront instead of installed from npm.
Installing the plugin package in a storefront would also pull in its Medusa
backend peer dependencies, and copying lets you restyle the component freely.

## What's inside

| File            | Use it for                                                                                |
| --------------- | ----------------------------------------------------------------------------------------- |
| `notify-me.tsx` | `<NotifyMe>`: email field, consent text from the backend, button, and the result message. |
| `client.ts`     | `subscribe`, `getConsent`, `listMySubscriptions`, `unsubscribeMine`, `applyToken`.        |
| `types.ts`      | `BackInStockStoreConfig`, `BackInStockSubscription`, `BackInStockError`.                  |

## Install (Next.js Starter Storefront)

1. Copy this folder to `src/modules/products/components/back-in-stock/`.
2. Show `<NotifyMe>` where the "Out of stock" button is, for the selected
   variant. Using the SDK's fetcher sends the logged-in customer's session,
   so their account email is used when they leave the field empty.

```tsx
"use client"

import { sdk } from "@lib/config"
import { NotifyMe } from "@modules/products/components/back-in-stock"

const config = {
  fetcher: (path: string, init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> }) =>
    sdk.client.fetch(path, init),
}

export function OutOfStock({ variantId, countryCode }: { variantId: string; countryCode: string }) {
  return <NotifyMe config={config} variantId={variantId} countryCode={countryCode} locale="pl" />
}
```

Without the SDK, pass `{ baseUrl, publishableKey }` instead of `fetcher`.

`countryCode` is used for the product link in the emails (the default
`urls.product` is `{storefrontUrl}/{country_code}/products/{handle}`).

## Confirm and unsubscribe pages (optional)

By default, links in emails open small pages served by the backend under
`/hooks/back-in-stock/…`. To keep customers on your storefront, set
`urls.confirm` and `urls.unsubscribe` in the plugin options, e.g.
`{storefrontUrl}/back-in-stock/unsubscribe?token={token}`, and build a page
that calls `applyToken` **from a button**. Never on page load: mail scanners
open every link in an email.

```tsx
"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { applyToken } from "@modules/products/components/back-in-stock"

export default function Unsubscribe() {
  const token = useSearchParams().get("token") ?? ""
  const [outcome, setOutcome] = useState<string | null>(null)
  return outcome ? (
    <p>{outcome === "invalid" ? "This link is no longer valid." : "You are unsubscribed."}</p>
  ) : (
    <button onClick={async () => setOutcome((await applyToken(config, "unsubscribe", token)).outcome)}>
      Unsubscribe
    </button>
  )
}
```

## Errors

`subscribe` throws `BackInStockError`. `code === "variant_in_stock"` means
the variant can be ordered now (the component then says so); `status === 429`
means too many requests from this visitor. `<NotifyMe>` handles both.
