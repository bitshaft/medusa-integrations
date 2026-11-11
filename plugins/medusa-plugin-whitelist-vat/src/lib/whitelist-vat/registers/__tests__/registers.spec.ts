import { decodeXml, extractResult, GusClient, parseRecords } from "../gus"
import { MfClient } from "../mf"
import { splitPolishAddress } from "../types"
import { ViesClient } from "../vies"

const NOW = Date.parse("2026-11-10T23:30:00.000Z") // already 11 November in Poland
const common = { now: () => NOW, sleep: async () => undefined }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const asFetch = (mock: jest.Mock) => mock as unknown as typeof fetch

describe("MfClient", () => {
  const subject = {
    name: "ACME SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
    nip: "5260250274",
    statusVat: "Czynny",
    regon: "011417295",
    krs: "0000123456",
    residenceAddress: null,
    workingAddress: "UL. LIPOWA 12/4, 00-001 WARSZAWA",
    registrationLegalDate: "2019-03-01",
    accountNumbers: ["61109010140000071219812874"],
  }

  it("reads an active VAT payer with company data and the register's request ID", async () => {
    const fetch = jest.fn(async () => json(200, { result: { subject, requestId: "abc-123", requestDateTime: "x" } }))
    const result = await new MfClient({ ...common, fetch: asFetch(fetch) }).searchNip("5260250274")

    // The register works on Polish calendar days.
    expect((fetch.mock.calls as unknown as string[][])[0][0]).toBe(
      "https://wl-api.mf.gov.pl/api/search/nip/5260250274?date=2026-11-11"
    )
    expect(result).toMatchObject({
      source: "mf",
      outcome: "active",
      request_id: "abc-123",
      error: null,
      company: {
        name: "ACME SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
        address: "UL. LIPOWA 12/4, 00-001 WARSZAWA",
        street: "UL. LIPOWA 12/4",
        postal_code: "00-001",
        city: "WARSZAWA",
        regon: "011417295",
        krs: "0000123456",
        bank_accounts: ["61109010140000071219812874"],
        registered_at: "2019-03-01",
      },
    })
  })

  it.each([
    ["Zwolniony", "exempt"],
    ["Niezarejestrowany", "unregistered"],
    [null, "unregistered"],
  ])("maps the VAT status %s to %s", async (statusVat, outcome) => {
    const fetch = jest.fn(async () => json(200, { result: { subject: { ...subject, statusVat }, requestId: "r" } }))
    const result = await new MfClient({ ...common, fetch: asFetch(fetch) }).searchNip("5260250274")
    expect(result.outcome).toBe(outcome)
  })

  it("reports a NIP the register does not know as not found, with the request ID", async () => {
    const fetch = jest.fn(async () => json(200, { result: { subject: null, requestId: "z0lzu-9988emd" } }))
    const result = await new MfClient({ ...common, fetch: asFetch(fetch) }).searchNip("5260250274")
    expect(result).toMatchObject({ outcome: "not_found", request_id: "z0lzu-9988emd", company: null })
  })

  it.each([
    [
      "the daily limit",
      () => json(429, { code: "WL-195", message: "Limit exceeded" }),
      /HTTP 429 WL-195.*daily request limit/,
    ],
    ["a server error", () => new Response("Bad gateway", { status: 502 }), /HTTP 502/],
    [
      "a rejected request",
      () => json(400, { code: "WL-115", message: "Nieprawidłowy NIP." }),
      /HTTP 400 WL-115: Nieprawidłowy NIP/,
    ],
  ])("treats %s as unavailable, never as a verdict", async (_name, respond, message) => {
    const fetch = jest.fn(async () => respond())
    const result = await new MfClient({ ...common, fetch: asFetch(fetch) }).searchNip("5260250274")
    expect(result).toMatchObject({ outcome: "unavailable", request_id: null, company: null })
    expect(result.error).toMatch(message)
  })

  it("treats a network failure as unavailable after one retry", async () => {
    const fetch = jest.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"))
    const result = await new MfClient({ ...common, fetch: asFetch(fetch) }).searchNip("5260250274")
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.outcome).toBe("unavailable")
    expect(result.error).toContain("could not be reached")
  })

  it("uses the test environment when asked", async () => {
    const fetch = jest.fn(async () => json(200, { result: { subject: null } }))
    await new MfClient({ ...common, environment: "test", fetch: asFetch(fetch) }).searchNip("5260250274")
    expect((fetch.mock.calls as unknown as string[][])[0][0]).toContain("https://wl-test.mf.gov.pl/api/search/nip/")
  })

  it("checks whether a bank account belongs to a NIP", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(json(200, { result: { accountAssigned: "TAK", requestId: "chk-1" } }))
      .mockResolvedValueOnce(json(200, { result: { accountAssigned: "NIE", requestId: "chk-2" } }))
      .mockResolvedValue(json(500, {}))
    const client = new MfClient({ ...common, maxRetries: 0, fetch: asFetch(fetch) })

    expect(await client.checkBankAccount("5260250274", "61109010140000071219812874")).toMatchObject({
      assigned: true,
      request_id: "chk-1",
    })
    expect(fetch.mock.calls[0][0]).toBe(
      "https://wl-api.mf.gov.pl/api/check/nip/5260250274/bank-account/61109010140000071219812874?date=2026-11-11"
    )
    expect(await client.checkBankAccount("5260250274", "61109010140000071219812874")).toMatchObject({ assigned: false })
    expect(await client.checkBankAccount("5260250274", "61109010140000071219812874")).toMatchObject({
      assigned: null,
      error: expect.stringContaining("HTTP 500"),
    })
  })

  it("splits Polish address lines when they have the usual shape", () => {
    expect(splitPolishAddress("STARY RYNEK 15C, 06-500 MŁAWA")).toEqual({
      street: "STARY RYNEK 15C",
      postal_code: "06-500",
      city: "MŁAWA",
    })
    expect(splitPolishAddress("somewhere abroad")).toEqual({})
    expect(splitPolishAddress(null)).toEqual({})
  })
})

