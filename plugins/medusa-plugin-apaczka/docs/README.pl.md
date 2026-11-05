# Apaczka.pl dla Medusy

Wtyczka integrująca sklep na [Medusie](https://medusajs.com) v2 z
[Apaczka.pl](https://www.apaczka.pl): ponad 20 przewoźników (InPost, DPD,
DHL, UPS, GLS, Pocztex, Orlen Paczka, FedEx…) w jednym koncie.

Pełna dokumentacja jest po angielsku: [README](../README.md) oraz
[opis opcji](./configuration.md). Poniżej najważniejsze w skrócie.

## Co potrafi

- Wszystkie usługi z Twojego konta Apaczki jako opcje dostawy, także w wariantach **za pobraniem** i **zwrotnych**.
- **Ceny na żywo** z Apaczki (z narzutem, zaokrągleniem, progiem darmowej dostawy) albo ceny stałe.
- **Paczkomaty i punkty odbioru**: sprawdzanie punktu przy zamówieniu i gotowy wybór punktu z mapą dla sklepu.
- **Etykiety** PDF lub ZPL, tworzone automatycznie albo ręcznie z panelu zamówienia.
- **Zamawianie kuriera** dla jednej lub wielu przesyłek.
- **Etykiety zwrotne** tworzone od razu po zgłoszeniu zwrotu.
- **Śledzenie** przez webhooki (z weryfikacją podpisu) i zapasowe odpytywanie. Status w Medusie zmienia się na „wysłane” i „doręczone”, a wtyczka emituje zdarzenia `apaczka.*`.
- **Panel w adminie** po polsku i angielsku.

## Instalacja w skrócie

```bash
npm install @bitshaft/medusa-plugin-apaczka
```

1. Dodaj wtyczkę i dostawcę w `medusa-config.ts` (przykład w [README](../README.md#install)).
2. Ustaw `APACZKA_APP_ID` i `APACZKA_APP_SECRET` (panel Apaczki → Ustawienia → API).
3. `npx medusa db:migrate`
4. W adminie: **Ustawienia → Lokalizacje** → włącz dostawcę **apaczka** → utwórz opcje dostawy.
5. W sklepie dodaj wybór punktu ([instrukcja](../storefront/README.md)).

Zacznij od środowiska testowego (`environment: "sandbox"`). Zamówienia
produkcyjne to prawdziwe nadania i prawdziwe faktury.

## Wsparcie

Wtyczkę tworzy i utrzymuje [bitshaft](https://bitshaft.pl). Pomagamy we
wdrożeniach Medusy i niestandardowych integracjach.
