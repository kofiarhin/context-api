# Zoro Autonomy Implementation Plan

## 1. Purpose

This plan translates `docs/ZORO_AUTONOMY_SPEC.md` into an ordered, reviewable delivery program for `kofiarhin/context-api`.

It is deliberately structured as multiple focused pull requests. The plan does not authorize implementation, merging, deployment, migration, or production rollout. Each phase requires separate approval under the repository’s normal governance.

---

## 2. Delivery principles

1. **One architectural concern per PR where practical.**
2. **No direct-main implementation.** Use isolated branches and focused pull requests.
3. **Discovery before orchestration.** Zoro must understand contracts before higher-level workflows depend on them.
4. **Persistence before resumability claims.** Do not claim resumable runs while critical state remains process-local.
5. **Security before convenience.** Shared capabilities, SSRF controls, redaction, approval, and expected-state protections must exist before autonomous deployment workflows.
6. **Evidence before completion.** Passing tests, deployment, smoke verification, and completion remain distinct states.
7. **Backward compatibility by default.** Existing provider gateways and low-level operations must continue to work.
8. **No generic provider proxy.** Every operation and workflow remains closed-catalogue and purpose-bound.
9. **No silent authority expansion.** High-level workflows aggregate existing controls; they do not bypass them.
10. **Every phase includes rollback instructions.**

---

## 3. Repository scope

### Primary repository

- `kofiarhin/context-api`

### Test fixture repository

- `kofiarhin/zoro-full-flow-test-20260726`

The fixture repository is used for bounded private-source workflow tests only. It should not contain Context API control-plane logic.

### Optional records repository

- `kofiarhin/ideahub`

Only update Ideas Hub after an approved and verified project-state transition. Documentation creation or implementation alone does not justify completion updates.

---

## 4. Proposed target file structure

Paths below are proposed. Before each phase, inspect the current repository and adapt names to existing conventions.

```text
src/
  models/
    ProviderCapability.js
    ZoroRun.js

  services/
    capabilities/
      capabilityCrypto.js
      capabilityPolicy.js
      capabilityStore.js
      mongoCapabilityStore.js

    workflows/
      deployGitHubDirectoryToHeroku.js
      deployGitHubDirectoryToVercel.js
      verifyHttpEndpoints.js
      workflowEvidence.js
      workflowPoller.js

    zoro/
      correlation.service.js
      errorClassifier.js
      operationDiscovery.service.js
      preflight.service.js
      providerConstraints.js
      recoveryPolicy.js
      retryPlanner.js
      zoroRun.service.js
      zoroRunEvidence.service.js
      zoroRunStateMachine.js

  serializers/
    operationEnvelope.serializer.js
    preflight.serializer.js
    zoroOperation.serializer.js
    zoroRun.serializer.js

  validators/
    providerResourceName.validator.js
    zoroOperationDiscovery.validator.js
    zoroRun.validator.js

scripts/
  check-case-collisions.js

tests/
  unit/
  integration/
```

---

## 5. Phase overview

| Phase | Outcome | Risk | Recommended PRs |
|---|---|---:|---:|
| 0 | Baseline and repository hygiene | Low | 1 |
| 1 | Operation discovery | Low | 1 |
| 2 | Strict schemas and provider preflight | Medium | 1–2 |
| 3 | Persistent run state | Medium | 2 |
| 4 | Shared encrypted capability store | High | 2 |
| 5 | Standard envelopes and errors | Medium | 1–2 |
| 6 | Recovery and polling | Medium | 2 |
| 7 | High-level Heroku workflow | High | 2 |
| 8 | High-level Vercel workflow | High | 2 |
| 9 | GPT schema/instruction integration | Medium | 1 |
| 10 | Rollout, measurement, and hardening | High | Ongoing |

---

# Phase 0 — Baseline and repository hygiene

## 0.1 Objectives

- Establish a known-good verification baseline.
- Eliminate case-insensitive tracked-path collisions.
- Add CI verification for future collisions.
- Document current catalogue, provider policies, and schema-generation paths.

## 0.2 Inspect before editing

Inspect:

```text
package.json
src/services/zoro/
src/services/heroku/
src/services/github/
src/services/vercel/
src/serializers/
src/config/
src/models/
scripts/
tests/
```

