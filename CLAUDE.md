# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                 # node --watch src/server.js
npm test                    # jest --runInBand
npm run lint                # eslint .
npm run format:check        # prettier --check .
npm run seed                # idempotent upsert of src/seeds/data
npm run seed:reset          # destructive: deleteMany on every seeded collection first
```

Single test file / single case:

```bash
npx jest tests/integration/projects.test.js
npx jest tests/unit/precedence.test.js -t "orders project scope first"
```

Tests need no local MongoDB. `tests/globalSetup.js` boots one `mongodb-memory-server` instance for the
whole run and publishes `MONGODB_URI`; `maxWorkers: 1` is required because every suite shares it.
`client/` is excluded from Jest and has its own npm scripts (`cd client && npm run dev|build|lint`).

Requires a `.env` (copy `.env.example`). `src/config/env.js` validates it at load and throws listing
every problem at once — a missing `NODE_ENV`, `PORT`, or `MONGODB_URI` fails at startup, not at
first request.

## Architecture

Express 5 + Mongoose. Layering is strict: **route → validation middleware → controller → service →
model**, with serializers on the way out. Controllers never build queries; services never touch
`req`/`res`.

### The CRUD domain registry

`src/config/crudDomains.js` is the center of the codebase. Each of the eight domains (profile,
codingConventions, projects, tasks, instructionSets, ideasHub, glossary, learnings) is one entry
declaring its Model, `identifierField`, serializer, human-readable `label`, and optional
`normalizeIdentifier` / `lookupSort` / `singleton`.

Write paths (`POST`/`PATCH`/`DELETE`) are fully generic: `crud.controller.js` and `crud.service.js`
are parameterized by domain name and work for any registry entry. Read paths are per-domain, because
each has its own filters — `context.controller.js` composes them from a service lister plus a
serializer via `createListHandler` / `createResourceHandler`.

**Adding a domain** means: model in `src/models/` (using `sharedFields`/`applyBaseOptions` from
`models/shared.js`), serializer in `src/serializers/index.js`, query validator in
`src/validation/schemas.js`, read service in `src/services/`, a registry entry, and one
`registerCollection({...})` call in `src/routes/v1/index.js`. Writes then work with no new code.

### Records address by stable domain key, never ObjectId

Every public route takes the domain's client-provided identifier (`projectId`, `key`, `section`,
`term`, `learningId`). `validateIdentifierParam` rejects anything outside
`^[A-Za-z0-9][A-Za-z0-9._:-]*$`. Glossary normalizes the term into `normalizedKey` before lookup.

### Soft delete is the only delete

`DELETE` sets `status: 'archived'` + `archivedAt` and is idempotent. `queryHelpers.paginate` injects
`status: { $ne: 'archived' }` unless the caller filtered on `status` explicitly, so list reads hide
archived records while `?status=archived` reveals them. Single-resource reads *do* return archived
records so an agent can restore one by `PATCH`ing a non-archived status — `crud.service.updateRecord`
clears `archivedAt` on that transition.

`POST` never upserts. A duplicate identifier is a `409` even when the existing record is archived.

### Validation is allowlist-only, in both directions

- Request bodies: `validation/write.js` rejects unknown fields, `MANAGED_FIELDS`
  (`_id`, `__v`, `createdAt`, `updatedAt`, `archivedAt`), and — on `patch` — the identifier field
  itself. Mongoose is additionally constructed with `strict: 'throw'`.
- Query strings: `validation/common.js` `validateQuery` rejects unknown *and* repeated parameters,
  so a typo'd filter is a `400` rather than a silently wider result set.
- Responses: `src/serializers/` maps field by field. Nothing is spread from a document, so a new
  internal field cannot leak. `applyBaseOptions` strips `_id`/`__v` as defence in depth.

### Errors and responses

Throw the classes in `src/utils/errors.js` (all extend `AppError` with `code`/`statusCode`/`details`);
`middleware/errorHandler.js` translates them centrally, so no handler inspects raw Mongoose or driver
errors. Wrap async handlers in `utils/asyncHandler`. Emit responses only through
`utils/responses.js` (`sendResource` / `sendCollection`) — every body is `{ data, meta }` and every
error is `{ error, meta }` carrying the request `correlationId`.

### Method handling

`middleware/allowedMethods` allows `GET, HEAD, OPTIONS, POST, PATCH, DELETE` and returns `405` with
an `Allow` header for anything else. `PUT` is deliberately absent because updates are partial. This
guard is intentionally environment-independent — a past release wired a GET-only variant and silently
turned production read-only; `tests/integration/productionRouteRegistration.test.js` guards that
regression. Don't reintroduce environment branching here.

### Seeds

`src/seeds/registry.js` orders domains by dependency and declares each one's `identity` fields.
`runner.js` validates the *entire* set before writing anything (so a bad cross-reference can't leave
a half-seeded database), then upserts by identity. Idempotency is decided by explicit value
comparison in `isUnchanged`, not Mongoose dirty-checking, which is unreliable for arrays.

### Precedence

`services/precedence.service.js` implements SPEC §8.2 conflict resolution: project scope > global,
approved/active > draft, then priority, version, `updatedAt`. `resolve()` returns the winner *and*
what it outranked so callers can surface conflicts rather than discard them.

## Security posture

This MVP is intentionally public and unauthenticated — every caller can read and write. Do not store
secrets, credentials, private chat history, or sensitive personal data in seeds, tests, or fixtures.
The compensating controls (helmet, CORS allowlist from `CORS_ORIGINS`, rate limiting, the 10kb JSON
body limit, schema validation, safe logging that never echoes values) are load-bearing; keep them
enabled.

## Reference

`docs/SPEC.md` is the authoritative technical spec and is cited by section number in code comments.
See also `docs/PRD.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/DEPLOYMENT.md`.
