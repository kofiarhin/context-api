# Context API — Full Heroku Gateway Implementation Plan

**Version:** 1.0  
**Status:** Approved for implementation  
**Owner:** Kofi  
**Implementation branch:** separate feature branch created from current `main`  
**Documentation branch:** `main`  
**Last updated:** 2026-07-24  
**Source specification:** [`HEROKU_GATEWAY_SPEC.md`](HEROKU_GATEWAY_SPEC.md)

## 1. Delivery Objective

Implement the complete Heroku Gateway defined in `HEROKU_GATEWAY_SPEC.md` inside Context API, preserving all existing behavior while adding comprehensive, authenticated Heroku Platform API access for approved resources.

The implementation is one complete delivery. It must not stop after a read-only subset, proof of concept, partial endpoint group, source-only implementation, or unverified pull request. Zoro must continue through implementation, tests, documentation, pull request, verification, approved merge, deployment, Action configuration, controlled smoke tests, cleanup, and durable reporting unless a genuine authority, credential, entitlement, billing, security, or upstream blocker makes further work impossible.

Desired end state:

```text
Kofi
  -> Zoro
  -> Context API /api/v1/heroku
  -> Heroku Platform API v3
  -> normalized and redacted results
  -> verified deployment and maintained GPT Action schemas
```

## 2. Authority and Branch Rules

- The specification and this implementation plan are approved on Context API `main`.
- Runtime implementation must occur on a new isolated feature branch created from the latest `main`.
- Recommended branch name: `feat/full-heroku-gateway`.
- Direct runtime writes to Context API `main` are not authorized.
- A focused pull request is required.
- Zoro must not merge without explicit merge authority.
- Zoro must not deploy without explicit deployment authority.
- Secret configuration must occur only in Heroku config and only with explicit authority.
- Billing-sensitive operations require explicit approval even when source implementation is approved.
- Zoro must report blockers rather than weakening security, skipping required functionality, or claiming partial work is complete.

## 3. Definition of Done

The full feature is complete only when:

- every required route in the specification is implemented;
- entitlement-dependent routes are implemented and tested with clear disabled/unavailable behavior when the account lacks access;
- all authentication, allowlist, approval, concurrency, self-protection, redaction, timeout, rate-limit, pagination, and error-translation requirements are enforced;
- all source, tests, docs, release validators, and canonical/generated OpenAPI schemas are committed on the feature branch;
- `npm ci` and `npm run verify` pass from a clean checkout;
- a focused pull request is open and independently reviewed;
- the verified PR is merged only after explicit approval;
- the exact merge revision is deployed only after explicit approval;
- generated Builder-compatible Action schemas are installed with Bearer authentication;
- controlled live read and mutation smoke tests pass;
- disposable resources are cleaned up;
- exact evidence and remaining entitlement limitations are reported;
- the feature is not described as completed before all applicable requirements above are satisfied.

## 4. Current-State Revalidation

Before changing source code, Zoro must inspect the current branch and record the exact base commit. Revalidate:

```text
package.json
.env.example
src/app.js
src/server.js
src/config/env.js
src/middleware/security.js
src/middleware/allowedMethods.js
src/middleware/errorHandler.js
src/middleware/requireGithubActionAuth.js
src/middleware/requireGithubRepositoryAccess.js
src/middleware/requireVercelActionAuth.js
src/routes/v1/github.js
src/routes/v1/vercel.js
src/controllers/github.controller.js
src/controllers/vercel.controller.js
src/services/github*
src/services/vercel*
src/serializers/*
src/validation/*
src/utils/errors.js
src/utils/responses.js
scripts/validate-github-gateway-release.js
scripts/validate-vercel-gateway-release.js
docs/openapi/*
tests/**
```

Confirm:

1. current CommonJS and Express conventions;
2. dependency injection patterns used by tests;
3. response and error envelopes;
4. correlation and request logging behavior;
5. body limits and route mounting order;
6. current provider gateway database independence;
7. environment loader production requirements;
8. test naming and mock conventions;
9. existing `npm run verify` composition;
10. current OpenAPI generation and Builder constraints;
11. no equivalent Heroku implementation or conflicting branch/PR already exists.

Run the clean baseline before implementation:

```bash
npm ci
npm test
npm run lint
npm run format:check
npm run verify
```

Record all pre-existing failures separately. Do not attribute them to the Heroku work.