Specifically identify the canonical files for:

- unified catalogue;
- unified dispatcher;
- controller and route;
- Heroku route descriptors;
- provider policies;
- provider serializers;
- Mongoose connection and model registration;
- error middleware;
- Action schema generators;
- release validation scripts.

## 0.3 Existing files likely to change

```text
package.json
src/services/devOpsLog.service.js or src/services/devopsLog.service.js
all imports referencing the canonical DevOps log service
```

## 0.4 New files

```text
scripts/check-case-collisions.js
tests/unit/pathCaseCollision.test.js
```

## 0.5 Implementation details

1. Select one canonical path, recommended:

   ```text
   src/services/devopsLog.service.js
   ```

2. Perform a Git-safe two-step rename if required for case-only changes.
3. Update all imports to exact casing.
4. Implement `check-case-collisions.js` using `git ls-files` or a repository tree walk.
5. Normalize paths using Unicode-aware case folding appropriate for JavaScript runtime constraints.
6. Fail when two different tracked paths map to the same normalized path.
7. Add the script to `npm run verify`.

## 0.6 Tests

- Detect a synthetic collision.
- Pass for the real repository.
- Report both conflicting paths.
- Verify no false positive for unrelated paths.

## 0.7 Acceptance criteria

- Working tree can be stashed and restored on Windows without the known collision.
- `npm run verify` includes the collision check.
- Existing tests pass.

## 0.8 Rollback

Revert the focused rename/check commit. No data migration is involved.

---

# Phase 1 — Operation discovery

## 1.1 Objectives

- Make registered operations discoverable from the execution source of truth.
- Eliminate operation-name and dispatcher guessing.
- Publish safe parameter schemas and examples.

## 1.2 Existing files likely to change

```text
src/services/zoro/zoroCatalogue.js
src/services/zoro/zoroDispatcher.js
src/controllers/zoro.controller.js
src/routes/zoro.routes.js
unified Action schema source/generator
```

Use actual repository paths discovered during Phase 0.

## 1.3 New files

```text
src/services/zoro/operationDiscovery.service.js
src/serializers/zoroOperation.serializer.js
src/validators/zoroOperationDiscovery.validator.js
tests/unit/zoroOperationDiscovery.test.js
tests/integration/zoroOperationDiscovery.integration.test.js
```

## 1.4 Catalogue metadata changes

Extend each operation descriptor with normalized metadata where not already derivable:

```js
{
  target: 'github',
  method: 'mergePullRequest',
  classification: 'merge',
  expectedState: 'expectedHeadSha',
  summary: 'Merge a pull request when the expected head SHA still matches.',
  provider: 'github',
  mutates: true,
  retryPolicy: 'reconcile-before-retry',
  workflowTags: ['pull-request', 'merge'],
  requestSchema: {...},
  safeExample: {...}
}
```

Do not duplicate fields already available from provider descriptors. Add helper functions that derive metadata from the catalogue and schemas.

## 1.5 Operations

Register:

```text
system.describeOperations
system.describeOperation
system.resolveOperation
```

Recommended dispatcher:

```text
system.describe
```

Alternative: add operations under a broader `system` dispatcher if the current unified route contract permits it cleanly.

## 1.6 Security requirements

- Discovery is read-only.
- Do not return secret configuration state beyond safe booleans such as `configured: true` where already permitted.
- Do not return internal function references, provider tokens, private URLs, raw policies, or unredacted examples.
- Bound response size and support filters.

## 1.7 Tests

- Every registered operation appears exactly once under its dispatcher.
- `mergePullRequest` resolves to `github.review`.
- `listHerokuApps` resolves to `heroku.execute`.
- Unknown operations return `OPERATION_NOT_FOUND`.
- Ambiguous operations return all safe matches.
- Examples contain no secret-like fields or signed URLs.
- Discovery output matches the current catalogue revision.

## 1.8 Verification

```bash
npm test -- --runInBand
npm run lint
npm run format:check
npm run verify
```

## 1.9 Rollout

Deploy as read-only functionality. No client behavior changes are required initially.

## 1.10 Rollback

Remove the new dispatcher/operations and files. Existing execution remains unchanged.

---

# Phase 2 — Strict schemas and provider-aware preflight

## 2.1 Objectives

