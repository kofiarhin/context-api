# GitHub Gateway Release Checklist

Use this checklist before declaring the Context API GitHub Gateway available through Zoro.

## Repository verification

Run from a clean checkout of `main`:

```bash
npm ci
npm run verify
```

`npm run verify` runs the Jest suite, ESLint, Prettier verification, and the static GitHub Gateway release validator. Do not mark the gateway verified while any command fails.

The static validator confirms that:

- `docs/openapi/zoro-action.yaml` uses the production Heroku URL;
- the schema has exactly 27 unique operation IDs;
- all 12 approved GitHub operation IDs are present;
- GitHub operations declare Bearer authentication;
- the specification and implementation plan remain present.

## Deployment

Deploy only a verified `main` commit:

```bash
git push heroku main
heroku releases --app context-api
heroku logs --tail --app context-api
```

Confirm the release is current and the dyno reports `server.listening` without configuration errors.

## Safe read verification

Use the configured `ZORO_GITHUB_API_KEY` without printing it:

```bash
BASE=https://context-api-3b9dfadf403e.herokuapp.com
TOKEN="$(heroku config:get ZORO_GITHUB_API_KEY --app context-api)"

curl -fsS "$BASE/api/v1/github/repositories" \
  -H "Authorization: Bearer $TOKEN"

curl -fsS "$BASE/api/v1/github/contents?owner=kofiarhin&repo=context-api&path=README.md&ref=main" \
  -H "Authorization: Bearer $TOKEN"

unset TOKEN
```

## Controlled write verification

Use a disposable branch and file. Never use this procedure on `.github/workflows`.

1. Read the repository default branch and current head SHA.
2. Create a uniquely named temporary branch from `main`.
3. Create `tmp/zoro-gateway-smoke-test.txt` on that branch.
4. Read the file and retain its current blob SHA.
5. Delete the file using that exact SHA.
6. Preserve the correlation IDs, branch name, blob SHA, and commit SHAs as evidence.
7. Delete the temporary branch manually in GitHub after evidence is captured.

A stale SHA must return `409`; workflow paths must return `403`; missing or invalid Bearer credentials must return `401`.

## GPT Builder handoff

The repository cannot update the private GPT Builder configuration. After repository verification:

1. Copy the complete maintained schema from `docs/openapi/zoro-action.yaml`.
2. Paste it into Zoro's Action configuration.
3. Configure API-key authentication as `Bearer` using `ZORO_GITHUB_API_KEY`.
4. Save Zoro and begin a fresh conversation.
5. Repeat the read and controlled write checks through Zoro.

## MongoDB availability boundary

GitHub requests bypass the `requireDatabase` route middleware, but `src/server.js` still connects to MongoDB before binding the HTTP port. Therefore:

- an already-running process can keep GitHub request handling independent of the database middleware;
- a restart or deployment during a MongoDB outage prevents the entire process from starting.

This limitation is documented and intentionally unchanged. Process-level decoupling requires a separate approved architecture change.

## Optional repository restriction

The approved default remains every repository visible to the GitHub App installation. For defense in depth, set:

```text
GITHUB_REPOSITORY_ALLOWLIST=kofiarhin/context-api,kofiarhin/ideahub
```

When configured, requests for repositories outside the comma-separated list return `403`. Leaving it empty preserves the current all-repository behavior.
