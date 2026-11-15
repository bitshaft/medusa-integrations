# Stripe w panelu Medusy v2

`@bitshaft/medusa-plugin-stripe` · [English version](../README.md)

Dane ze Stripe w panelu Medusy, obok **oficjalnego** providera płatności
Stripe: obrót, opłaty i netto per waluta, skuteczność płatności według
metody, płatności z zamówieniami (i opłacone płatności, z których nie
powstało zamówienie), wypłaty rozbite na zamówienia, otwarte spory z
terminami oraz kontrole konfiguracji z instrukcją naprawy.

**Tylko odczyt, wymuszony w kodzie.** Klient Stripe w tej wtyczce ma jedną
metodę (GET) i listę dozwolonych ścieżek; każda inna metoda lub ścieżka
rzuca błąd, zanim cokolwiek zostanie wysłane. Żadna ścieżka kodu nie może
przechwycić płatności, zrobić zwrotu ani wypłaty. Płatności i zwroty
obsługuje dalej `@medusajs/medusa/payment-stripe`.

## Instalacja z asystentem AI

Wklej to w Claude Code, Cursora lub innego asystenta w projekcie backendu
Medusy:

```text
Zainstaluj i skonfiguruj @bitshaft/medusa-plugin-stripe w tym projekcie Medusy v2.

1. Uruchom: npm install @bitshaft/medusa-plugin-stripe
2. W medusa-config.ts dodaj do `plugins`:
   {
     resolve: "@bitshaft/medusa-plugin-stripe",
     options: {
       apiKey: process.env.STRIPE_INSIGHTS_API_KEY,
       storefrontDomains: [/* domeny sklepu, np. "sklep.pl" */],
       mode: process.env.STRIPE_INSIGHTS_MODE as "live" | "test" | undefined,
     },
   }
   Nie zmieniaj istniejącego providera @medusajs/medusa/payment-stripe; ta
   wtyczka tylko czyta Stripe. Jeśli `id` tego providera nie jest "stripe",
   dodaj do opcji `providerId: "<to id>"`.
3. Dodaj STRIPE_INSIGHTS_API_KEY= i STRIPE_INSIGHTS_MODE=test do .env.template
   (i pusto do .env). Nie wymyślaj klucza i nigdy go nie commituj.
4. Poproś mnie o utworzenie w Stripe klucza *ograniczonego* z Read dla:
   Balance, Balance transactions, Payouts, Disputes, PaymentIntents,
   Charges, Refunds, Events, Webhook Endpoints, Payment Method Domains,
   Payment Method Configurations, Account; i None dla reszty.
5. Uruchom sprawdzenie typów i build projektu. Nie uruchamiaj migracji dla
   tej wtyczki: nie ma żadnych.
Potem powiedz mi, żebym otworzył Admin → Stripe → Kontrole.
```

## Instalacja w trzech krokach

1. `npm install @bitshaft/medusa-plugin-stripe`
2. Dodaj wtyczkę do `medusa-config.ts` (oficjalny provider zostaje bez zmian):

   ```ts
   plugins: [
     {
       resolve: "@bitshaft/medusa-plugin-stripe",
       options: {
         apiKey: process.env.STRIPE_INSIGHTS_API_KEY,
         storefrontDomains: ["sklep.pl"],
       },
     },
   ]
   ```

3. Utwórz klucz ograniczony (niżej), wpisz go do `STRIPE_INSIGHTS_API_KEY`,
   uruchom ponownie Medusę i otwórz w panelu **Stripe → Kontrole**.

Bez migracji: wtyczka niczego nie zapisuje.

## Opcje

| Opcja                | Domyślnie |                                                                                                        |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `apiKey`             | —         | Klucz Stripe, najlepiej ograniczony (`rk_live_…`). Wymagany, chyba że `demo`. Z zmiennej środowiskowej |
| `demo`               | `false`   | Dane pokazowe na każdej zakładce i **zero zapytań do Stripe**                                          |
| `providerId`         | `stripe`  | `id` oficjalnego providera w medusa-config (rejestrowany jako `pp_stripe_<id>`)                        |
| `backendUrl`         | —         | Publiczny adres backendu do kontroli webhooka; domyślnie `admin.backendUrl` albo `MEDUSA_BACKEND_URL`  |
| `storefrontDomains`  | `[]`      | Domeny sprawdzane dla Apple Pay i Google Pay                                                           |
| `cacheSeconds`       | `300`     | Jak długo odpowiedzi Stripe są używane ponownie                                                        |
| `mode`               | —         | Oczekiwany tryb klucza: `live` albo `test`. Bez niej: live przy `NODE_ENV=production`, inaczej test    |
| `orphanGraceMinutes` | `30`      | Opłacona płatność bez zamówienia jest oznaczana dopiero po tylu minutach                               |