## 5. File-Level Implementation Map

The implementation should use maintainable resource-domain modules rather than one oversized service file.

### 5.1 New runtime files

```text
src/controllers/heroku.controller.js
src/middleware/requireHerokuActionAuth.js
src/middleware/requireHerokuResourceAccess.js
src/middleware/requireHerokuApproval.js
src/middleware/validateHeroku.js
src/routes/v1/heroku.js
src/services/heroku/herokuClient.js
src/services/heroku/herokuPolicy.js
src/services/heroku/herokuErrors.js
src/services/heroku/account.service.js
src/services/heroku/apps.service.js
src/services/heroku/runtime.service.js
src/services/heroku/deployments.service.js
src/services/heroku/config.service.js
src/services/heroku/networking.service.js
src/services/heroku/addons.service.js
src/services/heroku/pipelines.service.js
src/services/heroku/webhooks.service.js
src/services/heroku/teams.service.js
src/services/heroku/spaces.service.js
src/serializers/heroku/account.serializer.js
src/serializers/heroku/apps.serializer.js
src/serializers/heroku/runtime.serializer.js
src/serializers/heroku/deployments.serializer.js
src/serializers/heroku/config.serializer.js
src/serializers/heroku/networking.serializer.js
src/serializers/heroku/addons.serializer.js
src/serializers/heroku/pipelines.serializer.js
src/serializers/heroku/webhooks.serializer.js
src/serializers/heroku/teams.serializer.js
src/serializers/heroku/spaces.serializer.js
src/validation/heroku/common.schemas.js
src/validation/heroku/account.schemas.js
src/validation/heroku/apps.schemas.js
src/validation/heroku/runtime.schemas.js
src/validation/heroku/deployments.schemas.js
src/validation/heroku/config.schemas.js
src/validation/heroku/networking.schemas.js
src/validation/heroku/addons.schemas.js
src/validation/heroku/pipelines.schemas.js
src/validation/heroku/webhooks.schemas.js
src/validation/heroku/teams.schemas.js
src/validation/heroku/spaces.schemas.js
```

Equivalent grouping is acceptable when it preserves clear ownership, testability, and manageable file size.

### 5.2 Existing runtime files likely to change

```text
.env.example
package.json
package-lock.json (only if dependencies change)
src/app.js
src/config/env.js
src/middleware/errorHandler.js
src/utils/errors.js
src/utils/responses.js
src/utils/logger.js
```

Do not change shared files unless current implementation evidence requires it.

### 5.3 New scripts and documentation

```text
scripts/validate-heroku-gateway-release.js
scripts/generate-heroku-action-schemas.js
docs/openapi/zoro-heroku-action.yaml
docs/openapi/zoro-heroku-runtime-action.yaml
docs/openapi/zoro-heroku-deploy-action.yaml
docs/openapi/zoro-heroku-config-action.yaml
docs/openapi/zoro-heroku-admin-action.yaml
docs/HEROKU_GATEWAY_RELEASE_CHECKLIST.md
```

Update:

```text
README.md
docs/DEPLOYMENT.md
package.json
```

## 6. Continuous Implementation Sequence

This is an ordered continuous sequence, not a set of optional phases. Zoro must complete every applicable workstream before reporting full implementation.

### 6.1 Establish branch and test harness

1. Fetch latest `main` and record its commit SHA.
2. Check open branches and pull requests for duplicate Heroku Gateway work.
3. Create `feat/full-heroku-gateway` from current `main`.
4. Run and record the clean baseline.
5. Create reusable mocked Heroku HTTP client fixtures.
6. Add fixture factories for every resource family and upstream error class.
7. Ensure automated tests cannot make live Heroku requests.
8. Add a test helper that captures request method, URL, headers, body, timeout, ETag, Range, and retry behavior.

### 6.2 Implement environment configuration

1. Add every approved Heroku variable from the specification to `.env.example` with empty or safe placeholder values.
2. Extend `src/config/env.js` using provider-specific parsing functions.
3. Validate token and Bearer-key presence without echoing values.
4. Parse booleans strictly.
5. Parse and freeze all allowlists.
6. Validate `HEROKU_SELF_APP`.
7. Validate maximum dyno quantity and timeouts.
8. Make production fail closed on invalid configuration.
9. Preserve optional non-production behavior when no Heroku variables are supplied.
10. Add exhaustive unit tests for valid, missing, malformed, duplicate, whitespace, case, secret-leakage, and boundary cases.

