import { useEffect, useState } from "react"

/** How long a search box waits after the last keystroke before it asks the server. */
export const SEARCH_DELAY_MS = 300

/**
 * `value`, but only once it has stopped changing for `ms`. Feed a search box's
 * text through it before it goes into a query, so typing a word sends one
 * request, not one per letter. Debounce objects as JSON text: a new object
 * on every render would restart the timer for ever.
 */
export function useDebounced<T>(value: T, ms: number = SEARCH_DELAY_MS): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}
