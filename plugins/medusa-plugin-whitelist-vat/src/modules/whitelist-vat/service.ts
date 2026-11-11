import type { Logger } from "@medusajs/framework/types"
import { MedusaService } from "@medusajs/framework/utils"

import { isValidBankAccount, isValidNip, normalizeBankAccount, parseTaxId } from "../../lib/whitelist-vat/identifiers"
import { logPluginDisabled, pluginDisabledError } from "../../lib/whitelist-vat/kit/options"
import { buildUserAgent, readPackageVersion } from "../../lib/whitelist-vat/kit/package-info"
import {
  PACKAGE_NAME,
  parseOptions,
  PLUGIN_NAME,
  type WhitelistVatPluginOptions,
} from "../../lib/whitelist-vat/options"
import { GusClient } from "../../lib/whitelist-vat/registers/gus"
import { type BankAccountCheck, MfClient } from "../../lib/whitelist-vat/registers/mf"
import type { Source } from "../../lib/whitelist-vat/registers/types"
import { ViesClient } from "../../lib/whitelist-vat/registers/vies"
import {
  type CheckRow,
  type Registers,
  startOfWarsawDay,
  type SubjectRecord,
  type Verification,
  type VerificationStore,
  type VerifyInput,
  verifyTaxId,
} from "../../lib/whitelist-vat/verify"
import { WhitelistVatCheck } from "./models/check"
import { WhitelistVatSubject } from "./models/subject"

type InjectedDependencies = { logger: Logger }

type EnabledState = { options: WhitelistVatPluginOptions; registers: Registers }

/**
 * The plugin's own module: verified businesses, the verification history
 * and the register clients. `verify` is the one entry point routes,
 * workflows and subscribers use.
 */