- Detect workflow blockers before resource mutation.
- Validate provider names and parameter placement locally.
- Produce a normalized, reviewable workflow plan.

## 2.2 Existing files likely to change

```text
src/services/zoro/zoroCatalogue.js
src/services/zoro/zoroDispatcher.js
src/services/heroku/herokuRoutes.js
src/services/heroku/heroku.service.js
src/services/heroku/herokuPolicy.js
src/services/github/githubPolicy.js
src/services/vercel/vercelPolicy.js
scripts/generate-heroku-action-schemas.js
other Action schema generators
```

## 2.3 New files

```text
src/services/zoro/preflight.service.js
src/services/zoro/providerConstraints.js
src/validators/providerResourceName.validator.js
src/serializers/preflight.serializer.js
tests/unit/zoroPreflight.test.js
tests/unit/providerResourceName.test.js
tests/integration/zoroPreflight.integration.test.js
```

## 2.4 Provider constraint representation

Prefer versioned plain data plus small validation functions:

```js
const constraints = {
  heroku: {
    appName: {
      minLength: 3,
      maxLength: 30,
      pattern: /^[a-z][a-z0-9-]*[a-z0-9]$/,
    },
  },
};
```

Keep only stable constraints locally. Provider APIs remain authoritative for availability and account-specific restrictions.

## 2.5 Preflight operation

Register:

```text
system.preflightWorkflow
system.validateResourceName
```

Preflight must be read-only and must not reserve names or create resources.

## 2.6 Workflow definitions

Add a static closed workflow catalogue describing required steps and operations:

```js
{
  name: 'deployGitHubDirectoryToHeroku',
  revision: '1',
  requiredOperations: [
    ['github.read', 'getContent'],
    ['heroku.execute', 'createHerokuSource'],
    ['heroku.execute', 'uploadHerokuSourceArchive'],
    ['heroku.execute', 'createHerokuBuild'],
    ['heroku.execute', 'getHerokuBuild']
  ]
}
```

Do not execute workflows in this phase.

## 2.7 Tests

- Reject a Heroku app name over 30 characters before mutation.
- Recommend a deterministic normalized alternative.
- Detect missing operation dependencies.
- Detect inaccessible repository/commit/source directory.
- Detect Context API self-targeting.
- Detect duplicate active resource intent when enough context is available.
- Validate correct nested `parameters.body` shape.
- Ensure preflight does not call mutation methods.

## 2.8 Acceptance criteria

- The original Heroku name-length error is found before app creation or rename.
- The original missing source-upload operation would have been detected before disposable resource creation.
- Misplaced request fields return local schema guidance rather than a generic provider error.

## 2.9 Rollback

Remove preflight operations. Existing provider execution remains available.

---

# Phase 3 — Persistent Zoro run state

Split this phase into two PRs.

## PR 3A — Data model and state machine

### 3A.1 Existing files likely to change

```text
src/models/index.js or model registration equivalent
src/config/env.js
src/config/database.js or connection equivalent
```

### 3A.2 New files

```text
src/models/ZoroRun.js
src/services/zoro/zoroRunStateMachine.js
src/validators/zoroRun.validator.js
tests/unit/zoroRunStateMachine.test.js
tests/unit/zoroRunModel.test.js
```

### 3A.3 Model requirements

Indexes:

- unique `runId`;
- `status + updatedAt`;
- `workflow + status`;
- optional partial unique index for active idempotency keys;
- TTL only for explicitly ephemeral run types, not all runs.

Run fields must distinguish:

- requested parameters;
- normalized parameters;
- resources;
- approvals;
- steps;
- evidence;
- blockers;
- next safe action;
- workflow revision;
- optimistic concurrency version.

### 3A.4 State machine requirements

- Encode allowed transitions explicitly.
- Reject arbitrary terminal-state assignment.
- Require evidence references for `verified`.
- Require completion conditions for `completed`.
- Support cancellation and failure.
- Preserve history of transitions.

## PR 3B — Run service and API operations

### 3B.1 Existing files likely to change

```text
src/services/zoro/zoroCatalogue.js
src/services/zoro/zoroDispatcher.js
src/controllers/zoro.controller.js
src/routes/zoro.routes.js
```

### 3B.2 New files

