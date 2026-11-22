<h1 align="center">OLX for Medusa</h1>

<p align="center">
  Publish your Medusa products on OLX.pl from the admin, one advert per variant.
  When an item sells in your store its advert comes down by itself, and one click
  on "Sold on OLX" clears the store's stock. Polish and English admin.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bitshaft/medusa-plugin-olx"><img alt="npm" src="https://img.shields.io/npm/v/@bitshaft/medusa-plugin-olx"></a>
  <a href="https://github.com/bitshaft/medusa-integrations/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/bitshaft/medusa-integrations/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Medusa" src="https://img.shields.io/badge/medusa-%E2%89%A52.22-7c3aed">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#testing">Testing</a> ·
  <a href="#what-it-does-not-do">What it does not do</a> ·
  <a href="#po-polsku">Po polsku</a>
</p>

---

> **Status: first version, not yet run against a live OLX account.** It is built from
> OLX's Partner API specification and tested against a simulated API. Try it on a
> separate OLX account first (see [Testing](#testing)).

## Prompt for your AI assistant

Paste this into your coding assistant in your Medusa backend's repository:

```text
Install and configure @bitshaft/medusa-plugin-olx in this Medusa v2 (>= 2.22) backend.
1. Run `npm install @bitshaft/medusa-plugin-olx`.
2. In medusa-config.ts add to `plugins`:
   {
     resolve: "@bitshaft/medusa-plugin-olx",
     options: {
       clientId: process.env.OLX_CLIENT_ID,
       clientSecret: process.env.OLX_CLIENT_SECRET,
       redirectUri: process.env.OLX_REDIRECT_URI,
       encryptionKey: process.env.OLX_ENCRYPTION_KEY,
     },
   }
3. Add those four variables to .env.template without values. Never commit real values.
4. Run `npx medusa db:migrate`, then start the app.
Do not publish anything. Tell me to register an app on developer.olx.pl and then open
OLX → Settings in the admin to connect the account.
```

## Requirements

- Medusa **2.22** or newer, Node.js 20.19+ or 22.12+
- An OLX.pl account and an app approved on [developer.olx.pl](https://developer.olx.pl)
- A backend on a public **https** address (OLX redirects the browser back to it)
- Product photos on public **https** addresses (OLX downloads them by URL)

## Installation

1. **Register an app** on [developer.olx.pl](https://developer.olx.pl): sign in with the
   store's OLX account, fill in the company details and add an app with this Redirect URI:

   ```text
   https://<your-backend>/hooks/olx/oauth/callback
   ```

   OLX reviews it and answers by e-mail. You can install the plugin in demo mode meanwhile.

2. **Install** the package:

   ```bash
   npm install @bitshaft/medusa-plugin-olx
   ```

3. **Register** it in `medusa-config.ts`:

   ```ts
   module.exports = defineConfig({
     // …
     plugins: [
       {
         resolve: "@bitshaft/medusa-plugin-olx",
         options: {
           clientId: process.env.OLX_CLIENT_ID,
           clientSecret: process.env.OLX_CLIENT_SECRET,
           redirectUri: process.env.OLX_REDIRECT_URI,
           encryptionKey: process.env.OLX_ENCRYPTION_KEY,
           // demo: true,  // try everything without an OLX account
         },
       },
     ],
   })
   ```

4. **Set the environment variables** (see `.env.template`):

   ```bash
   OLX_CLIENT_ID=
   OLX_CLIENT_SECRET=
   OLX_REDIRECT_URI=https://<your-backend>/hooks/olx/oauth/callback
   # at least 32 random characters: openssl rand -hex 32
   OLX_ENCRYPTION_KEY=
   ```

5. **Migrate** and start Medusa:

   ```bash
   npx medusa db:migrate
   ```

6. In the admin open **OLX → Settings**, click **Connect OLX**, and fill in the contact
   person and city. The **Guide** tab shows which steps are done.

### Options

| Option          | Default              | What it does                                                                                 |
| --------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `clientId`      | required             | From your OLX app.                                                                           |
| `clientSecret`  | required             | From your OLX app. Never shown in the admin or in logs.                                      |
| `redirectUri`   | required             | Must equal the app's Redirect URI, on https.                                                 |
| `encryptionKey` | required             | Encrypts OLX tokens in the database. Min. 32 characters. Changing it means connecting again. |
| `adminUrl`      | `<backend>/app/olx`  | Where the browser returns after connecting, if your admin is elsewhere.                      |
| `demo`          | `false`              | Sample data and an in-memory OLX. Needs no credentials and sends nothing.                    |
| `baseUrl`       | `https://www.olx.pl` | Only for a proxy or a test server.                                                           |
| `timeoutMs`     | `15000`              | Per request to OLX.                                                                          |

Missing or invalid options never stop Medusa: the plugin stays disabled, logs one line
(`[olx] Disabled: …`) and the admin page shows why.

## How it works

### Publishing

Each variant can have **one** advert. Nothing goes to OLX by itself:

- **Product page → Integrations → OLX**: a form filled from the product (title, plain-text
  description, regular PLN price, photos) and your defaults. You choose the category and
  its fields, check it and click **Publish**.
- **OLX → Adverts → Publish several**: up to 50 variants with one category and shared fields.

The form checks OLX's rules before sending: title 16–150 characters, description 80–9000,
no e-mail or website addresses, at most half capitals, no triple punctuation. Something
that looks like a phone number only shows a warning, because it may be a size or a code. An item that cannot be bought in the store is not offered.

### When it sells

| What happened                       | What the plugin does                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Sold (or out of stock) in the store | The advert comes down at once. A job checks the same every 5 minutes in case an event was missed. |
| Sold to an OLX buyer                | You click **Sold on OLX**: free stock goes to zero (reservations stay), the advert comes down.    |
| OLX does not answer                 | The take-down is remembered and repeated until OLX confirms.                                      |
| Stock comes back                    | Nothing is republished. You decide with **Bring back**.                                           |
| Changed or removed on OLX           | The status updates from OLX's change feed within 5 minutes.                                       |

### No duplicates

Every advert is sent with its own ID as `external_id`. Before creating, the plugin asks OLX
for that ID. If a create times out, the advert stays "Publishing" and is never sent again
until the job has seen whether OLX has it. Only read requests are retried automatically.

### Costs

Adverts in some OLX categories are paid. **The plugin never buys packets or promotions.**
An advert over your limit shows **Over the limit** until you handle it on OLX.

### Security

OLX tokens are encrypted with AES-256-GCM. Secrets and tokens never appear in logs, errors
or admin responses. The OAuth callback accepts only a single-use state started by an
admin in the last 10 minutes and always redirects to the configured admin address.

## Testing

**OLX has no sandbox.** To try the plugin safely:

1. Start with `demo: true`: everything works on sample data and nothing leaves the store.
2. Then create a **separate OLX account**, connect it to your app and publish a test advert.
   Remember it is a real advert on OLX: take it down afterwards.

In this repository:

```bash
npm run check             # typecheck and unit tests
npm run test:integration  # the module against Postgres (DB_HOST, DB_USERNAME, DB_PASSWORD)
npm run test:http         # a whole Medusa app in demo mode
```

## What it does not do

- **OLX orders and Przesyłka OLX** (accept, reject, labels): planned for a next version.
  OLX's API offers them.
- Messages, statistics, promotions and buying packets.
- Syncing prices automatically: the product tab shows when the store's price differs from
  the advert, and you edit it.
- **A sale agreed in OLX chat cannot be detected**: use **Sold on OLX**.
- One OLX account per store, Poland only, prices in PLN.
- "Sold on OLX" clears the whole inventory item. If several variants share one item (kits),
  they all go out of stock.

---

## Po polsku

Plugin wystawia produkty z Medusy na OLX.pl: **jedno ogłoszenie na wariant**, zawsze
ręcznie z admina. Gdy rzecz sprzeda się w sklepie, ogłoszenie zdejmuje się samo, a przycisk
**Sprzedane na OLX** zeruje wolny stan w sklepie.

> **Status: pierwsza wersja, jeszcze niesprawdzona na prawdziwym koncie OLX.** Powstała na
> podstawie specyfikacji Partner API i jest testowana na symulowanym API. Zacznij od
> osobnego konta OLX.

### Instalacja

1. Zarejestruj aplikację na [developer.olx.pl](https://developer.olx.pl). Redirect URI:
   `https://<twoj-backend>/hooks/olx/oauth/callback`. OLX sprawdzi ją i odpowie mailem.
2. `npm install @bitshaft/medusa-plugin-olx`, dodaj plugin w `medusa-config.ts` (opcje jak
   wyżej) i ustaw zmienne `OLX_CLIENT_ID`, `OLX_CLIENT_SECRET`, `OLX_REDIRECT_URI`,
   `OLX_ENCRYPTION_KEY` (co najmniej 32 losowe znaki).
3. `npx medusa db:migrate`, a potem w adminie **OLX → Ustawienia → Połącz z OLX**.

Bez klucza możesz od razu użyć `demo: true`: wszystko działa na przykładowych danych, nic
nie trafia na OLX, a stany w sklepie się nie zmieniają.

### Jak to działa

- **Wystawianie:** na stronie produktu, zakładka OLX. Formularz startuje z danych produktu
  i ustawień domyślnych. Kilka produktów naraz: **OLX → Ogłoszenia → Wystaw kilka**.
- **Sprzedaż w sklepie:** ogłoszenie znika od razu, a zadanie sprawdza to dodatkowo co 5 minut.
- **Sprzedaż na OLX:** przycisk **Sprzedane na OLX** zeruje wolny stan i zdejmuje ogłoszenie.
- **Powrót towaru na stan** niczego nie wystawia samo. Decydujesz przyciskiem **Przywróć**.
- **Bez duplikatów:** zanim plugin utworzy ogłoszenie, pyta OLX o jego identyfikator.
  Ogłoszenie, które nie doczekało się odpowiedzi, nie jest wysyłane drugi raz.
- **Koszty:** w niektórych kategoriach ogłoszenia są płatne. Plugin niczego nie kupuje.

### Czego nie robi

- Zamówień i Przesyłki OLX (planowane w kolejnej wersji), wiadomości, statystyk, promowania.
- Automatycznej synchronizacji cen: zakładka produktu pokazuje różnicę, a poprawiasz ją ręcznie.
- OLX nie powie pluginowi o sprzedaży dogadanej na czacie, wtedy użyj **Sprzedane na OLX**.
- Jedno konto OLX na sklep, tylko Polska i PLN.

## License

MIT © Bitshaft
