# Negocjacje cen dla Medusy v2

`@bitshaft/medusa-plugin-negotiations` · [English version](../README.md)

Negocjacje cen B2B. Zalogowany klient prosi o cenę dla produktu, wariantu
albo całego koszyka. Zespół odpowiada w jednym wątku: wiadomością,
kontrofertą z własnym terminem, akceptacją, odmową z powodem albo notatką
wewnętrzną. Uzgodniona cena może stać się szkicem zamówienia w Medusie albo
trafić do koszyka klienta po tej cenie, dokładnie raz.

Panel jest po polsku (domyślnie) i angielsku, w trybie jasnym i ciemnym.

## Instalacja z asystentem AI

Wklej to w Claude Code, Cursora lub innego asystenta w projekcie backendu
Medusy:

```text
Zainstaluj i skonfiguruj @bitshaft/medusa-plugin-negotiations w tym projekcie Medusy v2.

1. Uruchom: npm install @bitshaft/medusa-plugin-negotiations
2. W medusa-config.ts dodaj do `plugins`:
   {
     resolve: "@bitshaft/medusa-plugin-negotiations",
     options: {
       expiryDays: 14,
       allowedCustomerGroups: [/* id albo nazwy grup klientów B2B; puste = każdy zalogowany klient */],
       writers: { draftOrders: false, cart: false },
     },
   }
3. Uruchom: npx medusa db:migrate
4. W sklepie, dla zalogowanych klientów, dodaj „Zapytaj o cenę” na stronie produktu
   (POST /store/negotiations z kind "product", variant_id, quantity, target_unit_price w groszach)
   i na stronie koszyka (kind "cart", cart_id, target_total) oraz stronę w koncie klienta
   z listą GET /store/negotiations i widokiem wątku (wiadomości, akceptacja, wycofanie, dodanie do koszyka).
   Ceny to liczby całkowite w najmniejszej jednostce waluty (grosze). Przy każdym ruchu wysyłaj version,
   którą pokazałeś; przy 409 pokaż zwróconą negocjację.
5. Subskrybuj zdarzenia negotiation.* do e-maili; w e-mailach do klienta używaj tylko pola "customer" z payloadu.
Potem powiedz mi, żebym otworzył Admin → Negocjacje → Przewodnik wdrożenia.
```

## Instalacja w trzech krokach

1. `npm install @bitshaft/medusa-plugin-negotiations`
2. Dodaj wtyczkę do `medusa-config.ts`:

   ```ts
   plugins: [
     {
       resolve: "@bitshaft/medusa-plugin-negotiations",
       options: { allowedCustomerGroups: ["B2B"] },
     },
   ]
   ```

3. `npx medusa db:migrate` i ponowne uruchomienie Medusy.

Potem otwórz w panelu **Negocjacje → Przewodnik wdrożenia**: wszystkie
kroki do produkcji ze statusem wykrytym z Twojego sklepu.

## Opcje

Każda opcja ma wartość domyślną; nic nie blokuje startu Medusy. Błędna
wartość zostawia wtyczkę wyłączoną z jedną linią w logu
(`[negotiations] Disabled: …`).