```text
src/services/zoro/zoroRun.service.js
src/services/zoro/zoroRunEvidence.service.js
src/serializers/zoroRun.serializer.js
tests/unit/zoroRun.service.test.js
tests/integration/zoroRun.integration.test.js
```

### 3B.3 Operations

```text
workflow.createRun
workflow.getRun
workflow.listRuns
workflow.resumeRun
workflow.cancelRun
```

Do not expose raw `recordStep` or arbitrary status mutation to the GPT. Step recording is internal to workflow execution.

### 3B.4 Resume algorithm

1. Read run with version.
2. Verify workflow revision is supported.
3. Re-run preflight for unresolved dependencies.
4. Reconcile stored resources against providers.
5. Re-evaluate approvals.
6. Detect duplicate active worker lease.
7. Select next safe step.
8. Transition using optimistic concurrency.

### 3B.5 Tests

- Create idempotent run.
- Reject duplicate active run with same idempotency key.
- Block invalid transitions.
- Survive service process restart.
- Resume from blocked step.
- Detect provider state mismatch.
- Preserve immutable resource IDs.
- Invalidate approval after material parameter change.

### 3B.6 Migration

No existing records require migration. Create indexes during deployment startup or a controlled migration step according to current repository convention.

### 3B.7 Rollback

The new collection may remain unused. Remove API registration and leave records intact until a later cleanup decision.

---

# Phase 4 — Shared encrypted capability storage

Split this phase into foundation and Heroku migration PRs.

## PR 4A — Capability foundation

### 4A.1 Existing files likely to change

```text
src/config/env.js
src/config/heroku.js
src/models/index.js
error/redaction utilities
```

### 4A.2 New files

```text
src/models/ProviderCapability.js
src/services/capabilities/capabilityCrypto.js
src/services/capabilities/capabilityPolicy.js
src/services/capabilities/capabilityStore.js
src/services/capabilities/mongoCapabilityStore.js
tests/unit/capabilityCrypto.test.js
tests/unit/capabilityPolicy.test.js
tests/integration/capabilityStore.integration.test.js
```

### 4A.3 Key-management decision gate

Before implementation, explicitly approve one key strategy:

- dedicated Heroku config encryption key with version;
- external KMS envelope encryption;
- another managed secret source.

Recommended first release: dedicated 32-byte key supplied as Base64 through environment configuration, with `CAPABILITY_ENCRYPTION_KEY_VERSION`. Document rotation and require startup validation.

### 4A.4 Model and indexes

Indexes:

- unique `capabilityId`;
- TTL `expiresAt`;
- `runId + purpose`;
- `status + expiresAt`.

### 4A.5 Atomic consumption

Implement lease-based atomic consumption to handle concurrent requests and uncertain upstream outcomes.

### 4A.6 Tests

- encrypt/decrypt round trip;
- associated-data mismatch;
- wrong key version;
- expiry enforced before TTL deletion;
- single-use under concurrency;
- lease timeout;
- no plaintext persisted;
- redaction of encrypted payload fields.

## PR 4B — Migrate Heroku source capability

### 4B.1 Existing files likely to change

```text
src/services/heroku/herokuSourceUpload.js
src/services/heroku/heroku.service.js
src/services/heroku/herokuRoutes.js
src/serializers/heroku.serializer.js
```

### 4B.2 Tests

```text
tests/integration/herokuSourceCapability.integration.test.js
```

Required cases:

- create capability in process A, consume in process B;
- expired capability;
- replay;
- concurrent use;
- wrong run/resource binding;
- invalid destination;
- redirect rejection;
- signed URL absent from logs and responses;
- build consumes internal download target;
- process restart does not lose capability.

### 4B.3 Rollout

1. Deploy shared store support with process-local fallback disabled in production but optionally enabled in test.
2. Verify single-dyno and multi-process integration tests.
3. Run bounded live source-upload smoke test.
4. Remove legacy in-memory implementation after successful production verification.

### 4B.4 Rollback

Rollback application release before creating new capabilities. Existing encrypted capability records expire automatically.

---

# Phase 5 — Standard envelopes and structured errors

## 5.1 Objectives

- Make operation outcomes consistent.
- Improve safe remediation decisions.
- Preserve compatibility.

## 5.2 Existing files likely to change

