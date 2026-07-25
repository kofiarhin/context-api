# Project Summary

## Last Task

Implemented the unified Zoro engineering dispatcher: one executable OpenAPI Action
(`POST /api/v1/zoro/operations/:operationId`) covering the Context, GitHub, Vercel, Heroku, and
DevOps-log surfaces from a single GPT Builder schema.

## Progress

- Added `POST /api/v1/zoro/operations/:operationId` behind a new `ZORO_ENGINEERING_API_KEY` bearer
  key (`src/config/engineering.js`, `src/middleware/requireEngineeringActionAuth.js`). It accepts
  only that key — it deliberately does not fall back to a provider gateway key, because the unified
  route reaches every subsystem in one call. It fails closed when unconfigured. Provider credentials
  (GitHub App, Vercel token, Heroku token) stay server-side and are never accepted or returned.
- Fifteen dispatcher ids in `src/services/zoro/zoroCatalogue.js`. Each names a target service module
  and method; there is no generic method/path proxy and no re-entrant HTTP. The Vercel and Heroku
  surfaces are derived from the existing `vercelDispatcher.CATALOG` and `herokuRoutes` allowlists
  rather than copied, so they cannot drift.
- `src/services/zoro/zoroPolicy.js` requires explicit Kofi approval for merge, production-sensitive,
  security-sensitive, billing, access-admin, and destructive work; requires an exact resource-naming
  confirmation for destructive work (the expected resource is derived from the request, not from the
  confirmation); and requires an expected SHA/ETag/release for branch moves, file updates, file
  deletes, and merges. Provider-side policy is not reimplemented — it runs in the delegated services
  and no request field can skip it.
- Append-only DevOps log: `src/models/devopsLogEntry.model.js` refuses every update and delete at the
  model layer (not just by convention), keeps all ten lifecycle states distinct
  (`proposed`/`approved`/`running`/`blocked`/`failed`/`passed`/`deployed`/`rolled-back`/`resolved`/
  `completed`), and deliberately does not use `sharedFields()` — an audit log must not be
  soft-deletable. `zoroRedaction.js` strips secrets, authorization headers, private keys, config-var
  values, and temporary provider URLs (logplex, pre-signed S3) before anything is persisted.
- Mounted ahead of `requireDatabase` like the other gateways, so a Mongo outage cannot take the
  GitHub/Vercel/Heroku dispatchers down; the six database-backed dispatchers return 503 individually.
- Two bugs found and fixed at the root: `vercelRedaction` left the credential intact in
  `Authorization: Bearer <token>` (it redacted only the word "Bearer"), and `sendResource` dropped
  response meta, so single-resource dispatcher replies carried no operation/classification.
- Extended Context API self-protection: `ZORO_ENGINEERING_API_KEY` is now in `herokuPolicy`'s
  `REQUIRED_SELF_KEYS`, so the dispatcher cannot delete the key that authenticates it.
- Tests: 1063 pass (900 pre-existing, 163 new) across auth, unknown dispatchers/operations,
  prototype-chain probes, validation, allowlists, stale state, approval, confirmation, redaction,
  append-only enforcement, pagination (offset and cursor), database independence, and backward
  compatibility of every direct route. `npm run verify:engineering-action` asserts exactly one
  OpenAPI operationId, the 30-operation ceiling, and schema/catalogue parity.
- Pre-existing failures left untouched and confirmed identical on `main`: `npm run lint` reports the
  same 9 errors; `npm run format:check` fails across files that predate this work. Only files touched
  by this change were formatted, to keep the diff reviewable.

## Files

- `src/routes/v1/zoro.js`
- `src/controllers/zoro.controller.js`
- `src/services/zoro/zoroDispatcher.js`
- `src/services/zoro/zoroCatalogue.js`
- `src/services/zoro/zoroPolicy.js`
- `src/services/zoro/zoroRedaction.js`
- `src/services/devopsLog.service.js`
- `src/models/devopsLogEntry.model.js`
- `src/config/engineering.js`
- `src/middleware/requireEngineeringActionAuth.js`
- `docs/openapi/zoro-single-full-engineering-action.yaml`
- `scripts/validate-engineering-action-release.js`
- `tests/integration/zoroUnifiedAction.test.js`
- `tests/integration/zoroProviderDispatchers.test.js`