| Opcja                    | Domyślnie           |                                                                                                         |
| ------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `expiryDays`             | `14`                | Wątek bez ruchu przez tyle dni wygasa. `0` = nigdy. Notatki wewnętrzne się nie liczą                    |
| `acceptedOfferDays`      | `expiryDays` (`14`) | Ile dni klient ma na wykorzystanie uzgodnionej ceny (14 przy `expiryDays: 0`). Widoczne dla klienta     |
| `taxInclusive`           | `false`             | Czy uzgodnione ceny zawierają podatek. Domyślnie netto                                                  |
| `defaultCurrency`        | waluta sklepu       | Waluta wątków o produkt, gdy klient nie poda regionu ani waluty                                         |
| `customerAccept`         | `true`              | Klient może sam zaakceptować kontrofertę. Wyłączone: zespół zamyka po swojej ofercie                    |
| `allowedCustomerGroups`  | `[]`                | Id albo nazwy grup, które mogą negocjować. Puste: każdy zalogowany klient                               |
| `writers.draftOrders`    | `false`             | Pozwala na szkice zamówień z uzgodnionej ceny. Wymaga też uzbrojenia w ustawieniach                     |
| `writers.cart`           | `false`             | Pozwala na uzgodnione pozycje w koszyku klienta. Wymaga też uzbrojenia w ustawieniach                   |
| `limits.openThreads`     | `10`                | Otwarte wątki (otwarte i z kontrofertą) na klienta                                                      |
| `limits.threadsPerHour`  | `5`                 | Nowe wątki na klienta na godzinę                                                                        |
| `limits.messagesPerHour` | `30`                | Wiadomości klienta na godzinę, we wszystkich wątkach                                                    |
| `limits.messageLength`   | `2000`              | Znaki w jednej wiadomości                                                                               |
| `limits.maxQuantity`     | `10000`             | Ilość w jednej pozycji                                                                                  |
| `demo`                   | `false`             | Przykładowe wątki we wszystkich stanach; nie wygasają i nic nie zapisują. Przycisk „Przywróć dane demo” |

Ustawienia w panelu (Negocjacje → Ustawienia, w bazie): dozwolone tryby
kontroferty na cały koszyk (jedna kwota, ceny per pozycja albo obie; zmiana
nie wpływa na wysłane kontroferty), maksymalny rabat bez potwierdzenia i
uzbrajanie każdego zapisu.

## Jak to działa

- **Każdy ruch to jedna warunkowa zmiana** w bazie, sprawdzająca status i
  wersję wątku. Dwie osoby albo osoba i wygasanie nie zamkną wątku dwa razy:
  druga zmiana nie trafia w żaden wiersz i dostaje `409` z aktualnym stanem.
- **Akceptacja niesie cenę, którą widziała strona.** Jeśli w międzyczasie
  się zmieniła, nic nie jest akceptowane: `409 price_changed` z aktualną
  ofertą.
- **Kwoty** to liczby całkowite w groszach z kodem waluty, bez liczb
  zmiennoprzecinkowych. Wiadomości są tylko do dopisywania (baza odrzuca
  zmiany i usunięcia).
- **Cały koszyk.** Klient podaje jedną cenę docelową. Zespół odpowiada jedną
  kwotą albo cenami per pozycja. Jedna kwota jest rozkładana proporcjonalnie
  do wartości katalogowej, w pełnych groszach za sztukę; panel pokazuje
  przed wysłaniem kwotę, która faktycznie wyjdzie (np. „2124,98 zł” zamiast
  wpisanych „2125,00 zł”). Różnica zawsze na korzyść klienta.
- **Cena katalogowa** liczona jak w Store API (region, waluta, grupy klienta,
  więc i cenniki) w chwili wysłania i zamrożona w wątku.
- **Cena minimalna** na wariancie (widżet, per waluta) i opcjonalny
  maksymalny rabat. Kontroferta albo akceptacja poniżej: ostrzeżenie z
  różnicą i wymagane potwierdzenie. Cena minimalna nigdy nie wychodzi do
  klienta.
- **Wygasanie** co godzinę (i przycisk „Wygaś nieaktywne teraz”):
  kontroferta po terminie przepada, a wątek wraca do „otwarte” z ruchem
  zespołu i wiadomością „Kontroferta wygasła”; wątek bez ruchu przez
  `expiryDays` wygasa. Wątki demo nie wygasają.