```text
src/controllers/zoro.controller.js
src/middleware/errorHandler.js or equivalent
src/utils/errors.js
src/serializers/heroku.serializer.js
src/serializers/github.serializer.js
src/serializers/vercel.serializer.js
provider error translators
```

## 5.3 New files

```text
src/serializers/operationEnvelope.serializer.js
src/services/zoro/correlation.service.js
src/services/zoro/errorClassifier.js
tests/unit/operationEnvelope.test.js
tests/unit/errorClassifier.test.js
```

## 5.4 Compatibility strategy

Recommended:

- add `responseRevision: 2` request support;
- discovery advertises supported revisions;
- existing callers remain on current shape;
- high-level workflows require revision 2;
- later migrate the GPT Action and retire revision 1 after evidence.

## 5.5 Tests

- success status included;
- operation and dispatcher included;
- provider request ID included when safe;
- safe details preserved;
- secrets redacted recursively;
- signed URLs redacted;
- legacy response unchanged without revision 2;
- error codes map consistently across providers.

## 5.6 Rollback

Disable response revision 2 while keeping internal correlation IDs.

---

# Phase 6 — Recovery and polling

Split into policy and execution PRs.

## PR 6A — Recovery policy

### 6A.1 New files

```text
src/services/zoro/recoveryPolicy.js
src/services/zoro/retryPlanner.js
tests/unit/zoroRecoveryPolicy.test.js
tests/unit/zoroRetryPlanner.test.js
```

### 6A.2 Existing files likely to change

```text
src/services/zoro/zoroDispatcher.js
src/services/zoro/errorClassifier.js
```

### 6A.3 Initial automatic-recovery allowlist

- unique operation resolution;
- unique dispatcher resolution;
- documented field relocation;
- preflight-approved resource-name normalization;
- transient read retry;
- rate-limit backoff;
- async pending state.

Everything else stops by default.

### 6A.4 Tests

- no retry for expected-state mismatch;
- no retry for destructive/billing/access/security errors;
- bounded retry counts;
- mutation transport uncertainty triggers reconciliation, not replay;
- correction history recorded as evidence.

## PR 6B — Workflow poller

### 6B.1 New files

```text
src/services/workflows/workflowPoller.js
src/services/workflows/workflowEvidence.js
tests/unit/workflowPoller.test.js
tests/integration/workflowPoller.integration.test.js
```

### 6B.2 Poller behavior

- configurable minimum interval, recommended 5 seconds for provider builds;
- maximum total timeout;
- terminal-state map per provider operation;
- cancellation check between attempts;
- provider rate-limit handling;
- evidence per state change, not every identical poll unless debugging.

### 6B.3 Worker architecture decision

For the first implementation, choose one:

1. **Bounded synchronous polling** for workflows expected to finish within request limits.
2. **Lease-based resumable polling** where each request advances one or more steps.
3. **Background worker** using a separate process.

Recommended first release: lease-based resumable polling. It avoids long HTTP requests and does not require introducing a new queue immediately.

---

# Phase 7 — High-level GitHub-to-Heroku workflow

Split into dry-run orchestration and live execution PRs.

## PR 7A — Workflow orchestration without live mutation

### 7A.1 New files

```text
src/services/workflows/deployGitHubDirectoryToHeroku.js
tests/unit/deployGitHubDirectoryToHeroku.test.js
```

### 7A.2 Existing files likely to change

```text
src/services/zoro/zoroCatalogue.js
src/services/zoro/zoroDispatcher.js
workflow catalogue/preflight modules
```

### 7A.3 Implement

- workflow definition;
- step graph;
- run creation;
- preflight;
- approval aggregation;
- dry-run plan response;
- resource binding rules;
- verification criteria representation.

### 7A.4 Tests

- complete plan generated;
- missing operation blocks before mutation;
- wrong app identity blocks;
- source directory missing blocks;
- self-targeting blocks;
- approval requirements aggregate correctly;
- duplicate active run detected.

## PR 7B — Live execution

### 7B.1 Integrate existing services

Use in-process provider services only:

- GitHub installation client/service;
- Heroku create source;
- shared capability store;
- source archive upload;
- create build;
- build read/poll;
- app/process read;
- endpoint verification.

### 7B.2 New files

