import type { CompanyData, RegisterResult } from "./types"

/**
 * NIPs with a fixed demo answer, so every GUS outcome can be shown. Any
 * other valid NIP is "found" and gets one of the sample businesses below.
 */
export const DEMO_GUS_NIPS = {
  /** A business that has ended its activity. */
  inactive: "1112223332",
  /** A number GUS has no entry for. */
  notFound: "9876543210",
} as const

type Sample = Omit<CompanyData, "regon" | "address" | "bank_accounts" | "registered_at">

/** Made-up businesses. The `[DEMO]` prefix keeps them from being taken for real ones. */
const SAMPLES: Sample[] = [
  {
    name: "[DEMO] Przykładowa Hurtownia Spożywcza sp. z o.o.",
    street: "ul. Kwiatowa 12",
    postal_code: "00-950",
    city: "Warszawa",
    krs: "0000123456",
    legal_form: "legal_entity",
  },
  {
    name: "[DEMO] Jan Testowy Usługi Remontowe",
    street: "ul. Słoneczna 4/2",
    postal_code: "30-001",
    city: "Kraków",
    legal_form: "sole_proprietorship",
  },
  {
    name: "[DEMO] Pracownia Mebli Przykład S.A.",
    street: "ul. Leśna 88",
    postal_code: "60-101",
    city: "Poznań",
    krs: "0000654321",
    legal_form: "legal_entity",
  },
  {
    name: "[DEMO] Anna Próbna Biuro Rachunkowe",
    street: "Zalesie 15",
    postal_code: "21-040",
    city: "Świdnik",
    legal_form: "sole_proprietorship",
  },
  {
    name: "[DEMO] Sklep Rowerowy Wzorcowy sp.j.",
    street: "ul. Portowa 3",
    postal_code: "80-001",
    city: "Gdańsk",
    legal_form: "legal_entity",
  },
]

/**
 * Stands in for `GusClient` in demo mode: answers at once from sample data,
 * without a key and without any request to GUS. The same NIP always gets
 * the same business, and request IDs start with `demo-` so the history
 * shows which answers were made up.
 */
export class DemoGusClient {
  readonly demo = true
  private readonly now: () => number

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now
  }

  async searchNip(nip: string): Promise<RegisterResult> {
    const base = {
      source: "gus" as const,
      request_id: `demo-${nip}-${this.now().toString(36)}`,
      checked_at: new Date(this.now()),
      error: null,
      duration_ms: 0,
    }
    if (nip === DEMO_GUS_NIPS.notFound) {
      return { ...base, outcome: "not_found", company: null }
    }
    return {
      ...base,
      outcome: nip === DEMO_GUS_NIPS.inactive ? "inactive" : "found",
      company: demoCompany(nip),
    }
  }
}

/** The sample business for a NIP, with a valid REGON derived from it. */
export function demoCompany(nip: string): CompanyData {
  const digits = nip.replace(/\D/g, "").padEnd(10, "0")
  const sum = [...digits].reduce((total, digit) => total + Number(digit), 0)
  const sample = SAMPLES[sum % SAMPLES.length]
  const regon = withRegonCheckDigit(digits.slice(1, 9))
  return {
    ...sample,
    krs: sample.krs ?? null,
    address: `${sample.street}, ${sample.postal_code} ${sample.city}`,
    regon,
  }
}

function withRegonCheckDigit(eight: string): string {
  const weights = [8, 9, 2, 3, 4, 5, 6, 7]
  const check = (weights.reduce((total, weight, i) => total + weight * Number(eight[i]), 0) % 11) % 10
  return `${eight}${check}`
}