describe("ViesClient", () => {
  it("confirms a number and keeps the consultation number as proof", async () => {
    const fetch = jest.fn(async () =>
      json(200, {
        countryCode: "DE",
        vatNumber: "123456789",
        valid: true,
        requestIdentifier: "WAPIAAAAY1234567",
        name: "ACME GMBH",
        address: "HAUPTSTR. 1\n10115 BERLIN",
      })
    )
    const client = new ViesClient({ ...common, requesterVatNumber: "pl 526-025-02-74", fetch: asFetch(fetch) })
    const result = await client.check("DE", "123456789")

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number")
    expect(JSON.parse(init.body as string)).toEqual({
      countryCode: "DE",
      vatNumber: "123456789",
      requesterMemberStateCode: "PL",
      requesterNumber: "5260250274",
    })
    expect(result).toMatchObject({
      source: "vies",
      outcome: "valid",
      request_id: "WAPIAAAAY1234567",
      company: { name: "ACME GMBH", address: "HAUPTSTR. 1, 10115 BERLIN" },
    })
  })

  it("reports numbers VIES does not confirm as invalid", async () => {
    const fetch = jest.fn(async () => json(200, { valid: false, name: "---", address: "---" }))
    const result = await new ViesClient({ ...common, fetch: asFetch(fetch) }).check("DE", "123456789")
    expect(result).toMatchObject({ outcome: "invalid", company: null, request_id: null })
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      countryCode: "DE",
      vatNumber: "123456789",
    })
  })

  it("hides the placeholders of member states that publish no data", async () => {
    const fetch = jest.fn(async () => json(200, { valid: true, name: "---", address: "---" }))
    const result = await new ViesClient({ ...common, fetch: asFetch(fetch) }).check("DE", "123456789")
    expect(result).toMatchObject({ outcome: "valid", company: null })
  })

  it.each([
    ["a member state that is offline", json(200, { userError: "MS_UNAVAILABLE", valid: false }), /MS_UNAVAILABLE/],
    [
      "an error VIES reports itself",
      json(200, { actionSucceed: false, errorWrappers: [{ error: "SERVICE_UNAVAILABLE" }] }),
      /SERVICE_UNAVAILABLE/,
    ],
    ["an answer without a verdict", json(200, {}), /without a verdict/],
    ["an HTTP error", json(500, { errorWrappers: [{ error: "TIMEOUT" }] }), /HTTP 500 \(TIMEOUT\)/],
  ])("treats %s as unavailable, never as invalid", async (_name, reply, message) => {
    const fetch = jest.fn(async () => reply.clone())
    const result = await new ViesClient({ ...common, fetch: asFetch(fetch) }).check("DE", "123456789")
    expect(result.outcome).toBe("unavailable")
    expect(result.error).toMatch(message)
  })

  it("treats a timeout as unavailable", async () => {
    const fetch = jest.fn().mockRejectedValue(new Error("network down"))
    const result = await new ViesClient({ ...common, fetch: asFetch(fetch) }).check("DE", "123456789")
    expect(result.outcome).toBe("unavailable")
    expect(result.error).toContain("could not be reached")
  })
})