```text
src/services/workflows/verifyHttpEndpoints.js
tests/unit/verifyHttpEndpoints.test.js
tests/integration/herokuDeploymentWorkflow.integration.test.js
```

### 7B.3 Endpoint verification safety

URLs must derive from the target Heroku app resource read during the workflow. Reject arbitrary caller URLs.

### 7B.4 Integration tests

Use mocks and local fixtures for normal CI:

- successful private source deployment;
- build failure;
- timeout;
- process crash;
- health mismatch;
- message mismatch;
- capability expiry and resume;
- provider state changed during resume;
- no signed URL leakage;
- no paid resource creation.

### 7B.5 Live smoke test

Use:

```text
repository: kofiarhin/zoro-full-flow-test-20260726
commit: 8bd7b18a829edb79ca8c57de4db98953486d1ea9
source directory: api
```

Target only the existing disposable Heroku app after revalidating its immutable app ID.

Required evidence chain:

```text
preflight passed
→ run created
→ source capability created
→ archive uploaded
→ build created
→ build succeeded
→ app process healthy
→ /health 200 with expected body
→ /api/message 200 with expected body
```

Do not proceed to Vercel in this phase.

### 7B.6 Rollout

1. Deploy behind `ZORO_HEROKU_WORKFLOWS_ENABLED=false`.
2. Run tests in staging/local mode.
3. Enable for the disposable allowlisted app only.
4. Run bounded live smoke.
5. Expand allowlist only after review.

### 7B.7 Rollback

Disable the workflow flag. Low-level operations remain available.

---

# Phase 8 — High-level GitHub-to-Vercel workflow

## 8.1 Objectives

- Deploy a frontend from an exact private GitHub commit.
- Default to Preview, not Production.
- Poll and verify the deployment.

## 8.2 Architecture decision gate

Approve one source strategy before implementation:

1. provider Git integration;
2. direct file deployment through existing Vercel gateway operations;
3. governed archive upload if supported.

The decision must account for private repository access, file limits, reproducibility, and secret handling.

## 8.3 New files

```text
src/services/workflows/deployGitHubDirectoryToVercel.js
tests/unit/deployGitHubDirectoryToVercel.test.js
tests/integration/vercelDeploymentWorkflow.integration.test.js
```

## 8.4 Existing files likely to change

```text
workflow catalogue
preflight service
provider constraints
unified catalogue/dispatcher
Vercel schemas if needed
```

## 8.5 Required behavior

- exact repository and commit;
- source subdirectory;
- project identity binding;
- Preview deployment by default;
- Production promotion remains separate and production-sensitive;
- bounded polling;
- provider URL-bound endpoint verification;
- evidence recording;
- no automatic domain or DNS changes.

## 8.6 Tests

- project creation or reuse;
- preview deployment success;
- deployment failure;
- timeout;
- ambiguous team/project;
- production promotion denied without approval;
- URL verification;
- no environment secret values returned.

## 8.7 Live smoke

Resume the existing disposable run only after the Heroku workflow is verified. Create no custom domain, paid feature, or production promotion.

---

# Phase 9 — GPT Action schema and instruction integration

## 9.1 Objectives

- Make Zoro use discovery, preflight, persistent runs, and high-level workflows by default.
- Reduce manual prompts.

## 9.2 Existing files likely to change

```text
docs/openapi/zoro-action.yaml
other unified Action schema sources
schema generation scripts
schema validation scripts
Zoro instruction documentation
```

## 9.3 Required GPT behavior

At the start of a multi-step workflow:

1. call `system.preflightWorkflow`;
2. create or resume a run;
3. use high-level workflow operations where available;
4. use discovery after operation/schema validation failures;
5. allow server-approved bounded recovery;
6. ask the user only for `human-required` blockers;
7. return the run ID and evidence summary.

## 9.4 Schema constraints

- Keep the unified endpoint.
- Ensure operation enums stay under platform limits.
- Expose concise request contracts.
- Keep detailed contracts discoverable at runtime.
- Generate and validate schemas from catalogue metadata.

## 9.5 Tests

- generated schema includes new dispatchers/operations;
- operation count remains valid;
- examples contain no secrets;
- schema validator passes;
- old low-level operations remain callable;
- new response revision is documented.

---

# Phase 10 — Rollout, measurement, and hardening