### 6.3 Implement dedicated authentication

1. Add `requireHerokuActionAuth`.
2. Accept only the standard `Authorization` header.
3. Require the Bearer scheme.
4. Compare credentials using `crypto.timingSafeEqual` safely for unequal lengths.
5. Never expose the configured or submitted key.
6. Never attach the key to `req`.
7. Add unit and integration tests for missing, malformed, wrong, empty, duplicate, and valid headers.

### 6.4 Implement the Heroku client

1. Use native `fetch` unless current repository conventions or verified requirements justify a dependency.
2. Centralize the upstream base URL, versioned Accept header, Bearer token, Content-Type, and User-Agent.
3. Support GET, POST, PATCH, DELETE, and HEAD if required.
4. Add bounded request timeouts with `AbortController`.
5. Support `If-Match`, `If-None-Match`, `Range`, and safe custom headers.
6. Capture safe response metadata: status, ETag, Request-Id, RateLimit-Remaining, Retry-After, Content-Range.
7. Parse JSON and bounded text responses safely.
8. Never log request authorization, source URLs, config values, certificate keys, or webhook secrets.
9. Implement bounded retry only for safe reads and explicitly idempotent operations.
10. Add unit tests for success, empty responses, malformed JSON, timeout, network errors, `304`, `402`, `409`, `412`, `422`, `429`, `500`, and `503`.

### 6.5 Implement common policy and approval enforcement

1. Define operation classifications as constants.
2. Map every operation ID to a classification.
3. Enforce global mutation switches.
4. Enforce app, team, pipeline, space, domain suffix, add-on plan, and dyno-size allowlists.
5. Validate approval evidence for sensitive operation classes.
6. Prevent middleware from self-approving or inferring approval.
7. Add self-app protections before any mutation reaches the client.
8. Block app deletion, transfer, scale-to-zero, stopping all self-app dynos, deleting the last web dyno, and deleting required config vars.
9. Enforce maximum dyno quantity.
10. Add exhaustive policy tests including case-insensitive identifiers and UUID/name resolution.

### 6.6 Implement validation and normalized errors

1. Define reusable bounded identifier schemas.
2. Reject unknown mutation fields.
3. Validate Range pagination and sorting.
4. Validate HTTPS URLs and domain suffixes.
5. Validate config keys, sizes, and mutation shapes.
6. Validate formation quantity/size and expected state.
7. Validate build source metadata and release rollback evidence.
8. Validate certificate payload sizes without logging values.
9. Validate webhook events and callback hosts.
10. Validate collaborator/team email and role inputs.
11. Validate Private Space networking inputs.
12. Add Heroku-specific errors and centralized translation.
13. Sanitize raw upstream messages and preserve only safe request IDs/details.

### 6.7 Implement account, region, stack, and rate-limit operations

Implement and test:

```text
getHerokuAccount
updateHerokuAccount
getHerokuRateLimits
listHerokuRegions
getHerokuRegion
listHerokuStacks
getHerokuStack
```

Account mutation must use a strict field allowlist and access-admin approval.

### 6.8 Implement complete app lifecycle operations

Implement and test:

```text
listHerokuApps
createHerokuApp
getHerokuApp
updateHerokuApp
deleteHerokuApp
transferHerokuApp
```

Include app allowlisting, self-app protections, billing approval for creation, expected state, and normalized app serialization.

### 6.9 Implement app features, buildpacks, and stack operations

Implement all feature, buildpack, and stack routes in the specification. Preserve positions and upstream ETags. Require production-sensitive or destructive approval as classified.

### 6.10 Implement secure config-var operations

1. Implement config metadata listing without raw value disclosure.
2. Build sensitive-name detection for common credential patterns.
3. Maintain an explicit safe-value allowlist for fields such as `NODE_ENV` when appropriate.
4. Implement patch/update with strict key/value size bounds.
5. Implement single-key deletion.
6. Prevent required self-app variable removal.
7. Ensure request logs and errors cannot contain values.
8. Test representative secrets including database URLs, tokens, private keys, passwords, certificates, API keys, and encoded credentials.

### 6.11 Implement dyno and formation operations

Implement all required dyno and formation reads and mutations. Include:

