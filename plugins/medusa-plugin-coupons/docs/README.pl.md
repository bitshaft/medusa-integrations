# Kupony dla Medusy v2

`@bitshaft/medusa-plugin-coupons` · [English version](../README.md)

Panel kuponów dla właściciela sklepu, zbudowany na module promocji Medusy
(Promotion Module). Każdy kupon jest opisany jednym pełnym zdaniem, tworzony
w kreatorze w trzech krokach z podglądem na żywo i może mieć zasady, których
moduł promocji nie ma: limit na klienta, tylko pierwsze zamówienie, brak
łączenia z innymi kuponami, wykluczenia, progi i paczki kodów jednorazowych.

**Rabat zawsze nalicza Medusa.** Wtyczka tworzy zwykłe promocje i kampanie
Medusy, a własne zasady zapisuje jako reguły promocji na kilku dodatkowych
atrybutach kontekstu. Rabaty trafiają do koszyków i zamówień jako standardowe
korekty (adjustments), więc inne wtyczki (np. historia cen Omnibus) odczytują
je w zwykły sposób.

## Wymagania

- Medusa `^2.22.0` (testowane z 2.22.3)
- Node.js `^20.19.0 || >=22.12.0`

## Instalacja

```bash
npm install @bitshaft/medusa-plugin-coupons
```