## 10.1 Feature flags

Recommended flags:

```text
ZORO_OPERATION_DISCOVERY_ENABLED
ZORO_PREFLIGHT_ENABLED
ZORO_PERSISTENT_RUNS_ENABLED
ZORO_SHARED_CAPABILITIES_ENABLED
ZORO_AUTOMATIC_RECOVERY_ENABLED
ZORO_HEROKU_WORKFLOWS_ENABLED
ZORO_VERCEL_WORKFLOWS_ENABLED
ZORO_RESPONSE_REVISION_2_ENABLED
```

Flags must default safely and be validated at startup.

## 10.2 Rollout order

1. Discovery for all authenticated Zoro callers.
2. Advisory preflight.
3. Persistent runs for disposable workflows.
4. Shared capabilities.
5. Automatic recovery in observe-only mode.
6. Heroku workflow for one allowlisted disposable app.
7. Heroku workflow for broader non-production resources.
8. Vercel Preview workflow.
9. Response revision migration.

## 10.3 Observe-only recovery mode

Before automatic retries, record what correction would have been performed. Measure false positives and review evidence. Enable execution only for correction classes with strong results.

## 10.4 Metrics and targets

Track:

- median user turns per workflow;
- workflows completed without human intervention;
- human-required blocker rate;
- automatic correction success rate;
- duplicate mutation prevention;
- run resume success;
- provider failure rate;
- capability replay attempts;
- verification pass rate.

Target after the first full release:

- standard disposable GitHub → Heroku → Vercel Preview workflow requires one initial approval and one final review when no human-required blocker occurs;
- at least 80% of schema/operation/dispatcher mistakes recover without user intervention;
- zero signed URL or secret leakage regressions;
- zero duplicate provider mutations caused by resume or retry.

## 10.5 Security review checkpoints

Mandatory security review before merging:

- capability encryption and key management;
- SSRF and destination validation;
- high-level Heroku workflow;
- high-level Vercel workflow;
- any production-promotion workflow;
- any cleanup/destructive workflow.

---

## 6. Cross-phase test matrix

Every phase must preserve these baseline invariants:

| Invariant | Test type |
|---|---|
| Unknown operation rejected | Unit/integration |
| Generic provider URL/path rejected | Unit/security |
| GitHub expected SHA enforced | Regression |
| Heroku self-protection enforced | Regression |
| Vercel destructive approval enforced | Regression |
| Config values remain redacted | Regression/live smoke |
| Signed URLs remain redacted | Regression/live smoke |
| Provider account boundaries preserved | Integration |
| GET/HEAD body regression remains fixed | Regression |
| Full `npm run verify` passes | Release gate |

---

## 7. Verification commands

Use repository-defined scripts as the source of truth. Expected baseline:

```bash
npm install
npm test -- --runInBand
npm run lint
npm run format:check
npm run verify:github-gateway
npm run verify:vercel-gateway
npm run verify:heroku-gateway
npm run verify:context-read
npm run verify:engineering-action
npm run verify
```

Add focused scripts only when they provide durable release value, such as:

```text
verify:zoro-discovery
verify:zoro-preflight
verify:zoro-runs
verify:capabilities
verify:zoro-workflows
verify:path-case
```

Avoid making `npm run verify` depend on live provider credentials.

---

## 8. Pull request template for each phase

Every implementation PR should include:

### Problem

The specific autonomy blocker addressed.

### Scope

Exact files/modules and explicit exclusions.

### Architecture

How the change fits the closed catalogue and provider policies.

### Security

Threats considered, boundaries preserved, and new controls.

### Data changes

Models, indexes, migrations, retention, and rollback.

### Verification

Commands and results.

### Live testing

Disposable resource plan, if applicable.

### Rollout

Feature flags, deployment sequence, and monitoring.

### Rollback

Exact disable/revert procedure.

### Evidence status

Use explicit labels:

- implemented;
- committed;
- PR opened;
- merged;
- deployed;
- verified;
- completed.

---

## 9. Definition of done by phase

A phase is not done merely because code exists.

### Implemented

Code and tests exist on a branch.

### Verified locally

All focused tests and full verification pass.

### Reviewed

Required architecture/security review is complete.

### Merged

PR merged with expected head SHA.

### Deployed