- **Po akceptacji** (domyślnie wyłączone; każdy zapis wymaga opcji i
  uzbrojenia przez człowieka):
  1. **Szkic zamówienia**: plan (region z kraju domyślnego adresu klienta i
     waluty wątku, a dopiero potem pierwszy region z tą walutą; adres
     domyślny albo sam e-mail; domyślny kanał sprzedaży; wszystko do
     zmiany), próba na sucho, zapis. Dokładnie raz na wątek, z historią.
  2. **Koszyk**: klient dodaje uzgodnione pozycje do swojego koszyka po
     uzgodnionych cenach, oznaczone numerem wątku w metadanych. Ponownie
     tylko po usunięciu pozycji, póki oferta jest ważna i nie powstało z
     nich zamówienie. Ilości są zablokowane, a przy składaniu zamówienia
     wtyczka sprawdza, czy pozycje zgadzają się z ofertą. Szkic i koszyk
     wykluczają się nawzajem.

## Zdarzenia

`negotiation.created`, `negotiation.message_added`,
`negotiation.counter_offered`, `negotiation.accepted`,
`negotiation.rejected`, `negotiation.expired`, `negotiation.withdrawn`,
`negotiation.draft_order_created`, `negotiation.added_to_cart`.

Payload ma zawsze tę samą strukturę (opis pól w
[README.md](../README.md#events)): `id`, `number`, `kind`, `status`, `turn`,
`customer_id`, `currency_code`, `is_demo`, `actor`, `audience`
(`"customer"` albo `"team"` dla notatek), `message_id`, **`customer`**
(tylko dane bezpieczne do pokazania klientowi; `null` dla notatek
wewnętrznych) i **`team`** (prowadzący, kwoty, treść notatki; nigdy do
e-maili dla klienta).

## Store API

Tylko zalogowany klient. Błędy mają `code`, komunikat w języku klienta
(`x-medusa-locale`, potem `Accept-Language`, domyślnie polski) i oba teksty
w `messages: { pl, en }`. Konflikty (`409`) zwracają aktualną negocjację.

- `POST /store/negotiations`: otwarcie wątku (produkt/wariant albo cały koszyk).
- `GET /store/negotiations`, `GET /store/negotiations/:id`: własne wątki, bez notatek wewnętrznych.
- `POST /store/negotiations/:id/messages`: odpowiedź, opcjonalnie z nową ceną docelową.
- `POST /store/negotiations/:id/accept`: akceptacja kontroferty z ceną, którą klient widział.
- `POST /store/negotiations/:id/withdraw`: wycofanie.
- `POST /store/negotiations/:id/add-to-cart`: uzgodnione pozycje do koszyka.

Szczegóły pól: [README.md](../README.md#store-api).

## Admin API

Wszystko pod `/admin/negotiations`: lista, liczniki, wątek, odpowiedź i
notatka, podgląd kontroferty, kontroferta, akceptacja, odmowa, przypisanie,
szkic zamówienia (plan, próba, zapis), wygasanie, dane demo, ustawienia,
historia zapisów, przewodnik i ceny minimalne. Tabela tras:
[README.md](../README.md#admin-api).

## Ograniczenia

- Jedna waluta na wątek. Ceny katalogowe są zamrażane w chwili wysłania.
- Podstawa podatku (`taxInclusive`) jest jedna dla wszystkich uzgodnionych cen.
- Wątek o produkt dotyczy jednego wariantu. Koszyk z pozycjami już
  wynegocjowanymi nie może być negocjowany jako całość.
- Blokady koszyka to middleware na trasach Store API, nie hooki workflow
  (Medusa pozwala na jeden handler na hook, a inne wtyczki z nich
  korzystają). Własny kod zmieniający koszyk bezpośrednio przez workflowy
  nie jest sprawdzany.
- Szkic zamówienia zawiera tylko uzgodnione pozycje; wysyłkę zespół dodaje w
  edytorze szkiców Medusy.
- Wtyczka nie wysyła e-maili; podłącz zdarzenia do swoich powiadomień.
- Limity liczone w bazie nie są dokładne przy wielu równoległych
  zapytaniach jednego klienta.

## Testy

```bash
npm run check             # typy i testy jednostkowe
npm run test:integration  # moduł na Postgresie
npm run test:http         # cała wtyczka w aplikacji Medusy (medusa-config.ts w tym folderze)
```

## Licencja

MIT © Bitshaft
