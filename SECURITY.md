# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through
[GitHub security advisories](https://github.com/bitshaft/medusa-integrations/security/advisories/new)
or by e-mail to the maintainers at bitshaft.pl. Say which plugin and version
is affected. You'll get an answer within three working days, and a fix or
mitigation plan within 14 days for confirmed issues.

## Supported versions

Security fixes go to the latest minor release of each plugin.

## How the plugins handle secrets and input

- Secrets (API keys, app secrets, signing keys) come only from plugin
  options or environment variables, and are used only on the server.
- Secrets are masked in logs and error messages, and no admin or store
  route returns them. Admin screens show at most a masked identifier.
- Webhooks are verified (for example HMAC signatures over the raw request
  body, compared in constant time) before anything changes.
- Writes to external systems are never retried blindly, so a retry cannot
  create duplicates.
- All admin and store inputs are validated before use.

Plugin-specific details are in each plugin's README.
