# Contributing

Thanks for helping. Read [CLAUDE.md](./CLAUDE.md) first: it has the repo
rules, naming conventions and quality rules every change has to follow.

## Setup

Use Node 22 or 24 (`nvm use` picks 22 from `.nvmrc`).

```bash
npm run install:all     # npm install in every plugin
npm run check           # typecheck + unit tests everywhere
npm run build
npm run check:repo
```

To work on a single plugin, run its own scripts in its folder
(`cd plugins/medusa-plugin-apaczka && npm run check`). Each plugin has a
`docs/development.md` with what is specific to it.

### Shared code

Edit files in `kit/`, never the `GENERATED` copies inside plugins, then run
`npm run kit:sync` and `npm run check`. Kit changes affect every plugin, so
keep them backwards compatible or update all plugins in the same pull
request.

### Smoke test

`npm run smoke` packs each plugin, installs the tarball into a fresh Medusa
app in `.smoke/`, loads every entry point and runs `medusa build`. With
`DATABASE_URL` set it also runs the migrations and boots the app.

```bash
npm run smoke -- --only=medusa-plugin-apaczka
DATABASE_URL=postgres://postgres:postgres@localhost:5432/smoke npm run smoke
```

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org) with the
plugin as scope: `feat(apaczka): …`, `fix(kit): …`, `chore(repo): …`. Keep
pull requests focused on one plugin where possible, include tests for
behaviour changes, and update the plugin's `CHANGELOG.md` for anything users
will notice. Admin strings go in both `en.json` and `pl.json`.

## Releasing a plugin

Releases are cut by a maintainer, one plugin at a time.

1. Bump `version` in the plugin's `package.json` and `package-lock.json`
   (`npm version <x.y.z> --no-git-tag-version` in the plugin folder), and
   move the changelog entry out of "unreleased".
2. Merge to `main`.
3. Tag and push: `git tag medusa-plugin-apaczka@0.1.0 && git push origin medusa-plugin-apaczka@0.1.0`.
4. The **Publish** workflow checks that the tag matches the package version,
   runs the checks and the build, and publishes that one plugin with
   provenance, using npm trusted publishing (OIDC). No npm token is stored
   in GitHub.

### One-time setup per package

npm trusted publishing is configured per package, so a package has to exist
before it can trust the workflow:

1. Publish the first version by hand from the plugin folder:
   `npm run build && npm publish --access public`.
2. On npmjs.com, open the package → **Settings → Trusted publishing**, add
   GitHub Actions with repository `bitshaft/medusa-integrations` and workflow
   `publish.yml`.
3. Optionally, in the package settings, require two-factor authentication and
   disallow tokens, so the workflow is the only way to publish.
