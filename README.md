# Medusa integrations by Bitshaft

Independent [Medusa v2](https://medusajs.com) plugins for services used by
stores in Poland and the rest of Europe. Each plugin is its own npm package
with its own version, changelog and release.

| Plugin                                                            | Package                                                                                                        | Category      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- |
| [Apaczka.pl](./plugins/medusa-plugin-apaczka/README.md)           | [`@bitshaft/medusa-plugin-apaczka`](https://www.npmjs.com/package/@bitshaft/medusa-plugin-apaczka)             | Shipping      |
| [Emails](./plugins/medusa-plugin-emails/README.md)                | [`@bitshaft/medusa-plugin-emails`](https://www.npmjs.com/package/@bitshaft/medusa-plugin-emails)               | Notification  |
| [VAT white list](./plugins/medusa-plugin-whitelist-vat/README.md) | [`@bitshaft/medusa-plugin-whitelist-vat`](https://www.npmjs.com/package/@bitshaft/medusa-plugin-whitelist-vat) | Tax           |
| [Back in stock](./plugins/medusa-plugin-back-in-stock/README.md)  | [`@bitshaft/medusa-plugin-back-in-stock`](https://www.npmjs.com/package/@bitshaft/medusa-plugin-back-in-stock) | Store feature |
| [Coupons](./plugins/medusa-plugin-coupons/README.md)              | [`@bitshaft/medusa-plugin-coupons`](https://www.npmjs.com/package/@bitshaft/medusa-plugin-coupons)             | Store feature |

## Using a plugin

Install the package in your Medusa backend and follow its README:

```bash
npm install @bitshaft/medusa-plugin-apaczka
```

Every plugin:

- uses the Medusa packages your app already has (peer dependencies) and
  ships only compiled code;
- never stops Medusa from starting: with missing or invalid options it stays
  disabled and logs one line saying why;
- keeps secrets out of logs and admin API responses;
- has an admin UI in English and Polish;
- keeps its code under its own namespace (`apaczka/…`, `apaczka-*`), so
  plugins don't collide with each other or with your code.

## Working on this repo

There are no npm workspaces: each plugin installs, tests and builds on its
own. The root `package.json` only has scripts that run in every plugin.

```bash
nvm use                 # Node 22, see .nvmrc
npm run install:all     # npm install in every plugin
npm run check           # typecheck + unit tests in every plugin
npm run build           # medusa plugin:build in every plugin
npm run check:repo      # repo rules, no secrets
npm run smoke           # pack each plugin and load it in a fresh Medusa app
```

Shared code lives in [`kit/`](./kit/README.md) and is copied into each plugin
with `npm run kit:sync`, so every package is self-contained.

The rules, naming conventions and a step-by-step guide for adding a plugin
are in [CLAUDE.md](./CLAUDE.md). How to contribute and release is in
[CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2026 [Bitshaft](https://bitshaft.pl). Names of third-party
services are trademarks of their owners; see [TRADEMARKS.md](./TRADEMARKS.md).