```ts
// medusa-config.ts
module.exports = defineConfig({
  plugins: [
    {
      resolve: "@bitshaft/medusa-plugin-coupons",
      options: {
        // wszystkie opcje są opcjonalne; to wartości domyślne
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

Strona pojawia się w panelu w **Extensions → Kupony**.

## Konfiguracja

Żadna opcja nie jest wymagana. Błędne opcje nigdy nie blokują startu Medusy:
wtyczka zostaje wyłączona, zapisuje jedną linię w logu (`[coupons] Disabled: …`),
a strona w panelu pokazuje powód.

| Opcja                     | Domyślnie       | Znaczenie                                                                      |
| ------------------------- | --------------- | ------------------------------------------------------------------------------ |
| `timeZone`                | `Europe/Warsaw` | Strefa czasowa dat w zdaniach i eksportach oraz liczenia „kończy się w 7 dni”. |
| `defaultLocale`           | `pl`            | Język komunikatów dla klienta, gdy żądanie go nie podaje (`pl` lub `en`).      |
| `maxBatchSize`            | `5000`          | Najwięcej kodów w jednej paczce (do 20 000).                                   |
| `checkRateLimitPerMinute` | `20`            | Zapytań na minutę od jednego odwiedzającego do `/store/coupons/check`.         |
| `settings.currencyCode`   | `pln`           | Waluta nowych kuponów kwotowych i minimalnego koszyka.                         |
| `settings.codeLength`     | `10`            | Długość losowych kodów w paczkach, bez prefiksu.                               |
| `settings.exportLocale`   | `pl`            | Język eksportu CSV.                                                            |

Wartości `settings` można też zmienić w zakładce Ustawienia; zapisywane jest
tylko to, co zmienione.

Zmienna środowiskowa `COUPONS_DISABLE_HOOKS` (`cart-promotions`,
`complete-cart` lub obie po przecinku) wyłącza rejestrację hooków; patrz
[hooki](#workflowy-hooki-i-zdarzenia).

## Co robi rdzeń, a co wtyczka

| Funkcja                                                  | Kto                      | Jak                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rabat procentowy, kwotowy, darmowa dostawa               | Rdzeń                    | Standardowa promocja na pozycjach z alokacją `across` (tak rdzeń liczy cel „zamówienie”, ale z dozwolonymi regułami celu) lub na metodach dostawy.                                         |
| Rabat na kategorię                                       | Rdzeń                    | Reguła celu na kategoriach pozycji.                                                                                                                                                        |
| Kup X, dostań Y                                          | Rdzeń                    | Promocja `buyget` z regułami zakupu, `buy_rules_min_quantity` i `apply_to_quantity`.                                                                                                       |
| Daty (zaplanowany, zakończony)                           | Rdzeń                    | `starts_at` / `ends_at` kampanii promocji.                                                                                                                                                 |
| Łączny limit użyć                                        | Rdzeń                    | `promotion.limit`, liczony przez rdzeń przy składaniu zamówienia z blokadą wierszy. Kupony z progami mają wspólny budżet `usage` kampanii.                                                 |
| Wstrzymaj / wznów                                        | Rdzeń                    | Status promocji `inactive` / `active`.                                                                                                                                                     |
| Minimalny koszyk (brutto, przed rabatami)                | Rdzeń                    | Reguła `original_item_total >= min`. Nie `item_total`, który jest po rabacie i wyłączałby kupon po jego naliczeniu.                                                                        |
| Dla kogo: grupy, wybrani klienci                         | Kontekst wtyczki + rdzeń | Hook `setPromotionContext` dodaje `coupons_customer.{id,group_ids}`, kupon ma regułę `in`.                                                                                                 |
| Tylko pierwsze zamówienie                                | Kontekst wtyczki + rdzeń | Hook dodaje `coupons_customer.first_order` (brak wcześniejszych zamówień po id klienta, a u gości po e-mailu; bez anulowanych i szkiców).                                                  |
| Wykluczenia (produkty, kolekcje, kategorie, przecenione) | Kontekst wtyczki + rdzeń | Hook daje każdej pozycji `coupons_keys` (`p:…`, `c:…`, `k:…`, `sale` gdy `compare_at_unit_price` jest wyższa od ceny, oraz `*`, żeby atrybut zawsze istniał); kupon ma jedną regułę `ne`.  |
| Nie łączy się                                            | Wtyczka                  | Dodanie kodu obok kuponu, który się nie łączy (lub odwrotnie), jest odrzucane z powodem. Kupony automatyczne wtyczki ustępują przez reguły.                                                |
| Progi                                                    | Wtyczka + rdzeń          | Jedna automatyczna promocja na poziom, ograniczona do swojego pasma koszyka, więc działa dokładnie najwyższy poziom. Z kodem poziomy otwiera kod zapisany w `cart.metadata.coupons_codes`. |
| Limit na klienta                                         | Wtyczka                  | Liczy wcześniejsze zamówienia z kuponem po id klienta, a u gości po e-mailu. Sprawdzany przy dodaniu kodu i ponownie przed złożeniem zamówienia.                                           |
| Paczki kodów jednorazowych                               | Rdzeń + wtyczka          | Jedna promocja na kod z `limit: 1` w jednej kampanii; wtyczka generuje unikalne kody, pokazuje, który i w jakim zamówieniu użyto, eksportuje CSV.                                          |
| Opis jednym zdaniem                                      | Wtyczka                  | Generowany z ustawień po polsku i angielsku: lista, kreator, eksport.                                                                                                                      |
| Statystyki i eksport CSV                                 | Wtyczka                  | Zamówienia z linku Medusy `order_promotion`, rabat z korekt.                                                                                                                               |

Własne dane wtyczka trzyma w module `coupons`, powiązanym z promocjami przez
module link (`coupons_coupon` ↔ `promotion`).

## Panel

**Panel**: karty (wszystkie, aktywne, zaplanowane, zamówienia z kuponem w 30
dni z sumą rabatu, kończące się w 7 dni, automatyczne), filtry z licznikami,
wyszukiwanie po kodzie i lista z opisem jednym zdaniem, użyciami, rabatem,
zamówieniami i obrotem. Akcje: edytuj, wstrzymaj/wznów, duplikuj (wstrzymana
kopia), otwórz w promocjach Medusy, usuń. Kliknięcie wiersza pokazuje
zamówienia z kuponem, a dla paczki jej kody.

**Kreator**: rodzaj → dla kogo → zasady, z panelem po prawej: tak zobaczy go
klient, jednym zdaniem, podsumowanie, gotowość kroków i ostrzeżenia przed
zapisem (nakładanie się z aktywnym kuponem automatycznym, kod zajęty, koniec
przed początkiem, rabat 100% lub nie mniejszy niż minimalny koszyk, kupon
automatyczny bez warunków). Edycja zachowuje liczniki; kodu, rodzaju, trybu
automatycznego i liczby progów nie można zmienić (do tego służy duplikowanie).

**Przewodnik** wyjaśnia zasady prostym językiem. **Ustawienia** pokazują
opcje i pozwalają zmienić walutę, długość kodów i język eksportu.

## Store API

Wtyczka nie zawiera komponentów sklepu. Kody dodaje się i usuwa standardowymi
endpointami Medusy (`POST` / `DELETE /store/carts/{id}/promotions`), a wtyczka
sprawdza je po drodze. Odrzucony kod zwraca `400` z powodem po polsku i
angielsku, np.
`Ten kupon jest tylko na pierwsze zamówienie. / This coupon is only for your first order.`
Kupon z progami usuwa się kodem, który wpisał klient.

**Sprawdzenie kodu przed dodaniem**: `POST /store/coupons/check` z
`{ "cart_id", "code", "locale" }`. Odpowiedź `valid: true` z opisem,
`valid: false` z `reason`, `message` (w języku klienta), `messages` (oba
języki) i `min_subtotal`, albo `valid: null` dla promocji spoza wtyczki.
Powody: `not_found`, `not_started`, `ended`, `paused`, `exhausted`,
`email_required`, `audience`, `first_order`, `per_customer_limit`,
`min_subtotal`, `exclusive_conflict`.

**Postęp do progu lub darmowej dostawy**: `GET /store/coupons/progress?cart_id=…`
zwraca osiągnięty próg, następny próg z brakującą kwotą (`remaining`) oraz
najbliższą darmową dostawę. Obejmuje kupony z progami wpisane w koszyku i
oferty automatyczne dla wszystkich; kupony dla grup, wybranych klientów i na
pierwsze zamówienie są pomijane. Przykłady odpowiedzi są w [README.md](../README.md#store-api).

## Workflowy, hooki i zdarzenia

Workflowy: `create-coupons-coupon`, `update-coupons-coupon`,
`set-coupons-coupon-status`, `delete-coupons-coupon`
(`@bitshaft/medusa-plugin-coupons/workflows`).

Zdarzenie `bitshaft.coupons.batch_created` po utworzeniu paczki:
`{ "batch_id", "coupon_id", "prefix", "quantity" }`. Wtyczka newslettera
może wtedy pobrać kody z `GET /admin/coupons/{batch_id}/codes`.

Wtyczka rejestruje hooki `updateCartPromotionsWorkflow` (`validate`,
`setPromotionContext`) i `completeCartWorkflow` (`validate`). Medusa pozwala
na jeden handler na hook: jeśli aplikacja ma już własny, ustaw
`COUPONS_DISABLE_HOOKS` i wywołaj handler wtyczki
(`@bitshaft/medusa-plugin-coupons/hooks`) ze swojego; przykład w
[README.md](../README.md#workflows-hooks-and-events).

## Czego nie robi

- Nie ma komponentów sklepu; służy do tego Store API.
- Nie obsługuje dyrektywy Omnibus (osobna wtyczka); rabaty są standardowymi
  korektami Medusy.
- Nie tworzy kuponów urodzinowych ani za porzucony koszyk; robi to wtyczka
  maili.
- Nie zmienia promocji utworzonych w Medusie poza panelem. Kupon, który się
  nie łączy, jest odrzucany, gdy taka promocja już jest w koszyku, ale taka
  promocja automatyczna, która pojawi się później, nie zostanie usunięta.
- Limit na klienta jest sprawdzany przy dodaniu kodu i przed złożeniem
  zamówienia; dwa zamówienia tego samego klienta złożone w tej samej chwili
  mogą oba przejść. Limit łączny nie ma tej luki (rdzeń go blokuje).
- Limit na klienta wymaga e-maila w koszyku (goście liczeni po e-mailu).
- Grupy i wybrani klienci wymagają zalogowanego klienta.
- Kodu, rodzaju, trybu automatycznego i liczby progów nie można edytować.

## Testy

```bash
npm run check              # typecheck i testy jednostkowe
npm run test:integration   # potrzebny Postgres: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD
```

## Licencja

MIT © Bitshaft