export default class WhitelistVatModuleService
  extends MedusaService({ WhitelistVatSubject, WhitelistVatCheck })
  implements VerificationStore
{
  protected readonly logger_: Logger
  private readonly state_: EnabledState | { disabled: string }

  constructor(container: InjectedDependencies, options: Record<string, unknown>) {
    super(...arguments)
    this.logger_ = container.logger

    const parsed = parseOptions(options)
    if (!parsed.enabled) {
      // Never block Medusa's startup over plugin configuration.
      logPluginDisabled(container.logger, PLUGIN_NAME, parsed.reason)
      this.state_ = { disabled: parsed.reason }
      return
    }

    const { mf, vies, gus, timeoutMs } = parsed.options
    const common = {
      timeoutMs,
      logger: container.logger,
      userAgent: buildUserAgent(
        "medusa-plugin-whitelist-vat",
        readPackageVersion(PACKAGE_NAME, __dirname),
        "https://bitshaft.pl"
      ),
    }
    this.state_ = {
      options: parsed.options,
      registers: {
        mf: mf.enabled ? new MfClient({ ...common, environment: mf.environment, baseUrl: mf.baseUrl }) : undefined,
        vies: vies.enabled
          ? new ViesClient({ ...common, requesterVatNumber: vies.requesterVatNumber, baseUrl: vies.baseUrl })
          : undefined,
        gus: gus.apiKey
          ? new GusClient({ ...common, apiKey: gus.apiKey, environment: gus.environment, url: gus.url })
          : undefined,
      },
    }
  }

  /** False when options are invalid; see `getDisabledReason`. */
  async isEnabled(): Promise<boolean> {
    return !("disabled" in this.state_)
  }

  /** Why the plugin is disabled (safe to show: never contains option values). */
  async getDisabledReason(): Promise<string | null> {
    return "disabled" in this.state_ ? this.state_.disabled : null
  }

  async getOptions(): Promise<WhitelistVatPluginOptions> {
    return this.enabled_().options
  }

  /** Which registers are in use. */
  async getActiveSources(): Promise<Source[]> {
    const { registers } = this.enabled_()
    return (["mf", "gus", "vies"] as const).filter((source) => Boolean(registers[source]))
  }

  private enabled_(): EnabledState {
    if ("disabled" in this.state_) {
      throw pluginDisabledError(PLUGIN_NAME, this.state_.disabled)
    }
    return this.state_
  }

  /* Verification ---------------------------------------------------------- */

  /**
   * Verifies a tax ID against the registers (or a recent stored answer)
   * and records the result. See `verifyTaxId` for the rules.
   */
  async verify(input: VerifyInput): Promise<Verification> {
    const { options, registers } = this.enabled_()
    return verifyTaxId({ store: this, registers, options }, input)
  }

  /** Whether a bank account is registered for a NIP on the white list today. */
  async checkBankAccount(nip: string, account: string): Promise<BankAccountCheck & { problem?: string }> {
    const { registers, options } = this.enabled_()
    const parsed = parseTaxId(nip, "PL")
    const normalized = normalizeBankAccount(account)
    const failed = (problem: string, error: string | null = null) => ({
      assigned: null,
      request_id: null,
      checked_at: new Date(),
      error,
      problem,
    })
    if (parsed.kind !== "nip" || !isValidNip(parsed.local)) {
      return failed("invalid_nip")
    }
    if (!isValidBankAccount(normalized)) {
      return failed("invalid_account")
    }
    if (!registers.mf) {
      return failed("unavailable", "The white list is switched off in the plugin options (mf.enabled)")
    }
    if ((await this.countRequestsSince("mf", startOfWarsawDay(new Date()))) >= options.mf.dailyLimit) {
      return failed("unavailable", `The daily limit of ${options.mf.dailyLimit} white list requests is used up`)
    }
    const result = await registers.mf.checkBankAccount(parsed.local, normalized)
    // Counts toward the daily limit like any other request.
    await this.recordChecks([
      {
        number: parsed.number,
        source: "mf",
        // "found": the account belongs to the NIP; "not_found": it does not.
        outcome: result.assigned === null ? "unavailable" : result.assigned ? "found" : "not_found",
        status: (await this.findSubject(parsed.number))?.status ?? "unverified",
        request_id: result.request_id,
        error: result.error,
        duration_ms: 0,
        from_cache: false,
        trigger_type: "bank-account",
        name: null,
        order_id: null,
        customer_id: null,
        cart_id: null,
        checked_at: result.checked_at,
      },
    ])
    return result.assigned === null ? { ...result, problem: "unavailable" } : result
  }

  /* VerificationStore ------------------------------------------------------ */

  async findSubject(number: string): Promise<SubjectRecord | null> {
    const [subject] = await this.listWhitelistVatSubjects({ number }, { take: 1 })
    return (subject as unknown as SubjectRecord) ?? null
  }

  async saveSubject(data: Omit<SubjectRecord, "id">): Promise<SubjectRecord> {
    const values = {
      ...data,
      checked_at: data.checked_at ? new Date(data.checked_at) : null,
      company: data.company as Record<string, unknown> | null,
      sources: data.sources as Record<string, unknown> | null,
    }
    const existing = await this.findSubject(data.number)
    if (existing) {
      return (await this.updateWhitelistVatSubjects({ id: existing.id, ...values })) as unknown as SubjectRecord
    }
    try {
      return (await this.createWhitelistVatSubjects(values)) as unknown as SubjectRecord
    } catch (error) {
      // Two verifications of a new number raced; the unique index let one through.
      const raced = await this.findSubject(data.number)
      if (!raced) {
        throw error
      }
      return (await this.updateWhitelistVatSubjects({ id: raced.id, ...values })) as unknown as SubjectRecord
    }
  }

  async recordChecks(rows: CheckRow[]): Promise<void> {
    if (rows.length) {
      await this.createWhitelistVatChecks(rows)
    }
  }

  async countRequestsSince(source: Source, since: Date): Promise<number> {
    const [, count] = await this.listAndCountWhitelistVatChecks(
      { source, from_cache: false, duration_ms: { $ne: null }, checked_at: { $gte: since } },
      { take: 1, select: ["id"] }
    )
    return count
  }
}