Exact merged commit deployed.

### Live verified

Bounded smoke tests pass in the intended environment.

### Completed

All phase acceptance criteria, documentation, required project records, and operational evidence updates are satisfied.

---

## 10. Recommended first three implementation PRs

### PR 1 — Repository case hygiene

Branch:

```text
fix/path-case-collisions
```

Scope:

- canonical DevOps log filename;
- exact-case imports;
- collision checker;
- verification integration.

### PR 2 — Operation discovery

Branch:

```text
feat/zoro-operation-discovery
```

Scope:

- catalogue-derived descriptions;
- `describeOperations`;
- `describeOperation`;
- `resolveOperation`;
- tests and schema update.

### PR 3 — Workflow preflight

Branch:

```text
feat/zoro-workflow-preflight
```

Scope:

- closed workflow definitions;
- provider constraints;
- resource-name validation;
- dependency completeness checks;
- read-only preflight response;
- tests.

These three PRs are low enough risk to establish the foundation and immediately reduce operation-name, dispatcher, schema, and provider-name back-and-forth.

---

## 11. Dependencies and decision schedule

| Decision | Needed before |
|---|---|
| Capability encryption key strategy | Phase 4A implementation |
| Run retention policy | Phase 3 deployment |
| Worker/polling model | Phase 6B implementation |
| Envelope version strategy | Phase 5 merge |
| Vercel source strategy | Phase 8 implementation |
| Approval record location | Phase 3B implementation |
| Cleanup workflow policy | Any automated cleanup |

Do not allow unresolved decisions to be silently encoded as implementation defaults in security-sensitive phases.

---

## 12. Risks and mitigations

### Risk: workflow layer bypasses provider policy

**Mitigation:** workflows invoke existing in-process provider services and policy enforcement; add regression tests proving controls remain active.

### Risk: duplicate mutation after timeout

**Mitigation:** idempotency keys, immutable provider resource IDs, expected-state checks, and reconciliation before retry.

### Risk: capability plaintext exposure

**Mitigation:** authenticated encryption, strict redaction, no plaintext persistence, response tests, bounded logs.

### Risk: worker races

**Mitigation:** optimistic concurrency, step leases, atomic capability consumption, attempt IDs.

### Risk: stale run resumes against changed state

**Mitigation:** mandatory provider revalidation before resume; return to blocked state on mismatch.

### Risk: discovery drifts from execution

**Mitigation:** derive discovery from the execution catalogue and generated schemas; CI consistency test.

### Risk: automatic correction changes resource identity unexpectedly

**Mitigation:** only preflight-disclosed deterministic normalization may auto-apply; record original and normalized values.

### Risk: Action schema becomes too large

**Mitigation:** keep unified endpoint, concise enums, runtime discovery, generated fragments, schema-size validation.

### Risk: MongoDB outage blocks provider workflows

**Mitigation:** accept that persistent autonomous workflows require shared state; keep low-level read operations available where current architecture allows; fail closed for workflows that cannot preserve state safely.

---

## 13. Final program acceptance criteria

The program is complete when:

1. Operation and dispatcher guessing is eliminated through discovery.
2. Workflow completeness and provider constraints are checked before mutation.
3. Runs persist across process restarts and resume safely.
4. Temporary provider capabilities are encrypted, shared, expiring, and single-use.
5. Bounded recovery handles approved low-risk errors automatically.
6. Polling is server-controlled and evidence-producing.
7. GitHub-to-Heroku deployment succeeds through one governed workflow.
8. GitHub-to-Vercel Preview deployment succeeds through one governed workflow.
9. Response status, correlation, errors, and evidence are standardized.
10. Human approval remains mandatory for merge, production, destructive, billing, access, migration, and security-sensitive decisions as defined by policy.
11. Existing provider controls and regression suites pass.
12. A disposable full-stack workflow completes with materially fewer conversational turns.
13. No secrets, decrypted config values, or signed URLs appear in responses or logs.
14. No direct generic provider proxy exists.

---

## 14. Recommended next action

Begin with a read-only implementation review for Phase 0 and Phase 1. Confirm actual repository paths, current schema-generation architecture, existing test conventions, and the canonical DevOps log filename. Then prepare the Phase 0 shared-understanding handoff and obtain explicit approval before changing code.
