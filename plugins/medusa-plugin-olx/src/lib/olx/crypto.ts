import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto"

const VERSION = "v1"
const keys = new Map<string, Buffer>()

function deriveKey(secret: string): Buffer {
  const id = createHash("sha256").update(secret).digest("hex")
  let key = keys.get(id)
  if (!key) {
    key = scryptSync(secret, "bitshaft-olx-tokens-v1", 32)
    keys.set(id, key)
  }
  return key
}

/** AES-256-GCM: `v1.<iv>.<tag>.<data>`, each part base64url. */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".")
}

/** The plain value, or `null` when it was encrypted with another key or was changed. */
export function decryptSecret(sealed: string, secret: string): string | null {
  const [version, iv, tag, data] = sealed.split(".")
  if (version !== VERSION || !iv || !tag || data === undefined) {
    return null
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** A random single-use value for the OAuth `state`. */
export const createState = (): string => randomBytes(32).toString("base64url")

/** Only the hash of a `state` is stored. */
export const hashState = (state: string): string => createHash("sha256").update(state).digest("hex")
