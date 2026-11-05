# Changesets

Every user-visible change needs a changeset:

```bash
npx changeset
```

Pick `patch`, `minor` or `major` and describe the change for users. The
release workflow collects pending changesets into a "Version packages" pull
request and publishes to npm when that PR is merged.
