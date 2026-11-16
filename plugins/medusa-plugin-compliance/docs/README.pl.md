# Zgodność dla Medusy v2: GPSR, RODO, Omnibus

`@bitshaft/medusa-plugin-compliance` · [English version](../README.md)

Jedna wtyczka, trzy moduły, każdy włączany osobno w panelu:

1. **GPSR**: dane bezpieczeństwa produktów (producent, osoba odpowiedzialna
   w UE, identyfikacja, ostrzeżenia) ze sprawdzaniem kompletności.
2. **RODO**: rejestr zgód tylko do dopisywania i żądania osób, których
   dane dotyczą (dostęp, przeniesienie, usunięcie z anonimizacją, sprzeciw
   wobec marketingu, sprostowanie).
3. **Omnibus**: historia cen każdego wariantu i najniższa cena z okresu
   przed każdą obniżką.

Jedna strona w panelu (**Zgodność**, po polsku i angielsku), widżety na
stronie produktu i klienta, małe Store API i tryb demo.

> **Zastrzeżenie prawne.** Ta wtyczka to narzędzie. Nie jest poradą
> prawną i nie gwarantuje, że sklep spełnia wymogi GPSR, RODO, przepisów
> Omnibus ani innych. Okresy, zakresy i wyjątki to ustawienia z wartościami
> domyślnymi; czy pasują do Twojego sklepu, decydujesz Ty z prawnikiem.
> Wtyczka nie zawiera tekstów prawnych: każde pole na treść zgody,
> komunikatu czy polityki zaczyna się od `[DO UZUPEŁNIENIA PRZEZ PRAWNIKA]`.

## Wymagania

- Medusa `^2.22.0` (testowane z 2.22.3)
- Node.js `^20.19.0 || >=22.12.0`

## Instalacja

```bash
npm install @bitshaft/medusa-plugin-compliance
```

```ts
// medusa-config.ts
module.exports = defineConfig({
  plugins: [
    {
      resolve: "@bitshaft/medusa-plugin-compliance",
      options: {
        // wszystkie opcjonalne; to wartości domyślne
        timeZone: "Europe/Warsaw",
        defaultLocale: "pl",
        // moduły innych wtyczek, które dodają dane do eksportu RODO
        dataProviders: [],
      },
    },
  ],
})
```

```bash
npx medusa db:migrate
```

Strona pojawia się w głównym menu jako **Zgodność**. Po pierwszym starcie
wszystkie trzy moduły są włączone, a zadanie godzinowe robi migawkę
wszystkich cen.

## Konfiguracja

