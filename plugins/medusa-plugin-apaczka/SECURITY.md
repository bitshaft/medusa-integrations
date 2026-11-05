# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through
[GitHub security advisories](https://github.com/bitshaft/medusa-plugin-apaczka/security/advisories/new)
or by e-mail to the maintainers at bitshaft.pl. You'll get an answer within
three working days, and a fix or mitigation plan within 14 days for
confirmed issues.

## Supported versions

Security fixes go to the latest minor release.

## How the plugin handles secrets and input

- The Apaczka `appSecret` is only used on the server: to sign API requests
  and verify webhooks. No route returns it, and the admin status page shows a
  masked `appId` only.
- Webhooks are verified with HMAC-SHA256 against the raw request body,
  compared in constant time. Unsigned or tampered requests change nothing.
- Store routes only return parcel point data. Label and document routes are
  admin-only, and only serve orders created by this store.
- All admin and store inputs are validated before use.
