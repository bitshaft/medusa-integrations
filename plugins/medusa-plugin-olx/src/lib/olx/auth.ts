import { HttpClient, HttpStatusError } from "./kit/http"
import type { KitLogger } from "./kit/secrets"
import type { OlxPluginOptions } from "./options"
import type { Connection } from "./types"

const SCOPE = "v2 read write"
/** A token this close to its end is refreshed first. */
const REFRESH_MARGIN_MS = 60_000

export type TokenSet = { access_token: string; refresh_token: string; access_expires_at: Date }

/** Where the connection lives (the module service). Tokens are plain here and encrypted there. */
export type ConnectionStore = {
  readConnection(): Promise<Connection | null>
  saveTokens(tokens: TokenSet): Promise<void>
  markNeedsReconnect(reason: string): Promise<void>
}

/** The account must be connected again in the admin. */
export class OlxReconnectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OlxReconnectError"
  }
}

export function authorizeUrl(options: OlxPluginOptions, state: string): string {
  const query = new URLSearchParams({
    client_id: options.clientId ?? "",
    response_type: "code",
    state,
    scope: SCOPE,
    redirect_uri: options.redirectUri ?? "",
  })
  return `${options.baseUrl.replace(/\/+$/, "")}/oauth/authorize/?${query}`
}

async function requestTokens(
  options: OlxPluginOptions,
  logger: KitLogger,
  grant: Record<string, string>,
  fetchImpl?: typeof fetch
): Promise<TokenSet> {
  const http = new HttpClient({
    baseUrl: options.baseUrl.replace(/\/+$/, ""),
    timeoutMs: options.timeoutMs,
    logPrefix: "[olx]",
    logger,
    secrets: [options.clientSecret, grant.code, grant.refresh_token],
    fetch: fetchImpl,
  })
  const body = await http.request<{ access_token?: string; refresh_token?: string; expires_in?: number }>({
    path: "/api/open/oauth/token",
    method: "POST",
    // A code and a refresh token can be spent only once, so this is never retried.
    idempotent: false,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      scope: SCOPE,
      ...grant,
    }),
  })
  if (!body?.access_token) {
    throw new OlxReconnectError("OLX did not return an access token. Connect the account again.")
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? grant.refresh_token ?? "",
    access_expires_at: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
  }
}

/** Trades the code from the OLX consent screen for tokens. */
export function exchangeCode(options: OlxPluginOptions, logger: KitLogger, code: string, fetchImpl?: typeof fetch) {
  return requestTokens(
    options,
    logger,
    { grant_type: "authorization_code", code, redirect_uri: options.redirectUri ?? "" },
    fetchImpl
  )
}

/**
 * Keeps one valid access token. One refresh runs at a time in this process;
 * when another instance spent the refresh token first, its new tokens are
 * read back instead of asking the admin to connect again.
 */
export class OlxTokens {
  private refreshing_: Promise<string> | null = null

  constructor(
    private readonly options: OlxPluginOptions,
    private readonly store: ConnectionStore,
    private readonly logger: KitLogger,
    private readonly fetchImpl?: typeof fetch
  ) {}

  async accessToken(force = false): Promise<string> {
    const connection = await this.store.readConnection()
    if (!connection) {
      throw new OlxReconnectError("No OLX account is connected. Connect it on the OLX page, tab Settings.")
    }
    if (connection.needs_reconnect) {
      throw new OlxReconnectError("OLX ended the session. Connect the account again on the OLX page, tab Settings.")
    }
    if (!force && connection.access_expires_at.getTime() - Date.now() > REFRESH_MARGIN_MS) {
      return connection.access_token
    }
    this.refreshing_ ??= this.refresh(connection).finally(() => {
      this.refreshing_ = null
    })
    return this.refreshing_
  }

  private async refresh(connection: Connection): Promise<string> {
    try {
      const tokens = await requestTokens(
        this.options,
        this.logger,
        { grant_type: "refresh_token", refresh_token: connection.refresh_token },
        this.fetchImpl
      )
      await this.store.saveTokens(tokens)
      return tokens.access_token
    } catch (error) {
      if (!(error instanceof HttpStatusError) || error.status < 400 || error.status >= 500) {
        throw error
      }
      const current = await this.store.readConnection()
      if (current && current.refresh_token !== connection.refresh_token && !current.needs_reconnect) {
        return current.access_token
      }
      const reason = "OLX refused the refresh token. Connect the account again."
      await this.store.markNeedsReconnect(reason)
      throw new OlxReconnectError(reason)
    }
  }
}
