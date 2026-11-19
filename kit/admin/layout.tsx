import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { sdk } from "./sdk"

/**
 * Where the shared cards sit on Medusa's pages.
 *
 * Since Medusa 2.22 a page's widgets are laid out by its layout composer:
 * `*.before` and `*.after` widgets both land in the main column, after
 * Medusa's own sections, so "before" no longer means "on top". The order is
 * a layout configuration the admin can change ("Customize layout"), saved
 * per page for one user or as the default for everyone.
 *
 * Every plugin's copy of a shared card uses the same widget id (below; the
 * admin numbers repeats `#2`, `#3`…), so a placement saved once holds for the
 * card whichever plugin renders it. When a page has no saved layout at all,
 * the card's owner saves the default once, with the card first. A layout the
 * admin saved is never changed.
 */

/** The layout zone of each shared card, and its widget id (`id` in `defineWidgetConfig`, a literal there). */
export const SHARED_WIDGETS = {
  "order.details": "bitshaft-integrations-order-details",
  "customer.details": "bitshaft-integrations-customer-details",
  "product.details": "bitshaft-integrations-product-details",
  "order.list": "bitshaft-integrations-order-list",
  "product.list": "bitshaft-integrations-product-list",
} as const
export type SharedZone = keyof typeof SHARED_WIDGETS

/** Repeats of one id the admin may number (one per installed plugin, with room to spare). */
const MAX_COPIES = 30

const CHECKED = Symbol.for("bitshaft.medusa-integrations.layout-checked")

type ZoneConfiguration = {
  personal_configuration: unknown | null
  default_configuration: unknown | null
}

/** The default layout for a page that has none: the shared card first, Medusa's sections after it. */
export function cardFirstLayout(zone: SharedZone) {
  const id = `widget:${SHARED_WIDGETS[zone]}`
  const widgets: Record<string, { order: number }> = { [id]: { order: -1 } }
  for (let n = 2; n <= MAX_COPIES; n++) widgets[`${id}#${n}`] = { order: -1 }
  return { widgets }
}

/**
 * Puts the shared card at the top of a page that has no saved layout yet:
 * once per page and browser session, rendered only by the card's owner.
 */
export function useCardOnTop(zone: SharedZone) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const store = globalThis as typeof globalThis & { [CHECKED]?: Set<string> }
    const checked = (store[CHECKED] ??= new Set<string>())
    if (checked.has(zone)) return
    checked.add(zone)
    const path = `/admin/layouts/${zone}/configuration`
    void (async () => {
      try {
        const current = await sdk.client.fetch<ZoneConfiguration>(path)
        if (current.personal_configuration || current.default_configuration) return
        await sdk.client.fetch(path, {
          method: "POST",
          body: { is_default: true, configuration: cardFirstLayout(zone) },
        })
        await queryClient.invalidateQueries({ queryKey: ["layouts"] })
      } catch {
        // Older Medusa without layouts, or a user who may not change them: the card stays where Medusa puts it.
      }
    })()
  }, [zone, queryClient])
}

/** Renders nothing; puts the shared card of `zone` on top (see `useCardOnTop`). */
export const CardOnTop = ({ zone }: { zone: SharedZone }) => {
  useCardOnTop(zone)
  return null
}