describe("GusClient", () => {
  const soap = (name: string, content: string) =>
    new Response(
      `--uuid:1\r\nContent-Type: application/xop+xml\r\n\r\n<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><${name}Response xmlns="http://CIS/BIR/PUBL/2014/07"><${name}Result>${content}</${name}Result></${name}Response></s:Body></s:Envelope>\r\n--uuid:1--`,
      { status: 200 }
    )
  const encode = (xml: string) => xml.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const record = (fields: Record<string, string>) =>
    `<dane>${Object.entries(fields)
      .map(([key, value]) => (value ? `<${key}>${value}</${key}>` : `<${key} />`))
      .join("")}</dane>`
  const found = record({
    Regon: "382745110",
    Nip: "5691868369",
    StatusNip: "",
    Nazwa: "JAN &amp; SYN SPÓŁKA JAWNA",
    Miejscowosc: "Mława",
    KodPocztowy: "06-500",
    Ulica: "ul. Stary Rynek",
    NrNieruchomosci: "15C",
    NrLokalu: "2",
    Typ: "P",
    DataZakonczeniaDzialalnosci: "",
    MiejscowoscPoczty: "Mława",
  })
  const login = () => soap("Zaloguj", "session-1")
  const search = (xml: string) => soap("DaneSzukajPodmioty", encode(`<root>${xml}</root>`))
  const client = (fetch: jest.Mock, now: () => number = () => NOW) =>
    new GusClient({ apiKey: "gus-user-key-0001", fetch: asFetch(fetch), now, sleep: async () => undefined }) // check-repo: allow-secret (made-up value)

  it("logs in, searches with the session and reads the business", async () => {
    const fetch = jest.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(search(found))
    const result = await client(fetch).searchNip("5691868369")

    const [loginCall, searchCall] = fetch.mock.calls as Array<[string, RequestInit]>
    expect(loginCall[0]).toBe("https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc")
    expect(loginCall[1].body).toContain("<ns:pKluczUzytkownika>gus-user-key-0001</ns:pKluczUzytkownika>")
    expect(loginCall[1].body).toContain(
      "<wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj</wsa:Action>"
    )
    expect((searchCall[1].headers as Record<string, string>).sid).toBe("session-1")
    expect(searchCall[1].body).toContain("<dat:Nip>5691868369</dat:Nip>")

    expect(result).toMatchObject({
      source: "gus",
      outcome: "found",
      request_id: null,
      company: {
        name: "JAN & SYN SPÓŁKA JAWNA",
        address: "ul. Stary Rynek 15C/2, 06-500 Mława",
        street: "ul. Stary Rynek 15C/2",
        postal_code: "06-500",
        city: "Mława",
        regon: "382745110",
        legal_form: "legal_entity",
      },
    })
  })

  it("reuses the session for the next search", async () => {
    const fetch = jest.fn().mockResolvedValueOnce(login()).mockResolvedValue(search(found))
    const gus = client(fetch)
    await gus.searchNip("5691868369")
    await gus.searchNip("5691868369")
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it("logs in again when the session expired on the server", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(login())
      .mockResolvedValueOnce(soap("DaneSzukajPodmioty", ""))
      .mockResolvedValueOnce(soap("Zaloguj", "session-2"))
      .mockResolvedValueOnce(search(found))
    const result = await client(fetch).searchNip("5691868369")
    expect(result.outcome).toBe("found")
    expect(((fetch.mock.calls[3] as [string, RequestInit])[1].headers as Record<string, string>).sid).toBe("session-2")
  })

  it("reports businesses that ended their activity and prefers an active entry", async () => {
    const closed = found.replace(
      "<DataZakonczeniaDzialalnosci />",
      "<DataZakonczeniaDzialalnosci>2024-01-31</DataZakonczeniaDzialalnosci>"
    )
    const onlyClosed = jest.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(search(closed))
    expect((await client(onlyClosed).searchNip("5691868369")).outcome).toBe("inactive")

    const both = jest
      .fn()
      .mockResolvedValueOnce(login())
      .mockResolvedValueOnce(search(closed + found))
    expect((await client(both).searchNip("5691868369")).outcome).toBe("found")
  })

  it("reads sole proprietors in villages without street names", async () => {
    const village = record({
      Regon: "123456785",
      Nazwa: "Jan Kowalski",
      Miejscowosc: "Wólka",
      KodPocztowy: "05-500",
      NrNieruchomosci: "7",
      Typ: "F",
      MiejscowoscPoczty: "Piaseczno",
    })
    const fetch = jest.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(search(village))
    const result = await client(fetch).searchNip("5691868369")
    expect(result.company).toMatchObject({ address: "Wólka 7, 05-500 Piaseczno", legal_form: "sole_proprietorship" })
  })

  it("reports a NIP it does not know as not found", async () => {
    const notFound = record({
      ErrorCode: "4",
      ErrorMessagePl: "Nie znaleziono podmiotu dla podanych kryteriów wyszukiwania.",
      ErrorMessageEn: "No data found for the specified search criteria.",
    })
    const fetch = jest.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(search(notFound))
    expect(await client(fetch).searchNip("5691868369")).toMatchObject({ outcome: "not_found", company: null })
  })

  it.each([
    ["a rejected key", [soap("Zaloguj", "")], /did not accept the API key/],
    ["a server error", [new Response("oops", { status: 500 })], /HTTP 500/],
    [
      "another error from the register",
      [login(), search(record({ ErrorCode: "2", ErrorMessageEn: "Too many identifiers" }))],
      /Too many identifiers/,
    ],
  ])("treats %s as unavailable", async (_name, replies, message) => {
    const fetch = jest.fn()
    for (const reply of replies) {
      fetch.mockResolvedValueOnce(reply)
    }
    fetch.mockResolvedValue(new Response("oops", { status: 500 }))
    const result = await client(fetch).searchNip("5691868369")
    expect(result.outcome).toBe("unavailable")
    expect(result.error).toMatch(message)
    expect(result.error).not.toContain("gus-user-key-0001")
  })

  it("parses the register's XML", () => {
    expect(extractResult('<a:ZalogujResult xmlns:a="x">abc</a:ZalogujResult>', "ZalogujResult")).toBe("abc")
    expect(extractResult("<ZalogujResult/>", "ZalogujResult")).toBeNull()
    expect(decodeXml("&lt;a&gt; &amp;amp; &#243; &#xF3;")).toBe("<a> &amp; ó ó")
    expect(parseRecords("<root><dane><A>1</A><B /></dane><dane><A>2</A></dane></root>")).toEqual([
      { A: "1" },
      { A: "2" },
    ])
  })
})
