/**
 * Plugin option helpers.
 *
 * Rule for every plugin in this repo: missing or invalid options never stop
 * Medusa from starting. The plugin stays disabled and logs one line.
 */

import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

import type { KitLogger } from "./secrets"

export type PluginOptionsResult<T> = { enabled: true; options: T } | { enabled: false; reason: string }

/**
 * Validates raw plugin options against a zod schema.
 *
 * Returns `{ enabled: false, reason }` instead of throwing when a required
 * key is missing or empty, or when validation fails. The reason is a single
 * line and never contains option values, so it is safe to log.
 */
export function parsePluginOptions<S extends z.ZodType>(
  schema: S,
  raw: unknown,
  config: { required?: string[] } = {}
): PluginOptionsResult<z.output<S>> {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>

  const missing = (config.required ?? []).filter((key) => {
    const value = input[key]
    return value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  })
  if (missing.length) {
    return {
      enabled: false,
      reason: `missing option${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`,
    }
  }

  const result = schema.safeParse(input)
  if (!result.success) {
    return {
      enabled: false,
      reason: `invalid options: ${formatIssues(result.error.issues)}`,
    }
  }
  return { enabled: true, options: result.data }
}

/** `path: message; path: message`, without the offending values. */
export function formatIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`).join("; ")
}

/**
 * The same object schema with every field optional and without defaults.
 * Useful for per-item overrides of a global section. (`.partial()` keeps
 * defaults in zod 4, which would make every override reset the global
 * values it doesn't mention.)
 */
export function overrideOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => {
      const inner = field instanceof z.ZodDefault ? field.unwrap() : field
      return [key, (inner as z.ZodType).optional()]
    })
  )
  return z.object(shape) as unknown as z.ZodType<Partial<z.output<z.ZodObject<T>>>>
}

const LOGGED = Symbol.for("bitshaft.medusa-integrations.disabled-logged")

/**
 * Logs `[name] Disabled: reason` once per process, even when the module,
 * the provider and the jobs of one plugin all notice it.
 */
export function logPluginDisabled(logger: KitLogger, name: string, reason: string): void {
  const store = globalThis as typeof globalThis & { [LOGGED]?: Set<string> }
  const logged = (store[LOGGED] ??= new Set<string>())
  if (logged.has(name)) {
    return
  }
  logged.add(name)
  logger.warn(`[${name}] Disabled: ${reason}. Set the plugin options and restart Medusa to enable it.`)
}

/** Thrown by operations that need a configured plugin. */
export function pluginDisabledError(name: string, reason: string): MedusaError {
  return new MedusaError(MedusaError.Types.NOT_ALLOWED, `The ${name} plugin is disabled: ${reason}`)
}