- current dyno and formation serializers;
- single-dyno stop/restart semantics;
- restart-all semantics;
- batch and single process-type scaling;
- size and quantity allowlists;
- maximum quantity;
- expected current quantity and size;
- ETag where supported;
- self-app minimum web capacity;
- prevention of arbitrary one-off shell execution.

### 6.12 Implement source, build, slug, release, and rollback operations

1. Implement source creation and short-lived URL handling.
2. Ensure source URLs are never logged or durably reported.
3. Implement build list/create/info.
4. Implement slug list/info/create where supported.
5. Implement release list/info/create.
6. Implement rollback with expected current release evidence.
7. Model asynchronous build/release states without false success claims.
8. Add polling guidance but no unbounded internal polling.
9. Test exact commit/version metadata propagation.

### 6.13 Implement bounded logs access

1. Implement log-session creation.
2. Implement `logs/query` as a server-side bounded fetch of a non-tail session URL.
3. Limit lines, source, dyno, timeout, redirects, and response bytes.
4. Reject non-Heroku or insecure log URLs.
5. Strip temporary URLs from logs and reports.
6. Normalize plain-text log output safely.
7. Test timeout, truncation, invalid URL, oversized response, unavailable logs, and upstream disconnect.

### 6.14 Implement domains and SNI operations

1. Implement all domain CRUD routes.
2. Enforce domain suffix allowlist.
3. Return DNS target and ACM status safely.
4. Implement SNI list/info/create/update/delete.
5. Accept certificate chain and private key only in bounded request bodies.
6. Never echo or log certificate private keys.
7. Test invalid domains, policy denials, duplicate domains, certificate errors, and destructive approval.

### 6.15 Implement add-ons and attachments

1. Implement add-on list/create/info/update/delete.
2. Implement attachment list/create/info/update/delete.
3. Enforce plan allowlist.
4. Require billing switch and explicit approval for provisioning and plan changes.
5. Require destructive approval for deprovisioning.
6. Redact credentials and injected config details.
7. Test payment-required, verification-needed, plan unavailable, attachment conflicts, and cleanup.

### 6.16 Implement collaborators and app permissions

Implement all collaborator operations with:

- access-admin feature switch;
- strict email/role validation;
- explicit approval;
- protection against removing the authenticated owner or required operational access without explicit expected-state evidence;
- safe serialization.

### 6.17 Implement pipelines, couplings, promotions, and config

1. Implement pipeline CRUD.
2. Implement pipeline app/coupling list, create, and delete.
3. Implement promotions and promotion target status.
4. Require expected source release and target app evidence for production promotion.
5. Implement pipeline stage config metadata/update with redaction.
6. Enforce pipeline and app allowlists.
7. Test partial promotion failures and asynchronous target states.

### 6.18 Implement review apps

1. Implement review-app list/create/info/delete.
2. Implement review-app configuration read/update.
3. Restrict creation to approved pipelines and repositories.
4. Require billing approval where applicable.
5. Require cleanup metadata or explicit retention reason.
6. Test creation failure, build failure, deletion, and cleanup evidence.

### 6.19 Implement webhooks

1. Implement app webhook list/create/info/delete and delivery reads.
2. Implement pipeline webhook list/create/delete.
3. Validate HTTPS callback URLs and approved callback hosts.
4. Treat webhook secrets as write-only.
5. Enforce event allowlists and platform limits.
6. Test duplicate subscriptions, invalid events, failed deliveries, and secret non-disclosure.

### 6.20 Implement teams and usage

Implement team CRUD, apps, members, invitations, usage, and invoices. Include:

- team allowlisting;
- access-admin and billing feature switches;
- explicit approval for member/invitation/team mutations;
- minimized invoice serialization;
- no payment-method details;
- entitlement-aware errors.

### 6.21 Implement conditional Private Space operations

1. Revalidate exact current Heroku Platform API routes and fields.
2. Implement space CRUD, apps, access, topology, NAT, and VPN operations defined in the specification.
3. Guard all mutations with the Private Space feature switch, allowlist, entitlement checks, and approval.
4. Never infer enterprise entitlement.
5. Return clear feature-disabled or entitlement-unavailable errors when inaccessible.
6. Test all code paths with mocks even when no live entitlement exists.

### 6.22 Integrate routes into Express

1. Add a Heroku-specific JSON body limit suitable for certificates and config updates while remaining bounded.
2. Mount `/api/v1/heroku` before the MongoDB request guard.
3. Apply middleware in this order:

```text
route-specific JSON parser
Heroku Action authentication
resource policy
approval policy where required
validation
controller
```

4. Preserve global Helmet, CORS, correlation, request logger, query limits, rate limiting, and allowed methods.
5. Add route-registration and database-independence integration tests.
6. Verify existing routes are unchanged.

### 6.23 Implement complete serializers

Create explicit serializers for every resource family. Do not return raw upstream objects. Test field allowlists and redactions with fixtures containing unexpected sensitive values.

### 6.24 Implement canonical and generated OpenAPI schemas

1. Create canonical `docs/openapi/zoro-heroku-action.yaml` containing every route.
2. Create deterministic generator for capability-group schemas.
3. Flatten reusable constructs that GPT Builder cannot parse.
4. Ensure every operation ID is unique.
5. Keep each Builder schema within operation limits.
6. Preserve production server URL and dedicated Bearer security.
7. Ensure sensitive request fields are write-only where supported.
8. Ensure config reads document redaction.
9. Add schema validation and drift checks to release verification.

### 6.25 Implement release validation

`scripts/validate-heroku-gateway-release.js` must fail when:

- any required route is missing;
- any route lacks authentication;
- sensitive routes lack policy/approval protection;
- self-app protections are missing;
- config reads can expose raw values;
- generated schemas drift from canonical routes;
- operation IDs duplicate;
- Builder groups exceed limits;
- production server or security definitions are wrong;
- required docs or tests are missing;
- `npm run verify` omits the Heroku validator.

### 6.26 Complete documentation

Update README and deployment docs with:

- architecture and route groups;
- environment variable names without values;
- authentication model;
- policy switches and allowlists;
- self-protection behavior;
- config redaction;
- local development and test instructions;
- clean verification commands;
- deployment steps;
- Action schema generation/import;
- controlled smoke-test checklist;
- rollback and incident response;
- known entitlement-dependent behavior.

Create `docs/HEROKU_GATEWAY_RELEASE_CHECKLIST.md` with checkboxes and exact evidence requirements.

## 7. Test File Plan

Recommended tests:

```text
tests/unit/herokuEnv.test.js
tests/unit/herokuAuth.test.js
tests/unit/herokuPolicy.test.js
tests/unit/herokuApproval.test.js
tests/unit/herokuSelfProtection.test.js
tests/unit/herokuClient.test.js
tests/unit/herokuErrors.test.js
tests/unit/herokuPagination.test.js
tests/unit/herokuConfigRedaction.test.js
tests/unit/herokuSerializers.test.js
tests/unit/herokuOpenApiGenerator.test.js
tests/services/herokuAccountService.test.js
tests/services/herokuAppsService.test.js
tests/services/herokuRuntimeService.test.js
tests/services/herokuDeploymentsService.test.js
tests/services/herokuConfigService.test.js
tests/services/herokuNetworkingService.test.js
tests/services/herokuAddonsService.test.js
tests/services/herokuPipelinesService.test.js
tests/services/herokuWebhooksService.test.js
tests/services/herokuTeamsService.test.js
tests/services/herokuSpacesService.test.js
tests/integration/herokuRoutes.test.js
tests/integration/herokuAuthentication.test.js
tests/integration/herokuPolicy.test.js
tests/integration/herokuBodyLimit.test.js
tests/integration/herokuDatabaseIndependence.test.js
tests/integration/herokuSecretLeakage.test.js
tests/integration/herokuRegression.test.js
tests/integration/herokuProductionRegistration.test.js
tests/contract/herokuOpenApi.test.js
```

Use repository naming conventions when they differ. Coverage responsibility is mandatory even if files are consolidated.

## 8. Verification Commands

During implementation, run focused tests after each resource domain. Before the pull request is declared implementation-complete, run from a clean checkout:

```bash
npm ci
npm test
npm run lint
npm run format:check
npm run verify:github-gateway
npm run verify:vercel-gateway
npm run verify:heroku-gateway
npm run verify
```

Also run:

```bash
node scripts/generate-heroku-action-schemas.js --check
```

If a coverage threshold exists, it must pass. If none exists, report meaningful coverage and uncovered branches without inventing a percentage requirement.

## 9. Commit and Pull Request Plan

Use focused commits, for example:

```text
test: add Heroku gateway fixtures and baseline coverage
feat: add Heroku configuration and authenticated client
feat: add Heroku policy approval and self protection
feat: add Heroku app runtime and deployment operations
feat: add Heroku config networking and addon operations
feat: add Heroku pipeline webhook team and space operations
test: complete Heroku gateway integration and security coverage
docs: add Heroku gateway schemas release checks and deployment guide
```

Before opening the PR:

1. Rebase or update from current `main` without force-pushing shared work.
2. Resolve conflicts while preserving the approved specification.
3. Run clean verification again.
4. Confirm changed files are scoped to the gateway and necessary shared infrastructure.
5. Scan for secrets, tokens, private keys, URLs containing credentials, populated config values, and test fixtures that resemble real credentials.
6. Open one focused PR referencing:
   - `docs/HEROKU_GATEWAY_SPEC.md`;
   - `docs/HEROKU_GATEWAY_IMPLEMENTATION_PLAN.md`;
   - work key `context-api:full-heroku-gateway`;
   - exact base and head revisions;
   - verification commands and outcomes;
   - deployment and merge still pending unless separately authorized.

## 10. Independent Review Requirements

The pull request must be independently inspected for:

- endpoint completeness against the specification;
- authentication on every route;
- policy and approval classification accuracy;
- self-app protections;
- config and certificate secret handling;
- source/log temporary URL handling;
- billing and destructive safeguards;
- ETag and expected-state correctness;
- retry safety;
- error sanitization;
- route database independence;
- regression risk to existing gateways;
- canonical/generated schema consistency;
- test quality and no-live-network guarantees.

Zoro must address actionable review findings on the same feature branch and rerun verification.

## 11. Merge, Deployment, and Action Configuration

These steps require explicit authority at the time they occur.

### 11.1 Merge

- Confirm PR approval and green checks.
- Confirm no newer conflicting `main` changes.
- Merge using the repository's approved strategy.
- Record merge commit SHA.

### 11.2 Heroku configuration

Set required variables without exposing values in chat, repository, logs, or reports. Confirm only names and configured state.

### 11.3 Deploy

- Deploy the exact verified merge revision.
- Record Heroku release version and commit SHA.
- Confirm startup and MongoDB connection.
- Confirm `/health` and existing gateways.
- Roll back immediately on startup, auth, policy, or regression failure.

### 11.4 GPT Builder configuration

- Generate Builder-compatible capability schemas from the merged canonical schema.
- Import each schema using the production Context API URL.
- Configure API Key authentication with Bearer transport using `ZORO_HEROKU_API_KEY`.
- Verify operation count and parsing.
- Test each capability group in a fresh Zoro conversation.
- Do not paste secrets into repository files or reports.

## 12. Controlled Live Smoke Test

Use approved existing resources for reads and disposable resources for mutations wherever possible.

Required checks:

1. Unauthorized request returns `401`.
2. Account and rate-limit reads succeed.
3. Approved app list/info succeeds.
4. Denied app fails closed.
5. Formation, dyno, build, release, domain, add-on, pipeline, webhook, team, and eligible space reads serialize correctly.
6. Config values remain redacted.
7. Self-app deletion is blocked.
8. Self-app scale-to-zero is blocked.
9. Required self-app config deletion is blocked.
10. Sensitive mutation without approval fails.
11. Approved reversible mutation succeeds on a disposable app.
12. ETag or expected-state conflict fails safely.
13. Build/release workflow is tied to exact source version where tested.
14. Logs query is bounded and does not leak the temporary URL.
15. Billing-sensitive operation is blocked when the switch is disabled.
16. Access-admin operation is blocked when disabled.
17. Entitlement-dependent operations return a clear result.
18. Disposable apps, domains, add-ons, webhooks, pipeline couplings, review apps, and other created resources are removed.
19. Cleanup is verified independently.
20. Heroku request IDs, release version, deployed commit, tested operations, untested entitlements, and remaining risks are retained.

Do not run destructive or billing tests against production resources merely to satisfy coverage. Mocked automated verification remains authoritative for unsafe paths; live limitations must be reported accurately.

## 13. Required Zoro Reporting

Zoro's final implementation report must include:

