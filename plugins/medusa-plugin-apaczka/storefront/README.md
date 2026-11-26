# Storefront kit: parcel point picker

Drop-in React code for letting customers choose a parcel locker or pickup
point (InPost Paczkomat, Orlen Paczka, DPD Pickup, Poczta Polska, …) at
checkout. It talks to the plugin's Store API, so the Apaczka secret never
reaches the browser.

The kit is copied into your storefront instead of installed from npm.
Installing the plugin package in a storefront would also pull in its Medusa
backend peer dependencies, and copying lets you restyle the component freely.

## What's inside

| File                  | Use it for                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `point-picker.tsx`    | `<PointPicker>`: search box, OpenStreetMap map and list.                                   |
| `use-point-search.ts` | `usePointSearch()`: headless, debounced search for your own UI.                            |
| `client.ts`           | `searchPoints`, `getPoint`, `requiresPoint`, `shippingMethodData`, `getApaczkaOptionData`. |
| `types.ts`            | `ApaczkaPoint`, `ApaczkaOptionData`, `ApaczkaStoreConfig`.                                 |

## Install (Next.js Starter Storefront)

1. Copy this folder to `src/modules/checkout/components/apaczka/`.
2. For the map, install Leaflet. Skip this for a list-only picker
   (`showMap={false}`):

   ```bash
   npm install leaflet
   npm install -D @types/leaflet
   ```

3. Show the picker in the shipping step when the chosen option delivers to
   a point, and send the point with the shipping method.

```tsx
"use client"

import { useState } from "react"
import { sdk } from "@lib/config"
import { PointPicker, requiresPoint, shippingMethodData, type ApaczkaPoint } from "@modules/checkout/components/apaczka"

const apaczka = {
  // Reuse the storefront's JS SDK: auth, publishable key and base URL come for free.
  fetcher: (path: string, query: Record<string, string>) => sdk.client.fetch(path, { query }),
}

export function ApaczkaShipping({
  cart,
  option,
}: {
  cart: HttpTypes.StoreCart
  option: HttpTypes.StoreCartShippingOption
}) {
  const [point, setPoint] = useState<ApaczkaPoint | null>(null)

  if (!requiresPoint(option)) {
    return null
  }

  const choose = async (selected: ApaczkaPoint) => {
    setPoint(selected)
    await sdk.store.cart.addShippingMethod(cart.id, {
      option_id: option.id,
      data: shippingMethodData(selected), // { point_id: "WAW01M" }
    })
  }

  return (
    <PointPicker
      config={apaczka}
      shippingOption={option}
      value={point?.id}
      onChange={choose}
      initialQuery={cart.shipping_address?.postal_code ?? ""}
      labels={pickerLabels}
    />
  )
}
```

`pickerLabels` is optional: an object of type `PointPickerLabels` with your
own strings, for example a translation from your storefront's i18n setup.

Without the JS SDK, pass the backend URL and publishable key instead:

```tsx
<PointPicker config={{ baseUrl: "https://api.shop.pl", publishableKey: "pk_..." }} pointsType="INPOST" onChange={...} />
```

## Behaviour

- **Point type.** Taken from the shipping option (`option.data.points_type`)
  or passed as `pointsType`.
- **Cash on delivery.** For COD options, only points that accept COD are
  listed. Override with `cod`.
- **Validation.** The backend checks the point again when the shipping method
  is added, and rejects unknown points and points without COD for COD options.
- **SSR.** Leaflet is imported lazily inside an effect, so the component is
  safe to render on the server.
- **Map tiles.** OpenStreetMap by default. For production traffic, use a tile
  provider you have an agreement with (`tileUrl`, `tileAttribution`); see the
  [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

- **Map areas.** For a map that loads points as it moves, pass the visible
  area to `usePointSearch({ bbox: { west, south, east, north }, limit: 500 })`
  (or `searchPoints`). The backend answers with the points in that area
  only; keep the map zoomed in far enough (city level) for that to be a
  useful set.

- **Zoomed-out maps.** Further out, use `usePointClusters({ type, bbox, zoom })`
  (or `searchClusters`): the backend groups the area's points into cells of
  about 85 pixels at that zoom and returns one cluster per cell, with its
  count, average position and `bounds` (zoom to them on click). A whole
  country is a few dozen clusters, so the map always shows where the points
  are without loading each of them. A cluster of one point carries its `id`.

## Styling

Every element has an `apaczka-picker__*` class. Colors use CSS variables, so
theming is usually a few lines:

```css
.apaczka-picker {
  --apaczka-accent: #111827;
  --apaczka-accent-text: #fff;
  --apaczka-border: #e5e7eb;
  --apaczka-muted: #6b7280;
  --apaczka-selected: #f9fafb;
  --apaczka-surface: #fff;
}
```

For a fully custom UI, use `usePointSearch()` and render your own list or map.

## Props

| Prop                            | Default           |                                                  |
| ------------------------------- | ----------------- | ------------------------------------------------ |
| `config`                        | —                 | `{ fetcher }` or `{ baseUrl, publishableKey }`   |
| `shippingOption` / `pointsType` | —                 | Where the point type comes from                  |
| `value`                         | —                 | Selected point ID                                |
| `onChange`                      | —                 | Called with the chosen `ApaczkaPoint`            |
| `initialQuery`                  | `""`              | Prefill, e.g. the postal code                    |
| `countryCode`                   | `"pl"`            |                                                  |
| `cod`                           | option's COD flag | Only COD-capable points                          |
| `locale`                        | `"en"`            | Built-in strings are English                     |
| `labels`                        | —                 | Your own strings, e.g. a translation             |
| `showMap`                       | `true`            | `false` gives a list-only picker without Leaflet |
| `height`                        | `420`             | Height of the map and list area (px)             |
| `limit`                         | `50`              | Max points per search                            |
| `tileUrl`, `tileAttribution`    | OpenStreetMap     | Map tiles                                        |
| `injectLeafletCss`              | `true`            | Load Leaflet's CSS from unpkg                    |
