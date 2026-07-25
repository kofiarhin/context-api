# Project Summary

## Last Task

Fixed Vercel Preview deployment creation in the Vercel gateway: the gateway no longer forwards the
literal `target: "preview"` that Vercel rejects, refuses a Preview deployment of the production
branch, and rejects a Production deployment returned for a Preview request.

## Progress

- `vercel.service.createDeployment` now resolves the requested target through
  `vercelPolicy.normalizeDeploymentTarget` and translates it: an omitted or `preview` target sends no
  `target` field upstream (Vercel has no `preview` value and rejects it), `production` sends
  `target: "production"`, anything else is a 400. The production-approval gate is unchanged.
- A Git-connected Preview request must name the branch it deploys (400 otherwise). Omitting the ref
  lets Vercel choose, and Vercel chooses the production branch — the exact failure being fixed. File
  uploads and redeploys name no Git source and are unaffected; Production requests stay approval-gated.
- Preview requests that name the production branch are refused with 403 before any upstream write.
  The branch is `VERCEL_PRODUCTION_BRANCH` when configured, otherwise the project's linked
  `productionBranch` read from Vercel. The project is only read when the request actually names a
  branch (`gitSource.ref`/`gitSource.branch`/`gitMetadata.commitRef`/`meta.githubCommitRef`/`branch`),
  so file-upload deployments cost no extra call. Comparison ignores `refs/heads/` and letter case.
- The created deployment is verified, not trusted: a result reporting `target: "production"` or
  `production: true` for a Preview request fails with 409 `VERCEL_CONFLICT` naming the deployment id
  so the caller can cancel it. The gateway does not silently cancel on the caller's behalf.
- `VERCEL_PRODUCTION_BRANCH` added to `src/config/vercel.js` (optional; setting it alone does not make
  the gateway "configured", so it cannot fail startup), `.env.example`, and the test-isolation
  inventory in `tests/helpers/providerEnvVars.js`.
- Serializer reports an upstream `target: null` as `preview`, since omitting the field is now how a
  Preview deployment is created; a payload with no target at all still gets none invented.
- `scripts/validate-vercel-gateway-release.js` replaced its old `body.target = 'preview'` assertion
  (which now describes the bug) with release rules that fail if the literal is reintroduced, if the
  service stops calling the three policy guards, or if the policy stops defining them.
- Tests: 1104 pass (1063 pre-existing, 41 new), including three that dispatch `createDeployment`
  through `vercelDispatcher` to prove the unified Zoro action inherits every guard. Confirmed red
  first — the new tests produce 16 failures against the pre-fix service and serializer.
- Pre-existing failures left untouched: `npm run lint` reports 8 errors (was 9; the one in
  `vercel.service.js` disappeared with the rewrite), all in Heroku files and `vercelRedaction.js`.
  `npm run format:check` fails repo-wide on this Windows checkout because the working tree is CRLF;
  only the two files that were Prettier-clean at HEAD were formatted, to keep the diff reviewable.
- Unrelated in-progress work in `src/services/devOpsLog.service.js` was preserved byte-for-byte and
  is not part of this change; a backup lives outside the repository at `../devOpsLog-local.patch`.

## Files

- `src/services/vercel.service.js`
- `src/services/vercelPolicy.js`
- `src/serializers/vercel.serializer.js`
- `src/config/vercel.js`
- `scripts/validate-vercel-gateway-release.js`
- `docs/VERCEL_GATEWAY_SPEC.md`
- `docs/VERCEL_GATEWAY_IMPLEMENTATION_PLAN.md`
- `docs/openapi/zoro-vercel-core-action.yaml`
- `tests/unit/vercelService.test.js`
- `tests/unit/vercelPolicy.test.js`
- `tests/unit/vercelSerializer.test.js`
- `tests/unit/vercelConfig.test.js`
- `tests/unit/vercelActionSchemas.test.js`
- `tests/helpers/providerEnvVars.js`
- `.env.example`
