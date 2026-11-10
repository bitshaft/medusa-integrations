# kit

Shared code for the plugins in this repo. It is **not** an npm package.
`npm run kit:sync` copies it into every plugin, so each published package is
self-contained and has no extra runtime dependency.

| Source        | Copied to (in each plugin)       | Contents                                                                                                           |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `kit/server/` | `src/lib/<namespace>/kit/`       | HTTP client (timeouts, safe retries, secret masking), option helpers (disabled mode), package version, API helpers |
| `kit/admin/`  | `src/admin/lib/<namespace>/kit/` | Admin JS SDK instance, formatting helpers                                                                          |
| `kit/build/`  | `scripts/kit/`                   | Build helpers used by the plugin's npm scripts (`strip-source-maps.mjs`); not published                            |

`<namespace>` is the plugin folder name without `medusa-plugin-`, e.g.
`apaczka`.

Rules:

- Edit files here, never the copies. Copies start with a `GENERATED` header
  and are overwritten on the next sync. `npm run check:repo` fails when a
  copy is out of date.
- Only code that at least two integrations would use the same way belongs
  here. Provider-specific logic stays in the plugin.
- `kit/server/http.ts`, `secrets.ts` and `package-info.ts` must not import
  Medusa, so API clients built on them stay framework-free.
- Tests in `__tests__/` are copied too and run as part of each plugin's
  `npm test`.
