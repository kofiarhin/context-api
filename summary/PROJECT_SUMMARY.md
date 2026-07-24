# Project Summary

## Last Task

Fixed `GET /api/v1/vercel/user` returning an empty object by unwrapping the upstream `/v2/user`
envelope, and corrected the earlier misdiagnosis of the gateway 401.

## Progress

- Corrected the previous entry: the 401 was **not** a local `ZORO_VERCEL_API_KEY` mismatch. The local
  key was valid; `ZORO_VERCEL_API_KEY` was present but set to an **empty string on Heroku**. Syncing
  the local value to Heroku resolved it. Unauthenticated, valid-bearer, and wrong-bearer checks
  against the deployed app now return 401/200/401 as expected.
- Fixed `serializer.user`: Vercel returns `{ user: { ... } }`, but the serializer read `id`/`username`
  /`name`/`email` from the top level, so every field was `undefined` and `compact()` stripped them,
  yielding `{}`. It now unwraps the envelope and still accepts an already-unwrapped user object.
- Added `tests/unit/vercelSerializer.test.js` covering the real envelope shape, allowlisted output,
  rejection of unrelated upstream fields, and the service-to-serializer seam via a stubbed client.
- Pre-existing issues left untouched: lint fails in unrelated Vercel service files, repo-wide format
  check fails across many existing files, and Vercel release validation reports a missing OpenAPI
  operation ID.

## Files

- `src/serializers/vercel.serializer.js`
- `tests/unit/vercelSerializer.test.js`
- `docs/DEPLOYMENT.md`