Bez klucza (i bez `demo`) wtyczka zostaje wyłączona i zapisuje jedną linię w
logu; Medusa startuje normalnie, a panel pokazuje Kontrole i Przewodnik.
Zły klucz to niezaliczona kontrola, nie błąd.

## Uprawnienia klucza

Używaj **klucza ograniczonego**, nie pełnego klucza tajnego (kontrola
ostrzega przy `sk_`). **Read** dla: Balance, Balance transactions, Payouts,
Disputes, PaymentIntents, Charges (z Refunds), Events, Webhook Endpoints,
Payment Method Domains, Payment Method Configurations, Account. Reszta:
**None**. Brak uprawnienia to ostrzeżenie „brak uprawnienia” przy jednej
kontroli, nie błąd. Do czego służy każde uprawnienie: [README.md](../README.md#key-permissions).

Klucz trafia tylko do nagłówka `Authorization`, jest maskowany w logach i
błędach i nigdy nie wraca z API admina: panel widzi tylko rodzaj
(`sk`/`rk`), tryb (live/test) i 4 ostatnie znaki.

## Dozwolone ścieżki

Lista w [README.md](../README.md#allowed-stripe-paths). Każda inna metoda
lub ścieżka rzuca błąd przed wysłaniem zapytania.

## Jak to działa

- **Tylko na żądanie**: odczyt, gdy ktoś otworzy zakładkę albo naciśnie
  Odśwież. Nic w tle.
- **Cache i łączenie zapytań**: odpowiedzi są używane ponownie przez
  `cacheSeconds`; kilku adminów naraz to jedno zapytanie do Stripe.
- **Budżet czasu**: 25 s na stronę; po przekroczeniu panel pokazuje częściowe
  dane z komunikatem.
- **Limit 1000 pozycji na listę**: gdy limit przytnie dane, komunikat jest
  przy każdej sumie („suma z pierwszych 1000 pozycji, dane niepełne”), a
  eksport CSV zaczyna się od wiersza z ostrzeżeniem.
- **Pieniądze**: liczby całkowite w groszach, sumy osobno dla każdej waluty,
  formatowanie dopiero w panelu („255,00 zł”).
- **Zamówienia**: oficjalny provider zapisuje id sesji płatności Medusy w
  metadanych PaymentIntentu (`session_id`); wtyczka idzie sesja → zbiór
  płatności → zamówienie, a zapasowo szuka płatności Medusy z id
  PaymentIntentu.

## Panel i widżet

Zakładki **Panel, Płatności, Wypłaty, Spory, Kontrole, Przewodnik** oraz
widżet na stronie zamówienia (status, metoda, kwota, opłata, netto, kurs
wymiany, 3D Secure, Radar, zwroty, spory, wypłata, link do Stripe). Opis
każdej zakładki i trasy API admina: [README.md](../README.md#admin).

## Ograniczenia

- Jedno konto Stripe i jeden klucz; Stripe Connect nie jest obsługiwany.
- Maksymalnie 1000 pozycji na listę i 25 s na stronę; dłuższe okresy dają
  wyraźnie oznaczone niepełne dane.
- Skład wypłaty Stripe podaje tylko dla wypłat automatycznych.
- Wypłata zamówienia jest szukana wśród pierwszych trzech wypłat
  automatycznych po dacie dostępności środków.
- „Skuteczność płatności” liczy obciążenia (próby); PaymentIntent bez próby
  obciążenia się nie liczy.
- Kontrola trybu przechwytywania porównuje ostatnie 20 PaymentIntentów z
  opcją `capture` providera; inna aplikacja na tym samym koncie może dać
  ostrzeżenie.
- Nieudane dostawy webhooków pochodzą ze zdarzeń Stripe i nie są
  rozbijane na endpointy.
- Cache jest osobny dla każdego procesu serwera.

## Testy

```bash
npm run check
```

## Licencja

MIT © Bitshaft. Stripe jest znakiem towarowym Stripe, Inc.