Opcje wtyczki są tylko techniczne: `timeZone`, `defaultLocale` (`pl`) i
`dataProviders` (patrz [Dostawcy danych](#dostawcy-danych)). Błędne opcje
nie blokują startu Medusy: wtyczka zostaje wyłączona, zapisuje jedną linię
w logu, a panel pokazuje powód.

Wszystko inne ustawia się w zakładce **Ustawienia**:

- włączanie modułów, tryb demo;
- GPSR: które pola opcjonalne są wymagane (nazwa handlowa, typ, model,
  zdjęcie oznakowania, ostrzeżenia i ich języki);
- RODO: termin odpowiedzi (30 dni), ostrzeżenie przed terminem (7 dni),
  ważność linku (48 h), strona potwierdzenia w sklepie (z `{token}`), link
  do polityki prywatności, komunikat po zgłoszeniu, limity (3 na e-mail,
  10 na IP w 60 minut);
- zakres anonimizacji: tekst placeholdera, metadane klienta, e-mail,
  telefony i adres dostawy w zamówieniach, adres rozliczeniowy (domyślnie
  zostaje) i **okres przechowywania danych rozliczeniowych** (72 miesiące
  od daty zamówienia; potem codzienne zadanie usuwa adres rozliczeniowy),
  otwarte koszyki;
- Omnibus: okres (30 dni), czy promocje automatyczne i kody liczą się jako
  obniżki, kraj do podatku w regionach z kilkoma krajami, wyjątki dla
  produktów lub kategorii.

Zakładka **Przewodnik** opisuje każdą wartość domyślną i wymienia, co
sprawdzić z prawnikiem.

## Jak to działa

### GPSR

- Dane produktu: producent (nazwa, nazwa handlowa lub znak towarowy, adres
  pocztowy i elektroniczny), osoba odpowiedzialna w UE (wymagana dla
  producenta spoza UE), typ, model, numer partii lub seryjny (jeśli
  dotyczy), zdjęcie oznakowania i ostrzeżenia w Markdown osobno dla każdego
  języka sklepu (Ustawienia → Sklep, z modułem Translation Medusy; bez
  niego język `defaultLocale`). Jedno pole z wyborem języka, jak w edytorze
  e-maili: język domyślny to oryginał, a język bez własnej treści pokazuje
  go w sklepie. Treść w języku, którego sklep już nie oferuje, jest usuwana
  przy zapisie. W ustawieniach wybierasz, które z języków sklepu są
  wymagane. W **Ustawienia → Tłumaczenia** jest karta z odnośnikiem do tych
  tekstów i do treści zgód.
- Profile producentów zapisuje się raz i przypina do wielu produktów;
  każde pole można nadpisać na produkcie.
- Produkt z brakami publikuje się normalnie. Panel pokazuje licznik i listę
  braków z linkiem do produktu. Codzienne zadanie sprawdza wszystko, a
  zmiana produktu sprawdza go od razu.

### RODO

- **Rodzaje zgód**: identyfikator, nazwa i treść w każdym języku sklepu
  (jedno pole z wyborem języka; pusta treść dostaje znacznik dla prawnika,
  treść w innych językach jest usuwana przy zapisie), wersja, „wymagana” i
  miejsce (rejestracja, koszyk, konto, newsletter, cookies). Zmiana treści
  w dowolnym języku tworzy nową wersję; stare zostają. Dodanie języka do
  sklepu sprawia więc, że następny zapis to nowa wersja.
- **Wpisy zgód** dla klienta, adresu e-mail albo anonimowego identyfikatora
  przeglądarki: rodzaj, wersja treści, udzielona lub wycofana, data,
  źródło. Tylko do dopisywania (trigger w bazie blokuje zmiany); wycofanie
  to nowy wpis. Wybory cookies (niezbędne, analityczne, marketingowe)
  zapisują się po identyfikatorze przeglądarki i łączą z klientem po
  zalogowaniu. Baner jest po stronie sklepu.
- **Żądania**: zgłoszenie przez Store API (zalogowany klient albo e-mail),
  potwierdzenie linkiem z maila, potem obsługa w panelu z terminem i
  ostrzeżeniem przed nim. Każde żądanie ma historię (kto, kiedy, co);
  odrzucenie wymaga powodu. Żądań nie da się usunąć.
- **Dostęp i przeniesienie**: panel pobiera ZIP z `data.json` i plikami CSV
  (profil, adresy, zamówienia, zgody, żądania, dane dostawców).
- **Usunięcie**: po akceptacji anonimizacja w workflow (każdy krok cofa
  się przy błędzie):
  - imię, nazwisko, e-mail (`anon-<id>@invalid`, unikalny, żeby osoba mogła
    później założyć konto na prawdziwy adres), telefon, firma i metadane
    są zastępowane; `has_account` = `false`; zapisane adresy są usuwane;
  - zamówienia zachowują kwoty, pozycje i podatki; e-mail, telefony i
    adres dostawy są zastępowane; adres rozliczeniowy zostaje do końca
    okresu przechowywania;
  - otwarte koszyki są anonimizowane;
  - logowanie (auth identity) jest usuwane, a wydane wcześniej sesje i
    tokeny od tej chwili są odrzucane;
  - `compliance.customer_anonymized` mówi innym wtyczkom, żeby usunęły
    swoje dane.
- **Sprzeciw wobec marketingu**: przyjęcie wycofuje zgody na newsletter i
  marketingowe cookies (ze zdarzeniami).
- **Sprostowanie** kieruje do edycji konta; żądanie jest tylko rejestrowane.

### Omnibus

- Każda zmiana ceny wariantu zapisuje się per region i waluta, z
  podatkiem, tak jak widzi ją klient, z datą. Pierwsze uruchomienie robi
  migawkę wszystkich cen.
- Obniżka to aktywny cennik typu `sale` oraz, jeśli włączone, promocja
  automatyczna bez warunków koszyka. Kody są pomijane, chyba że je
  włączysz.
- Dla każdej obniżki liczona jest najniższa cena z okresu przed jej
  początkiem (domyślnie 30 dni). Produkty w sprzedaży krócej: od początku
  sprzedaży. Historia krótsza niż okres po świeżej instalacji: cena
  oznaczona jako `history_incomplete` i pokazana w panelu.
- Wyjątki dla produktu lub kategorii (domyślnie wyłączone): `exempt` (bez
  najniższej ceny, np. towary szybko psujące się) i `gradual` (seria
  obniżek liczona od pierwszej).

### Tryb demo

Przełącznik w ustawieniach. Panel pokazuje dane pokazowe, odmawia każdej
zmiany poza ustawieniami i ma pasek „Tryb demo” na każdej stronie. Sklep i
Store API dalej działają na prawdziwych danych.

## Zdarzenia

`compliance.consent_granted`, `compliance.consent_withdrawn`,
`compliance.request_verification`, `compliance.request_opened`,
`compliance.request_due_soon`, `compliance.request_closed`,
`compliance.customer_anonymized`. Payloady są opisane w
[README.md](../README.md#events). Wtyczka nie wysyła maili; wtyczka mailowa
nasłuchuje `compliance.request_verification`.

## Store API

Wszystko pod `/store/compliance`; szczegóły i przykłady w
[README.md](../README.md#store-api). Odmowy mają `code`, komunikat w
języku klienta i oba teksty w `messages`. Każdą zasadę sprawdza serwer.

- `GET /gpsr/products/:id?locale=de`: dane GPSR na kartę produktu (ostrzeżenia w tym języku, inaczej w domyślnym)
- `GET /omnibus/variants/:id?region_id=` i `/omnibus/products/:id?region_id=`:
  cena aktualna, regularna, czy obniżka, najniższa cena z okresu, data
  początku obniżki, „historia niepełna”
- `GET /consents/types`, `GET /consents`, `POST /consents`, `POST /consents/link`
- `POST /requests` (z limitem), `POST /requests/verify`

## Dostawcy danych

Inne wtyczki dodają swoje dane do eksportu RODO bez importowania tej
wtyczki:

```ts
options: {
  dataProviders: [{ module: "loyalty", method: "exportCustomerData", label: "loyalty" }],
}
```

Przy eksporcie wtyczka wywołuje `container.resolve(module)[method](customerId, email)`.
Wynik (obiekt lub tablica JSON) trafia do `data.json` pod
`providers.<label>` i do `providers/<label>.csv`. Błąd dostawcy jest
odnotowany w eksporcie, a eksport się kończy.

## Czego nie robi

- Nie jest poradą prawną (patrz zastrzeżenie).
- Obniżki zaplanowane na konkretną godzinę zapisują się w zadaniu
  godzinowym, czyli z opóźnieniem do godziny.
- Promocje są liczone na koszyku z jedną sztuką: promocje z warunkami
  koszyka (grupa klientów, minimalna kwota, kup X weź Y) się nie liczą.
- Cenniki ograniczone do grup klientów nie są zapisywane.
- Podatek liczony według jednego kraju na region (ustawienie).
- Ceny sprzed instalacji są nieznane: te obniżki są oznaczone jako
  niepełne.
- Sesje i tokeny zanonimizowanego klienta są odrzucane w ciągu minuty na
  każdym serwerze (od razu na tym, który anonimizował).
- Anonimizacja obejmuje moduły klienta, zamówień, koszyków i logowania.
  Dane u operatorów płatności i przewoźników, w innych wtyczkach (dostają
  zdarzenie) i w wysłanych mailach nie są ruszane.
- Wpisy zgód i zapisy żądań zachowują adres e-mail jako dowód.
- Brak komponentów sklepu i masowego importu danych GPSR.

## Testy

```bash
npm run check
npm run test:integration   # potrzebny Postgres: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD
```

## Licencja

MIT © Bitshaft
