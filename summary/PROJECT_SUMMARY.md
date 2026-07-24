# Project Summary

## Last Task

Split the single Vercel Action schema into two GPT Builder-compatible schemas, because GPT Builder
rejects any Action schema declaring more than 30 operations.

## Progress

- Replaced `docs/openapi/zoro-vercel-action.yaml` (36 operations, rejected by GPT Builder) with
  `zoro-vercel-core-action.yaml` (20 operations: user, teams, projects, deployments, events, logs,
  files, promotion, rollback) and `zoro-vercel-config-action.yaml` (17 operations: environment-variable
  metadata, project domains, aliases, domain config, DNS). The two files are disjoint and together
  cover all 37 implemented routes; no runtime route changed.
- The old schema was also missing `getVercelDeploymentLogs`, which its own validator required, so
  `npm run verify:vercel-gateway` failed on `main`. The core schema now exposes
  `GET /deployments/{deployment}/logs` and the check passes.
- Rewrote `scripts/validate-vercel-gateway-release.js` around a route-keyed contract table. Keying on
  `METHOD path` rather than operation ID means renaming an operation cannot drop it out of its
  approval or confirmation requirement. It validates: per-file operation budget, ID uniqueness within
  and across files, route/schema parity in both directions, identical `ZORO_VERCEL_API_KEY` bearer
  scheme, production URL, approval/confirmation payloads, and absence of any decrypted-secret read.
  It now exports its helpers and accepts injected file contents so tests can prove each rule fails.
- Added `tests/unit/vercelActionSchemas.test.js` (32 cases), including negative cases for every
  validation rule.
- Pre-existing failures left untouched: `npm run lint` reports 2 errors in `vercel.service.js` and
  `vercelRedaction.js`; `npm run format:check` fails across ~99 files that predate this work. Both
  make the aggregate `npm run verify` red independently of this change.

## Files

- `docs/openapi/zoro-vercel-core-action.yaml`
- `docs/openapi/zoro-vercel-config-action.yaml`
- `scripts/validate-vercel-gateway-release.js`
- `tests/unit/vercelActionSchemas.test.js`
- `docs/VERCEL_GATEWAY_SPEC.md`
- `docs/VERCEL_GATEWAY_IMPLEMENTATION_PLAN.md`
- `README.md`