- originating assignment ID;
- work key `context-api:full-heroku-gateway`;
- Context API base revision;
- feature branch;
- commits;
- pull request;
- complete changed-file list;
- endpoint completion matrix;
- tests and exact commands run;
- test, lint, format, release-validator, and schema-generator results;
- independent review findings and resolutions;
- merge status and commit, if authorized;
- deployment status, Heroku release, and deployed commit, if authorized;
- Action schema generation and Builder configuration status;
- live smoke-test operations and safe request IDs;
- disposable resource cleanup;
- entitlement-dependent operations not live-tested;
- blockers, risks, and residual limitations;
- confirmation that no secrets were committed or exposed;
- exact next required Architect/Kofi action if anything remains.

Implementation work is not complete merely because a PR exists. Zoro must continue responding to review and verification findings until the full feature is either completed or blocked by a specific authority/credential/entitlement dependency.

## 14. Blocker Protocol

Zoro may stop only for a concrete blocker such as:

- required Heroku token or permission is unavailable;
- explicit merge, deployment, billing, access-admin, or destructive authority is required and absent;
- the current Heroku schema contradicts the approved specification materially;
- an entitlement required for live verification is unavailable;
- repository protections prevent the authorized branch or PR workflow;
- a security issue makes continued implementation unsafe;
- independent verification finds a requirement conflict needing Kofi's decision.

A blocker report must include:

- exact blocked requirement;
- evidence;
- work completed;
- work remaining;
- safe options;
- recommended decision;
- whether implementation can continue on unaffected work.

Zoro must continue all unaffected work before reporting a terminal blocker.

## 15. Risks and Mitigations

| Risk | Required mitigation |
| --- | --- |
| Gateway disables itself | Self-app deletion, scale-to-zero, last-web-dyno stop, and required-config removal blocks |
| Secret disclosure | Explicit serializers, redaction, safe logs, request-field suppression, secret scans |
| Unexpected cost | Billing switch, plan allowlist, approval evidence, no automatic paid provisioning |
| Destructive retry | No automatic retries for destructive mutations |
| Stale update | ETag/`If-Match` or expected-state checks |
| API drift | Current Platform API schema revalidation and contract tests |
| Builder operation limit | Canonical schema plus generated capability groups |
| Upstream rate limit | Bounded pagination, quota metadata, no polling loops |
| Multiple Context API dynos | Distributed rate-limit store required before horizontal scale |
| MongoDB startup outage | Document current process coupling; do not falsely claim provider independence at process level |
| Private Space entitlement | Feature switch, mocked tests, clear unavailable response |
| Long-running builds/releases | `202` state modeling and caller-driven bounded status checks |
| Log URL leakage | Server-side bounded fetch and URL suppression |
| Certificate leakage | Write-only bounded input, no echo/log/persistence |

## 16. Completion Checklist

- [ ] Current `main` and duplicate work revalidated
- [ ] Feature branch created from recorded base SHA
- [ ] Baseline verification recorded
- [ ] Environment validation implemented and tested
- [ ] Dedicated Bearer auth implemented and tested
- [ ] Heroku client implemented and tested
- [ ] Policy, approvals, and self-protection implemented and tested
- [ ] All account/platform routes implemented
- [ ] All app routes implemented
- [ ] All feature/buildpack/stack routes implemented
- [ ] All config routes implemented with redaction
- [ ] All dyno/formation routes implemented
- [ ] All source/build/slug/release/rollback routes implemented
- [ ] Bounded log routes implemented
- [ ] All domain/SNI routes implemented
- [ ] All add-on/attachment routes implemented
- [ ] All collaborator routes implemented
- [ ] All pipeline/promotion/config routes implemented
- [ ] All review-app routes implemented
- [ ] All webhook routes implemented
- [ ] All team routes implemented
- [ ] Conditional Private Space routes implemented
- [ ] Express integration and database independence tested
- [ ] Serializers and error translation complete
- [ ] Canonical OpenAPI complete
- [ ] Builder schemas generated and validated
- [ ] Release validator complete
- [ ] README, deployment guide, and release checklist updated
- [ ] No-live-network automated tests complete
- [ ] Existing gateway regression tests pass
- [ ] Clean `npm ci` and `npm run verify` pass
- [ ] Secret scan passes
- [ ] Focused PR opened
- [ ] Independent review completed
- [ ] Review findings resolved
- [ ] Merge explicitly approved and completed
- [ ] Exact merge revision deployed
- [ ] Action schemas configured
- [ ] Controlled smoke test completed
- [ ] Disposable resources cleaned up
- [ ] Durable final report submitted

No unchecked applicable item may be silently treated as complete.
