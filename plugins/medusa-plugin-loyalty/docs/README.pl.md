# Program lojalnościowy dla Medusy v2

`@bitshaft/medusa-plugin-loyalty` · [English version](../README.md)

Punkty za zamówienia i akcje, nagrody za punkty, poziomy klientów,
wygasanie i pełna historia każdego punktu. Dla właściciela sklepu: każda
zasada programu to ustawienie na stronie w panelu, po polsku i angielsku.

**Wszystko opiera się na księdze punktów.** Każda zmiana salda to osobny,
niezmienny wpis: typ, punkty (+/−), powiązanie (zamówienie, nagroda, kod),
opis, kto i kiedy. Saldo zawsze wynika z księgi. Wpisów nie można edytować
ani usuwać (nie pozwala na to trigger w bazie); błędy poprawia się korektą.
Każdy zapis ma klucz idempotencji, więc to samo zdarzenie nigdy nie nalicza
punktów dwa razy, a każda zmiana salda blokuje konto klienta, więc dwie
równoczesne wymiany nie wydadzą tych samych punktów.

## Wymagania

- Medusa `^2.22.0` (testowane z 2.22.3)
- Node.js `^20.19.0 || >=22.12.0`

## Instalacja

```bash
npm install @bitshaft/medusa-plugin-loyalty
```

```ts
// medusa-config.ts
module.exports = defineConfig({
  plugins: [
    {
      resolve: "@bitshaft/medusa-plugin-loyalty",
      options: {
        // obie opcjonalne; to wartości domyślne
        timeZone: "Europe/Warsaw",
        defaultLocale: "pl",
      },
    },
  ],
})
```

```bash
npx medusa db:migrate
```

Strona pojawia się w **Lojalność** w głównym menu, a na stronie
każdego klienta widżet.

## Konfiguracja

Opcje wtyczki są tylko techniczne: `timeZone` (domyślnie `Europe/Warsaw`)
i `defaultLocale` (`pl`). Błędne opcje nie blokują startu Medusy: wtyczka
zostaje wyłączona i zapisuje jedną linię w logu.

Wszystko inne ustawia właściciel sklepu w zakładce Ustawienia: włączenie
programu, przelicznik (X pkt za Y zł), podstawa brutto/netto, akcje
(rejestracja, pierwsze zamówienie, urodziny, newsletter: włącz/wyłącz i
punkty), zasady zmiany daty urodzin, poziomy (nazwa, próg wydatków, mnożnik,
jednorazowy bonus, okres liczenia wydatków), wygasanie (po ilu miesiącach,
przypomnienie ile dni wcześniej), zwrot punktów za niewykorzystane kody, po
ilu dniach zwolnić gratis z porzuconego koszyka, wykluczone grupy klientów i
link do regulaminu.

Zmienne środowiskowe: `LOYALTY_NEWSLETTER_EVENT` (nazwa zdarzenia zapisu
do newslettera, domyślnie `newsletter.subscribed`) i
`LOYALTY_DISABLE_HOOKS=line-item` (patrz [hooki](#workflowy-i-hooki)).

## Jak to działa

- **Naliczanie** po pełnym opłaceniu zamówienia: produkty po rabatach,
  brutto lub netto, bez dostawy i gratisów, razy przelicznik i mnożnik
  poziomu, zaokrąglone w dół. Raz na zamówienie.
- **Pierwsze zamówienie**: bonus przy pierwszym opłaconym zamówieniu,
  odbierany przy anulowaniu.
- **Zwroty** (`order.return_received`): odbierana jest część punktów
  przypadająca na zwrócone sztuki, wg ich wartości z chwili zakupu (nie wg
  zwróconych pieniędzy).
- **Anulowanie**: odbierane jest wszystko; gratisy z tego zamówienia oddają
  punkty.
- **Ujemne saldo** jest dozwolone, blokuje wymianę i spłacają je kolejne
  punkty.
- **Akcje**: rejestracja i newsletter raz na klienta, urodziny raz w roku i nie częściej niż co 330 dni (zmiana daty o dzień po bonusie nic nie daje).
- **Waluta** kwot programu to jedna z walut sklepu, domyślnie jego waluta domyślna. Dla innych walut sklepu admin ustawia przelicznik (np. 1 EUR = 4,30 zł); zamówienia w walucie bez przelicznika nie dają punktów.
- **Poziomy**: po każdym opłaconym zamówieniu i zwrocie oraz codziennie;
  zmiana zapisuje się w historii i emituje `loyalty.tier_changed`.
- **Wygasanie**: całe dodatnie saldo po N miesiącach bez zamówienia ani
  wymiany; N dni wcześniej `loyalty.points_expiring`.
- **Nagrody kodem** (rabat kwotowy, procentowy, darmowa dostawa):
  jednorazowy kod `LOY-XXXXXXXX` w Promotion Module, tylko dla tego klienta
  (reguła `customer.id`), z datą ważności.
- **Gratis**: po sprawdzeniu stanu w kanale sprzedaży koszyka wariant
  trafia do otwartego koszyka klienta za 0 zł. Usunięcie go przed
  zamówieniem oddaje punkty; ilość zawsze 1.

Goście nie zbierają punktów. Klienci z wykluczonych grup nie zbierają ani
nie wymieniają.

## Store API

Wszystko pod `/store/loyalty`; szczegóły i przykłady w
[README.md](../README.md#store-api). Odmowy mają `code` i komunikat po
polsku i angielsku. Każdą zasadę sprawdza serwer.

- `GET /me`: saldo, poziom, ile do następnego poziomu, data wygaśnięcia, gotowe teksty
- `GET /history`: historia punktów (stronicowana)
- `GET /rewards`: katalog z informacją, czy klienta stać
- `POST /rewards/:id/redeem`: zwraca kod albo zaktualizowany koszyk
- `GET /estimate?amount=` lub `?cart_id=`: ile punktów da produkt lub koszyk
- `GET /terms`: link do regulaminu (sklep pokazuje go klientom; wtyczka nie tworzy strony regulaminu)
- `POST /birthday`: data urodzin

## Zdarzenia

`loyalty.points_earned`, `loyalty.points_redeemed`,
`loyalty.points_reverted`, `loyalty.points_expiring`,
`loyalty.points_expired`, `loyalty.tier_changed`,
`loyalty.reward_redeemed`. Payloady są opisane w
[README.md](../README.md#events). Wtyczka nie wysyła maili.

## Workflowy i hooki

Workflowy `redeem-loyalty-code` i `redeem-loyalty-gift` cofają się krok po
kroku przy błędzie (punkty wracają wpisem korygującym). Jedyny hook to
`updateLineItemInCartWorkflow.hooks.validate` (ilość gratisu = 1). Wtyczka
nie używa hooków promocji ani finalizacji koszyka, więc działa obok
`@bitshaft/medusa-plugin-coupons`.

## Czego nie robi

- Nie ma komponentów sklepu i nie wysyła maili.
- Refund bez zwrotu towaru nie odbiera punktów (punkty idą za sztukami).
- Edycje, wymiany i reklamacje po opłaceniu nie są przeliczane.
- Kod nagrody użyty w zamówieniu, które potem anulowano, nie wraca.
- Punkty naliczają się dopiero po pełnym pobraniu płatności.
- „Pierwsze zamówienie” patrzy na zamówienia konta klienta; wcześniejsze
  zamówienia jako gość się nie liczą.

## Testy

```bash
npm run check
npm run test:integration   # potrzebny Postgres: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD
```

## Licencja

MIT © Bitshaft
