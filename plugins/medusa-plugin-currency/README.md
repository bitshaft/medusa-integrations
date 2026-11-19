<h1 align="center">Currencies for Medusa</h1>

<p align="center">
  Enter a price once in your base currency and fill the store's other currencies from it:
  NBP exchange rates or a fixed rate, a margin, price-ending rounding and VAT handling,
  always with a preview and never in the background. Polish and English admin.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bitshaft/medusa-plugin-currency"><img alt="npm" src="https://img.shields.io/npm/v/@bitshaft/medusa-plugin-currency"></a>
  <a href="https://github.com/bitshaft/medusa-integrations/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/bitshaft/medusa-integrations/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Medusa" src="https://img.shields.io/badge/medusa-%E2%89%A52.22-7c3aed">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#settings">Settings</a> ·
  <a href="#vat">VAT</a> ·
  <a href="#filling-prices">Filling prices</a> ·
  <a href="#limitations">Limitations</a> ·
  <a href="#po-polsku">Po polsku</a>
</p>

---

## Prompt for your AI assistant

Paste this into your coding assistant in your Medusa backend's repository:

```text
Install and configure @bitshaft/medusa-plugin-currency in this Medusa v2 (>= 2.22) backend.
1. Run `npm install @bitshaft/medusa-plugin-currency`.
2. In medusa-config.ts add to `plugins`:
   { resolve: "@bitshaft/medusa-plugin-currency", options: {} }
   (options are optional: `demo: true` for sample data without writes,
   `maxVariants` to change the 2000-variant limit of one fill).
3. Run `npx medusa db:migrate`, then start the app.
Do not change any prices. Tell me to open Currencies → Settings in the admin to choose
the base currency and the rule of each other currency (rate mode, margin, rounding, VAT).
```

## Requirements

- Medusa **2.22** or newer, Node.js 20.19+ or 22.12+
- At least two currencies in the store (Settings → Store)
- Internet access to `api.nbp.pl` for NBP rates (not needed with fixed rates or in demo mode)

## Installation

1. **Install** the package in your Medusa backend:

   ```bash
   npm install @bitshaft/medusa-plugin-currency
   ```

2. **Register** it in `medusa-config.ts`:

   ```ts
   module.exports = defineConfig({
     // …
     plugins: [
       {
         resolve: "@bitshaft/medusa-plugin-currency",
         options: {
           // all optional
           // demo: true,          // sample rates and products, no NBP calls, no price writes
           // maxVariants: 2000,   // most variants one fill may cover
         },
       },
     ],
   })
   ```

3. **Migrate** the database and start Medusa:

   ```bash
   npx medusa db:migrate
   ```

The plugin needs no keys and no environment variables. "Currencies" appears in the
admin's main menu.

### Options

