import Medusa from "@medusajs/js-sdk"

export const sdk = new Medusa({
  baseUrl: import.meta.env.VITE_BACKEND_URL || "/",
  debug: import.meta.env.DEV,
  auth: { type: "session" },
})

/** Absolute URL for links the browser opens directly (labels, PDFs). */
export function backendUrl(path: string): string {
  const base = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/+$/, "")
  return `${base}${path}`
}
