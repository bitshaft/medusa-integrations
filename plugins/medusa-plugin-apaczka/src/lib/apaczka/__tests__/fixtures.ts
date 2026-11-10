import { createHmac } from "node:crypto"

import type { ApaczkaServiceStructure } from "../client"
import { resolveOptions, type ApaczkaPluginOptionsInput } from "../options"

export const APP_ID = "test-app-id"
export const APP_SECRET = "test-app-secret"

export function options(overrides: Partial<ApaczkaPluginOptionsInput> = {}) {
  return resolveOptions({ appId: APP_ID, appSecret: APP_SECRET, ...overrides })
}

export function hmac(data: string, secret = APP_SECRET): string {
  return createHmac("sha256", secret).update(data).digest("hex")
}

/** A fetch mock that answers each call with the next queued response. */
export function mockFetch(...responses: Array<{ status?: number; body: unknown } | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const queue = [...responses]
  const fn = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = queue.shift()
    if (!next) {
      throw new Error("Unexpected fetch call")
    }
    if (next instanceof Error) {
      throw next
    }
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body)
    return new Response(text, { status: next.status ?? 200 })
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

export function ok<T>(response: T) {
  return { body: { status: 200, message: "", response } }
}

export function apiError(status: number, message: string) {
  return { body: { status, message, response: null } }
}

export function formOf(init: RequestInit): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(String(init.body)))
}

export const serviceStructure: ApaczkaServiceStructure = {
  services: {
    "0": {
      service_id: "21",
      name: "DPD Kurier",
      supplier: "DPD",
      domestic: "1",
      pickup_courier: "1",
      door_to_door: "1",
      door_to_point: "0",
      point_to_point: "0",
      point_to_door: "0",
    },
    "1": {
      service_id: "41",
      name: "InPost Paczkomat",
      supplier: "INPOST",
      domestic: "1",
      pickup_courier: "0",
      door_to_door: "0",
      door_to_point: "0",
      point_to_point: "1",
      point_to_door: "0",
    },
    "2": {
      service_id: "22",
      name: "DPD Max",
      supplier: "DPD",
      domestic: "0",
      pickup_courier: "2",
      door_to_door: "1",
    },
  },
  options: { "31": { type: "bool", name: "Insurance+", desc: "" } },
  package_type: { PACZKA: { type: "PACZKA", desc: "Paczka" } },
  points_type: ["INPOST", "DPD", "POCZTA"],
}