| Option             | Default                  | What it does                                                                  |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------- |
| `demo`             | `false`                  | Sample rates and sample products; NBP is never asked and no price is written. |
| `provider`         | `"nbp"`                  | Rate source. NBP table A ships; see [Rate sources](#rate-sources).            |
| `nbp.baseUrl`      | `https://api.nbp.pl/api` | Only for a proxy or a test server.                                            |
| `nbp.timeoutMs`    | `10000`                  | Per request to NBP.                                                           |
| `maxVariants`      | `2000`                   | Most variants one fill may cover (a large category is refused with a message). |

Invalid options never stop Medusa: the plugin stays disabled and logs one line,
`[currency] Disabled: …`, and the admin page shows why.

## Settings

Admin → **Currencies → Settings**. Saving settings never changes a price.

- **Base currency**: the currency you enter prices in. Default: the store's default currency.
- **VAT country of base prices**: whose VAT rate base prices carry (default: the first
  country of the base currency's region). Used for net conversion.
- **Each other store currency**, separately:
  - **Fill** on or off.
  - **Rate**: fixed rate (`1 EUR = 4.00 PLN`), NBP rate 1:1, or NBP rate ± margin in
    percent (`+3`, `-1.5`; the converted price is raised or lowered by it).
  - **Rounding**: none (to the minor unit), whole units, to ,99, to ,49 or ,99, to full 5,
    to full 10. Always the nearest allowed price, ties up, never zero. Currencies
    without minor units (HUF, JPY) round price endings to whole units.
  - **VAT**: gross 1:1 or through net (below), and the country whose VAT these prices carry.
  - **Preview**: what 100.00 in the base currency becomes, live while you edit.

Rules are stored per currency, not per fill, so a scheduled update can reuse them later.

### Rates

**Currencies → Rates** shows the NBP table in use with its number and date
(`225/A/NBP/2026` of 19 Nov 2026), when it was checked and when the next one is expected,
and each currency's rate before and after the margin.

- NBP table A (average rates) is fetched once and kept until the next table is due: the
  next working day after 12:30 Warsaw time. Days without quotes (weekends, holidays) keep
  the last table. A check that finds no newer table is not repeated for 30 minutes.
- A base currency other than PLN uses a **cross rate** from the same table:
  `rate(target) / rate(base)`, PLN counting as 1 (e.g. USD base, EUR target:
  `4.4165 / 4.0176 = 1.09928813`). Rates are kept to 8 decimal places.
- When NBP does not answer, the page says so and shows the last saved table with its
  date. A fill can use it only after you click "Use the rates of …"; its rows are marked
  "old rate" and the history records it.

### Rate sources

A rate source is a `RateProvider` (`src/lib/currency/rates/types.ts`): `latest()`,
`on(date)` and `nextExpected(table)`, returning tables of "units of the table's currency
per one unit". Adding the ECB means one class and one line in `rates/index.ts`; the
preview, the cache and the history do not change.

## VAT

Medusa marks prices of each currency (and each region) as gross or net ("Tax inclusive
pricing"). A plain gross-to-gross conversion keeps the gross amount, so when VAT differs
(PL 23 %, DE 19 %) the net price changes. Per currency you choose:

| Base → target | Gross 1:1 (default)                                                         | Through net                                                     |
| ------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| gross → gross | gross converted as it is; **warning** in the preview when VAT rates differ  | base VAT off → convert → target VAT on (the net price is kept)  |
| gross → net   | base VAT taken off                                                          | same                                                            |
| net → gross   | target VAT added                                                            | same                                                            |
| net → net     | converted as it is                                                          | same                                                            |

Example, 123.00 PLN gross at 1 EUR = 4.00 PLN: gross 1:1 gives 30.75 € (net drops from
100 PLN to 25.84 €); through net with DE 19 % gives 29.75 € (25.00 € net).

VAT rates are the countries' default rates from Medusa's Tax module. A region price
carries the VAT of the chosen country when it is in that region, else the region's first
country. Region prices are net unless the region's own preference says gross, as in Medusa.

## Filling prices

Where:

- **Product page**: the "Prices in currencies" card beside the variants shows what is
  missing per currency and has **Fill from PLN** for all variants.
- **Collection / category page**: a button for every product of it (a category includes
  its subcategories).
- **Currencies → Fill prices**: chosen products, a whole collection or a whole category.
  Medusa 2.22's product list has no extension point for bulk actions, so several products
  are filled here.

Options of each fill: which currencies (default all enabled), **only empty prices**
(default) or **also overwrite set prices** (confirmed separately), **prices in price
lists** (off by default; a list is filled from the same list's base price) and **region
prices** (a target region's price from the base currency's region price).

The **preview** lists every price: variant, base price, currency, rate with table and
date, margin, new price, current price (with "manual" or "filled on …") and the action:
add, overwrite, or skip with the reason (no base price, price already set, price already
equal, no current rates, currency not in the table, no VAT rate, …).

**The save writes exactly the preview.** The server computes it again and compares a
fingerprint of every base price, current price, rate and decision. If anything changed
(a price was edited, a new NBP table came out), nothing is written, the response is
HTTP 409 and the admin refreshes the preview. Writes go through Medusa's Pricing module,
so its `pricing.price.*` events fire as for any admin change; a failed save removes the
prices it created and restores the ones it overwrote.

### Suggest prices in Medusa's price editor

Medusa's own price grids (**Edit prices** on a product or variant, the prices step of a
new product, a new variant) get a **Suggest prices** button in their header. Type a price
in any column of a row, press the button, and the plugin computes every other column of
that row under the same rules as a fill (rate, margin, rounding, VAT), including the base
currency and region columns. A row starts from the cell typed last, else from its base
currency price, else from its first filled column. A price typed in another currency is
first taken back to the base currency (the inverse of its rule), then converted.

The panel lists what goes where; only empty cells are filled unless **Also replace prices
already entered** is ticked. The prices are written into the grid as if typed: nothing is
saved until you press Medusa's **Save**, so these saves do not appear in the plugin's
history. Switched-off currencies are left alone. When NBP does not answer, the last saved
table is used and marked.

Medusa has no extension point in these grids, so the button is added to the page from
outside and relies on the dashboard's markup. If a Medusa update changes it, the button
does not appear and the grid works as before.

### History and price origin

Every save records who, when, what (products, currencies), the options, and per currency
the mode, rate, margin, table number and date, plus how many prices were added,
overwritten and skipped (by reason). **Currencies → History** lists them; a row opens
every price written.

Next to each price (product page Integrations card → Currencies, and the variant page)
the plugin shows where it came from: **filled on <date> at <rate>** while the price still
has the amount written, otherwise **manual**.

### Event for other plugins

Each save emits **`currency.prices_filled`** (never in demo mode):

```ts
{
  run_id, actor_id, base_currency,
  rates: { eur: { mode, rate, margin, effective, provider, table, date } },
  counts: { added, overwritten, skipped },
  prices: [{ price_id, variant_id, product_id, currency_code, price_list_id, region_id,
             action, amount, previous_amount, base_amount }],
}
```

A plugin that keeps a price history (for example Omnibus in
[`@bitshaft/medusa-plugin-compliance`](../medusa-plugin-compliance/README.md)) can
subscribe to it by name and treat these changes as exchange-rate changes, not promotions.
There is no dependency between the packages.

### Admin API

All under `/admin/currency`, authenticated as an admin user: `GET status`,
`GET|POST settings`, `GET rates?refresh=true`, `POST sample`, `POST preview`,
`POST apply` (body of the preview plus `fingerprint` and, when overwriting,
`confirm_overwrite: true`), `POST suggest` (`{ rows: [{ key, slot, amount }] }`, writes nothing), `GET runs`, `GET runs/:id`, `GET products/:id`.

## Demo mode

`demo: true` shows the whole flow on sample rates (table `DEMO/A/NBP`) and sample
products ("Sample products" in Fill prices), and on your real products too. NBP is never
asked and no price is written; saves appear in the history marked "Demo". A "Demo"
badge and bar are shown on every screen.

## Limitations

- Nothing runs on a schedule: rates do not update prices by themselves (planned; the
  rules and the price origins are stored so a daily job can be added without changes).
- Prices with rules other than `region_id` (customer groups, …) are neither a source nor
  a target. Quantity tiers are filled tier by tier.
- One fill covers at most `maxVariants` variants.
- A price list with only a region price in the base currency is filled per region, not as
  a currency price.
- Between the check and the write of a save, a concurrent edit of the same price is not
  locked; the next preview shows the result.
- NBP rates are read from the API's JSON numbers, which carry at most 6 decimals; all
  arithmetic after that is decimal.

## Testing

```bash
npm run check              # typecheck and unit tests (modes, cross rates, rounding, VAT, NBP days)
npm run test:integration   # the module against Postgres (DB_HOST, DB_USERNAME, DB_PASSWORD)
npm run test:http          # the whole plugin in a Medusa app, NBP replaced by a fake
```

---

## Po polsku

**Waluty** w adminie Medusy: wpisujesz cenę raz, w walucie bazowej (np. PLN), a plugin
wylicza ceny w pozostałych walutach sklepu według Twoich zasad. Nic nie dzieje się
samo w tle: każdy zapis uruchamia admin i poprzedza go podgląd.

### Instalacja w trzech krokach

1. `npm install @bitshaft/medusa-plugin-currency`
2. W `medusa-config.ts`: `plugins: [{ resolve: "@bitshaft/medusa-plugin-currency", options: {} }]`
   (opcjonalnie `demo: true` albo `maxVariants`).
3. `npx medusa db:migrate` i uruchom Medusę. W menu pojawi się „Waluty”.

Bez kluczy i bez zmiennych środowiskowych. Błędne opcje nie zatrzymują Medusy: plugin
się wyłącza i pisze jedną linię w logu.

### Ustawienia (Waluty → Ustawienia)

- **Waluta bazowa** (domyślnie domyślna waluta sklepu) i **kraj VAT cen bazowych**.
- Dla każdej innej waluty osobno:
  - tryb: stały kurs (1 EUR = 4,00 PLN), kurs NBP 1:1 albo kurs NBP ± marża w %;
  - zaokrąglenie: bez, do pełnych, do ,99, do ,49 lub ,99, do pełnych 5 lub 10;
  - VAT: brutto 1:1 albo przez netto, oraz kraj, którego stawkę mają te ceny;
  - podgląd: ile wyjdzie z 100,00 w walucie bazowej, na żywo przy edycji.

Zapis ustawień nie zmienia żadnej ceny.

### Kursy

Tabela A NBP (kursy średnie) zawsze z numerem i datą tabeli. Plugin trzyma ją w cache
do następnego dnia roboczego po 12:30. W weekendy i święta zostaje ostatnia tabela.
Gdy waluta bazowa nie jest PLN, liczy kurs krzyżowy z tej samej tabeli. Gdy NBP nie
odpowiada, widzisz komunikat i możesz świadomie użyć ostatniej zapisanej tabeli, wyraźnie
oznaczonej datą.

### Zasady podatku

Jeśli ceny po obu stronach są brutto, a stawki VAT różne (PL 23 %, DE 19 %), „brutto 1:1”
zachowuje kwotę brutto, więc zmienia się cena netto. Podgląd pokazuje wtedy ostrzeżenie.
„Przez netto” zdejmuje VAT kraju bazowego, przelicza i dolicza VAT kraju docelowego.
Przy bazie brutto i celu netto VAT jest zawsze zdejmowany, a przy bazie netto i celu
brutto zawsze doliczany. Przykład: 123,00 zł brutto przy kursie 4,00 daje 30,75 € (brutto
1:1) albo 29,75 € (przez netto, DE 19 %).

### Uzupełnianie cen

- **Strona produktu**: karta „Ceny w walutach” z przyciskiem „Uzupełnij z PLN” dla
  wszystkich wariantów.
- **Strona kolekcji i kategorii**: przycisk dla całej kolekcji lub kategorii (razem
  z podkategoriami).
- **Waluty → Uzupełnij ceny**: wybrane produkty, cała kolekcja albo cała kategoria.
  Lista produktów w Medusie 2.22 nie pozwala dodać akcji zbiorczej.

Opcje: które waluty, tylko puste ceny (domyślnie) albo nadpisanie także istniejących
(z osobnym potwierdzeniem), ceny w cennikach (domyślnie wyłączone) i ceny regionów.
Podgląd pokazuje wariant, cenę bazową, walutę, kurs z datą, marżę, nową i obecną cenę
oraz akcję: dodaj, nadpisz albo pomiń z powodem. **Zapisuje się dokładnie to, co
w podglądzie.** Jeśli w międzyczasie zmieniła się cena bazowa albo kurs, nic się nie
zapisuje, a podgląd się odświeża.

### Podpowiedź cen w edytorze cen Medusy

Edytory cen Medusy (**Edytuj ceny** produktu i wariantu, krok cen przy tworzeniu produktu,
nowy wariant) mają w nagłówku przycisk **Podpowiedz ceny**. Wpisz cenę w dowolnej kolumnie
wiersza i kliknij przycisk: plugin policzy pozostałe kolumny tego wiersza według tych
samych zasad co uzupełnianie (kurs, marża, zaokrąglenie, VAT), łącznie z walutą bazową
i regionami. Źródłem jest komórka wpisana ostatnio, a jeśli nic nie wpisano, cena w walucie
bazowej. Domyślnie wypełniane są tylko puste komórki; opcja „Zastąp też ceny już wpisane”
nadpisuje pozostałe. Ceny trafiają do tabeli jak wpisane ręcznie i zapisują się dopiero
przyciskiem **Zapisz** Medusy, więc nie trafiają do historii pluginu.

Medusa nie ma w tych tabelach miejsca na rozszerzenia, więc przycisk jest doklejany do
strony z zewnątrz. Jeśli aktualizacja Medusy zmieni jej budowę, przycisk się nie pokaże,
a tabela będzie działać jak dotąd.

### Historia i pochodzenie ceny

Każde uzupełnienie trafia do historii: kto, kiedy, zakres, tryb i kurs dla każdej waluty
(z numerem i datą tabeli), liczba dodanych, nadpisanych i pominiętych cen. Przy cenie
wariantu widać, skąd jest: „uzupełniona dnia X kursem Y” albo „ręcznie”.

Każdy zapis emituje zdarzenie `currency.prices_filled`. Plugin Zgodność (Omnibus) może
z niego korzystać, żeby zmiany cen z kursu nie liczyły się jako promocja. Między pakietami
nie ma zależności.

### Tryb demo

Opcja `demo: true` daje pokazowe kursy i produkty oraz pełny podgląd. Plugin nie wysyła
żadnych zapytań do NBP i nie zapisuje cen. Na każdym ekranie widać znacznik „Demo”.

### Ograniczenia

- Brak automatycznej aktualizacji cen (planowana; ustawienia są na nią gotowe).
- Ceny z regułami innymi niż region (np. grupy klientów) są pomijane.
- Jedno uzupełnienie obejmuje najwyżej `maxVariants` wariantów (domyślnie 2000).
- Kursy NBP przychodzą jako liczby JSON (do 6 miejsc po przecinku). Wszystkie dalsze
  obliczenia są dziesiętne, bez liczb zmiennoprzecinkowych.

## License

MIT © Bitshaft
