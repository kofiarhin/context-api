# Zoro Autonomy Architecture Specification

## 1. Document status

- **Status:** Proposed
- **Repository:** `kofiarhin/context-api`
- **Audience:** Context API maintainers, Zoro/Architect operators, security reviewers, implementation agents
- **Purpose:** Define the target architecture required for Zoro to execute governed engineering workflows with substantially less human intervention while preserving explicit approval, provider boundaries, redaction, self-protection, expected-state checks, and auditability.

This specification is implementation-oriented. It defines product behavior, system boundaries, data models, operation contracts, workflow states, security requirements, observability, migration constraints, and acceptance criteria. It does not authorize implementation, deployment, migration, or production rollout.

---

## 2. Problem statement

Zoro currently exposes a broad but mostly low-level catalogue of GitHub, Heroku, Vercel, Context API, and operations-log actions through a unified Action endpoint. The closed catalogue and provider policies are intentionally strict, but several workflow runs have required excessive conversational recovery because Zoro had to infer details that should have been available from the control plane.

Observed friction included:

1. Guessing operation names such as `listApps` instead of `listHerokuApps`.
2. Selecting the wrong dispatcher for an existing operation, such as trying to merge through `github.write` instead of `github.review`.
3. Misplacing provider payload fields because public parameter schemas were not sufficiently discoverable.
4. Discovering provider naming constraints only after attempting a mutation.
5. Creating resources before confirming that the full deployment workflow was available.
6. Losing workflow continuity when a run stopped, requiring repository names, commit SHAs, app IDs, completed phases, and blockers to be restated manually.
7. Requiring conversational polling logic for asynchronous builds and deployments.
8. Stopping on recoverable schema or operation-resolution errors that could have been corrected safely.
9. Returning inconsistent status and evidence shapes across providers.
10. Depending on process-local, in-memory capability state for the governed Heroku source-upload workflow.
11. Lacking a high-level workflow operation that safely composes low-level provider actions.
12. Local development friction caused by case-insensitive filename collisions on Windows.

The desired outcome is not unrestricted autonomy. The desired outcome is **governed autonomy**: Zoro should automatically discover contracts, preflight workflows, persist state, recover from bounded errors, poll safely, and report evidence, while still stopping for materially consequential decisions.

---

## 3. Goals

### 3.1 Primary goals

1. Reduce unnecessary human back-and-forth during multi-provider engineering workflows.
2. Make valid operations, dispatchers, schemas, classifications, approvals, and examples machine-discoverable.
3. Validate complete workflows before creating or modifying provider resources.
4. Persist workflow state so interrupted runs can resume safely.
5. Replace process-local sensitive capability state with a shared, short-lived, replay-resistant store.
6. Allow bounded automatic correction of recoverable errors.
7. Provide high-level governed workflows built from closed-catalogue operations.
8. Standardize success, error, status, correlation, and evidence envelopes.
9. Preserve all existing security boundaries and provider-specific policies.
10. Make verification evidence explicit and durable without converting deployment into completion.

### 3.2 Secondary goals

1. Improve provider constraint handling and error quality.
2. Reduce prompt complexity for custom GPT Actions.
3. Support deterministic polling and timeout behavior.
4. Enable later support for additional providers without introducing generic proxies.
5. Improve cross-platform repository hygiene.

---

## 4. Non-goals

The architecture must not:

1. Introduce arbitrary HTTP, GitHub, Heroku, Vercel, or provider passthrough.
2. Allow callers to submit arbitrary URLs, methods, paths, headers, or credentials.
3. Bypass branch protection, provider authorization, self-protection, approval, expected-state, billing, destructive, or access-control gates.
4. Treat model confidence as approval.
5. Automatically merge, deploy to production, migrate data, create paid resources, or perform destructive cleanup without the applicable authority.
6. Persist decrypted provider secrets or signed URLs in plaintext.
7. Infer completion from implementation, merge, or deployment alone.
8. Create a distributed workflow engine with unbounded background execution in the first release.
9. Replace provider-specific policies with a single generic policy layer.
10. Store chain-of-thought or private conversational reasoning.

---

## 5. Design principles

### 5.1 Closed catalogue remains authoritative

All execution must resolve to a registered dispatcher and operation. Discovery may describe or resolve operations, but it must not create new execution paths dynamically.

### 5.2 High-level workflows compose low-level governed operations

A workflow operation may coordinate multiple actions, but each action must use existing provider services, policies, classifications, serializers, and expected-state protections. Workflows must not call providers through a parallel or weaker client.

### 5.3 Preflight before mutation

Zoro should verify operation availability, parameter contracts, provider constraints, authority, dependencies, resource naming, expected costs, and workflow completeness before the first provider mutation.

### 5.4 Persistent state, explicit evidence

A workflow run must record planned, attempted, implemented, committed, merged, deployed, verified, blocked, and completed states distinctly. Evidence must identify what was actually observed.

### 5.5 Automatic recovery is bounded

Only deterministic, low-risk, reversible corrections may be retried automatically. Security, billing, access, destructive, production, expected-state, or ambiguous-resource failures require a stop.

### 5.6 Secrets remain server-side

Provider credentials, signed upload/download URLs, private keys, and decrypted config values must never be returned to Zoro, stored in logs, or persisted unencrypted.

### 5.7 Idempotency and expected state

Every resumable mutation should include either an idempotency key, an expected-state condition, or a workflow resource binding that prevents accidental duplicate effects.

### 5.8 Fail closed

Unknown operations, missing schemas, unsupported workflow transitions, expired capabilities, ambiguous resources, and unverifiable provider states must fail closed.

---

## 6. Current-state architecture

The current unified Action exposes dispatchers such as:

- `health.check`
- `context.resolve`
- `engineering.read`
- `engineering.write`
- `engineering.archive`
- `github.read`
- `github.write`
- `github.review`
- `github.destructive`
- `vercel.read`
- `vercel.write`
- `vercel.destructive`
- `heroku.execute`
- `opslog.read`
- `opslog.write`

The catalogue maps operation names to in-process service methods and classifications. GitHub, Heroku, and Vercel provider policies remain authoritative for resource allowlists, mutation switches, destructive controls, and self-protection.

The new Heroku source-upload capability fills the immediate source archive gap, but it currently relies on short-lived process-local state. That implementation is a valid bridge for bounded single-process verification, not the final autonomy architecture.

---

## 7. Target architecture overview

The target architecture adds six coordinated layers around the existing provider gateways:

1. **Operation Discovery Layer**
   - Describes registered operations and resolves operation names to dispatchers.
   - Publishes parameter schemas, examples, classifications, and approval requirements.

2. **Workflow Preflight Layer**
   - Validates workflow completeness and provider constraints before mutation.
   - Produces a normalized plan and identifies blockers early.

3. **Persistent Run Layer**
   - Stores workflow state, resources, evidence, blockers, approvals, and next safe action.
   - Supports safe resume after interruption.

4. **Shared Capability Layer**
   - Stores encrypted, short-lived provider capability payloads with TTL and single-use enforcement.
   - Replaces process-local signed target state.

5. **Recovery and Polling Layer**
   - Classifies failures, applies bounded retry policy, and polls asynchronous operations safely.

6. **High-Level Workflow Layer**
   - Orchestrates complete GitHub-to-Heroku and GitHub-to-Vercel flows using registered operations.

These layers must be additive. Existing direct operations remain available for advanced or diagnostic use.

---

## 8. Operation discovery

### 8.1 Required operations

#### `system.describeOperations`

Returns a bounded list of dispatchers and operation summaries.

Optional filters:

- `dispatcher`
- `provider`
- `classification`
- `workflowTag`
- `includeExamples`

#### `system.describeOperation`

Returns the full public contract for one dispatcher and operation.

Required input:

```json
{
  "dispatcher": "github.review",
  "operation": "mergePullRequest"
}
```

#### `system.resolveOperation`

Resolves an operation name to one or more valid dispatchers.

Input:

```json
{
  "operation": "mergePullRequest"
}
```

Response:

```json
{
  "matches": [
    {
      "dispatcher": "github.review",
      "operation": "mergePullRequest",
      "classification": "merge",
      "requiredParameters": [
        "owner",
        "repo",
        "pullNumber",
        "expectedHeadSha"
      ]
    }
  ]
}
```

If more than one match exists, the response must remain descriptive and must not select one silently unless a deterministic provider or workflow context uniquely resolves it.

### 8.2 Contract fields

Every described operation must expose:

- dispatcher ID;
- operation name;
- summary;
- provider or internal target;
- classification;
- approval requirement;
- confirmation requirement;
- expected-state fields;
- idempotency behavior;
- required and optional parameters;
- JSON schema;
- safe example request;
- safe example response;
- possible error codes;
- whether the operation mutates state;
- whether the operation creates billable resources;
- whether the operation is safe to retry;
- workflow tags;
- minimum Context API version or schema revision.

### 8.3 Schema source of truth

Discovery must derive from the same catalogue and schemas used for execution. It must not maintain a manually duplicated operation list.

---

## 9. Workflow preflight

### 9.1 Required operation

#### `system.preflightWorkflow`

Input:

```json
{
  "workflow": "deployGitHubDirectoryToHeroku",
  "parameters": {
    "repository": "kofiarhin/example",
    "commitSha": "<40-character-sha>",
    "sourceDirectory": "api",
    "herokuAppName": "example-api"
  }
}
```

### 9.2 Preflight responsibilities

Preflight must verify:

1. The workflow is registered.
2. Every required low-level operation is registered.
3. Public parameter schemas are available.
4. The authenticated provider integrations are configured.
5. The repository and commit are accessible.
6. The source directory exists.
7. The provider resource name is syntactically valid.
8. The requested resource is allowed by provider/account policy.
9. The workflow does not target the Context API itself unless explicitly permitted by a dedicated protected workflow.
10. Required approval classes are known.
11. Paid-resource implications are identified.
12. Required shared infrastructure is available.
13. The expected verification endpoints and criteria are defined.
14. Existing resources are identified without mutating them.
15. Duplicate or conflicting active runs are detected.

### 9.3 Provider constraint registry

A provider constraint registry must represent stable local validations, including:

- name length;
- allowed characters;
- required casing;
- namespace rules;
- reserved names;
- supported regions or stacks where relevant;
- source archive size;
- request timeout bounds;
- known mutually exclusive parameters.

Provider responses remain authoritative for constraints that cannot be known locally.

### 9.4 Preflight response

```json
{
  "ready": false,
  "workflow": "deployGitHubDirectoryToHeroku",
  "normalizedParameters": {
    "herokuAppName": "zoro-flow-test-20260726-api"
  },
  "issues": [
    {
      "severity": "error",
      "code": "PROVIDER_NAME_TOO_LONG",
      "provider": "heroku",
      "field": "herokuAppName",
      "maximumLength": 30,
      "recommendedValue": "zoro-flow-test-20260726-api",
      "autoCorrectable": true
    }
  ],
  "requiredApprovals": [],
  "estimatedMutations": [],
  "workflowRevision": "..."
}
```

Preflight may recommend normalized values, but resource identity changes must be visible in the run plan before execution.

---

## 10. Persistent workflow runs

### 10.1 Required operations

- `workflow.createRun`
- `workflow.getRun`
- `workflow.resumeRun`
- `workflow.cancelRun`
- `workflow.listRuns`

Internal-only service methods may record steps and evidence; callers must not be allowed to assign arbitrary terminal states.

### 10.2 Run states

Recommended top-level states:

- `draft`
- `preflighting`
- `awaiting-approval`
- `ready`
- `running`
- `blocked`
- `cancelling`
- `cancelled`
- `failed`
- `verified`
- `completed`

`verified` and `completed` are distinct. Verification means acceptance evidence passed. Completion means the workflow’s documented completion conditions and authoritative updates were satisfied.

### 10.3 Step states

- `planned`
- `ready`
- `running`
- `succeeded`
- `failed`
- `blocked`
- `skipped`
- `superseded`

### 10.4 Run model

Proposed fields:

```json
{
  "runId": "zoro-run-...",
  "workflow": "deployGitHubDirectoryToHeroku",
  "workflowRevision": "...",
  "status": "blocked",
  "currentStep": "upload-source",
  "parameters": {},
  "normalizedParameters": {},
  "resources": {},
  "steps": [],
  "approvals": [],
  "evidence": [],
  "blockers": [],
  "nextSafeAction": {},
  "idempotencyKey": "...",
  "createdAt": "...",
  "updatedAt": "...",
  "expiresAt": null,
  "version": 7
}
```

### 10.5 Concurrency control

Run mutation must use optimistic concurrency through a numeric version or updated-at expectation. Concurrent workers must not execute the same step twice.

### 10.6 Resource binding

Resources must be stored by stable provider identifiers where possible:

- GitHub owner, repository, branch, commit SHA, PR number;
- Heroku app ID, build ID, pipeline ID;
- Vercel project ID, deployment ID, team ID;
- Context API task or project identifiers.

Names may be included for display but must not replace immutable IDs.

### 10.7 Resume behavior

`workflow.resumeRun` must:

1. Re-read the run.
2. Revalidate current provider and repository state.
3. Confirm the workflow revision is still supported.
4. Detect completed, duplicate, conflicting, or superseded work.
5. Re-evaluate required approvals.
6. Resume only from a documented safe transition.
7. Return to `blocked` if evidence differs materially from stored expectations.

---

## 11. Shared provider capabilities

### 11.1 Purpose

Some workflows require temporary provider-issued secrets or signed targets that must remain server-side. A shared capability store enables multiple requests or processes to continue a workflow without exposing those values to Zoro.

### 11.2 Capability model

Proposed fields:

- `capabilityId`
- `provider`
- `purpose`
- `encryptedPayload`
- `payloadKeyVersion`
- `resourceBinding`
- `runId`
- `stepId`
- `correlationId`
- `createdAt`
- `expiresAt`
- `consumedAt`
- `consumptionHash`
- `status`
- `version`

A TTL index must remove expired records automatically. Application logic must still enforce expiry because TTL deletion is not instantaneous.

### 11.3 Encryption

Sensitive capability payloads must be encrypted before persistence. Encryption requirements:

- authenticated encryption;
- key versioning;
- associated data binding to provider, purpose, run ID, and resource ID;
- no keys stored in MongoDB;
- rotation procedure documented;
- decryption errors fail closed;
- ciphertext and metadata are safe for logs only after standard redaction.

### 11.4 Single-use behavior

Consumption must be atomic. A capability cannot be used twice, even under concurrent requests. Recommended implementation:

1. Match `capabilityId`, `status: active`, `consumedAt: null`, and `expiresAt > now`.
2. Atomically mark as `consuming` with a lease.
3. Perform the bounded provider action.
4. Mark as `consumed` on success.
5. On retryable upstream failure, either release the lease or mark a bounded retry state according to purpose-specific policy.

### 11.5 Heroku source capability

For Heroku source uploads, the capability must bind:

- source upload target;
- source download target;
- Heroku source ID if available;
- target Heroku account boundary;
- allowed upload hostname and protocol;
- run ID;
- expiry;
- exact workflow purpose.

The caller may provide only the opaque capability ID.

---

## 12. Automatic recovery policy

### 12.1 Recovery classes

#### Auto-correctable

May be corrected and retried automatically when deterministic:

- unknown operation name with one unique catalogue match;
- wrong dispatcher with one unique catalogue match;
- field placed at the wrong documented schema level;
- provider resource name normalization that was disclosed during preflight;
- missing optional pagination defaults;
- transient provider read failure;
- rate limit with bounded server-directed backoff;
- asynchronous provider operation still pending.

#### Replan-required

May update the run plan but must not mutate until the new plan is accepted under existing authority:

- unavailable requested resource name;
- provider region or stack incompatibility;
- missing non-billable prerequisite;
- changed generated resource identifier;
- source directory moved within the same approved repository and commit context.

#### Human-required

Must stop:

- destructive action;
- billing or paid resource;
- access administration;
- production promotion;
- merge where expected head SHA changed;
- branch protection conflict;
- ambiguous repository, app, project, or account;
- security-policy failure;
- secret or signed URL exposure risk;
- Context API self-protection trigger;
- migration or data-loss risk;
- provider account boundary mismatch.

### 12.2 Retry limits

Every retry policy must define:

- maximum attempts;
- base delay;
- maximum delay;
- jitter behavior;
- retryable codes;
- non-retryable codes;
- total timeout;
- evidence recorded per attempt.

No mutation may be retried blindly after an unknown transport outcome. The system must first reconcile provider state.

---

## 13. High-level governed workflows

### 13.1 `workflow.deployGitHubDirectoryToHeroku`

#### Inputs

- repository owner/name;
- exact commit SHA;
- source directory;
- target Heroku app ID or an explicitly approved create-app plan;
- expected health endpoint;
- expected health status and optional body assertions;
- optional message endpoint assertions;
- bounded build timeout;
- idempotency key.

#### Internal sequence

1. Preflight workflow.
2. Create or resume persistent run.
3. Validate repository, commit, and source directory.
4. Revalidate target Heroku app and policy boundary.
5. Create Heroku source.
6. Store signed targets in shared capability storage.
7. Fetch private GitHub source through the governed GitHub integration.
8. Create deterministic archive.
9. Upload archive through the bound capability.
10. Create Heroku build using the internal download target.
11. Poll build with bounded interval and timeout.
12. Reconcile process/release state using safe registered operations.
13. Verify configured endpoints.
14. Record evidence.
15. Mark `verified`; mark `completed` only when workflow completion rules are met.

#### Security constraints

- no raw signed URL input or output;
- no arbitrary destination;
- no direct credential embedding;
- no generic curl fallback;
- no decrypted config-var inspection;
- no `heroku releases:info`;
- no paid add-ons unless separately approved;
- no self-targeting of `context-api` through a general workflow;
- no continuation to Vercel if Heroku verification fails.

### 13.2 `workflow.deployGitHubDirectoryToVercel`

The Vercel workflow must similarly:

1. Validate repository and commit.
2. Resolve or create a project under approved account/team boundaries.
3. Create a preview deployment by default.
4. Poll deployment state.
5. Verify expected URL and endpoints.
6. Require explicit approval for production promotion.
7. Record deployment IDs and evidence.

### 13.3 `workflow.verifyHttpEndpoints`

A reusable verification workflow must support:

- HTTPS-only URLs unless explicitly local/test mode;
- hostname allowlists or resource-bound URLs;
- redirect policy;
- timeout;
- response byte limit;
- status assertion;
- JSON body subset assertion;
- text assertion;
- content-type assertion;
- bounded retries;
- safe response excerpts;
- no authentication-secret echoing.

It must not become a generic network proxy. URLs must be derived from provider resources or an approved workflow plan.

### 13.4 Polling

Polling must be server-side and bounded. The caller should not need to issue conversational retry loops. Polling records each state transition and stops on:

- success terminal state;
- failure terminal state;
- timeout;
- cancellation;
- material provider identity change.

---

## 14. Standard operation envelopes

### 14.1 Success envelope

```json
{
  "ok": true,
  "status": 200,
  "dispatcher": "heroku.execute",
  "operation": "getHerokuApp",
  "classification": "read",
  "correlationId": "cor_...",
  "providerRequestId": "...",
  "runId": "zoro-run-...",
  "stepId": "read-target-app",
  "data": {},
  "evidence": []
}
```

### 14.2 Error envelope

```json
{
  "ok": false,
  "status": 422,
  "dispatcher": "heroku.execute",
  "operation": "updateHerokuApp",
  "correlationId": "cor_...",
  "error": {
    "code": "PROVIDER_VALIDATION_ERROR",
    "provider": "heroku",
    "field": "name",
    "reason": "maximum_length_exceeded",
    "retryable": false,
    "autoCorrectable": true,
    "safeDetails": {
      "maximumLength": 30
    }
  }
}
```

### 14.3 Compatibility

Existing clients may depend on current shapes. Introduce envelopes through a versioned unified Action schema or an opt-in response revision before making them mandatory.

---

## 15. Error taxonomy

Required normalized categories:

- `OPERATION_NOT_FOUND`
- `OPERATION_AMBIGUOUS`
- `SCHEMA_VALIDATION_FAILED`
- `PREFLIGHT_FAILED`
- `APPROVAL_REQUIRED`
- `CONFIRMATION_REQUIRED`
- `EXPECTED_STATE_MISMATCH`
- `RESOURCE_CONFLICT`
- `RESOURCE_NOT_FOUND`
- `PROVIDER_VALIDATION_ERROR`
- `PROVIDER_FORBIDDEN`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_TIMEOUT`
- `CAPABILITY_INVALID`
- `CAPABILITY_EXPIRED`
- `CAPABILITY_CONSUMED`
- `CAPABILITY_DESTINATION_REJECTED`
- `WORKFLOW_TRANSITION_INVALID`
- `WORKFLOW_BLOCKED`
- `WORKFLOW_TIMEOUT`
- `VERIFICATION_FAILED`
- `SECURITY_POLICY_DENIED`
- `SELF_PROTECTION_DENIED`

Provider-specific codes may be included as safe secondary metadata.

---

## 16. Approval and authority model

The existing classification system remains authoritative. Workflow orchestration must aggregate approvals rather than bypass them.

A run plan must identify:

- required approval class;
- resource identity;
- proposed mutation;
- expected state;
- whether approval is one-time, step-specific, or workflow-scoped;
- approval expiry;
- approving principal;
- evidence of approval.

Approval must be invalidated when a material parameter changes, including:

- repository;
- commit SHA;
- target app/project ID;
- production environment;
- billing implication;
- access scope;
- destructive target;
- expected merge head SHA.

---

## 17. Security requirements

### 17.1 SSRF and destination controls

Any server-side fetch or upload must:

- require HTTPS;
- reject caller-supplied arbitrary destinations;
- validate hostname against provider-purpose policy;
- reject redirects unless a provider-specific, prevalidated redirect chain is explicitly supported;
- reject localhost, loopback, link-local, private, multicast, and metadata-service ranges;
- resolve DNS safely and defend against rebinding where practical;
- apply request timeout and byte limits;
- avoid forwarding caller headers;
- avoid returning destination URLs.

### 17.2 Archive safety

Archive generation must:

- use exact commit SHA;
- normalize paths;
- reject absolute paths, traversal, backslashes, NULs, and malformed names;
- exclude `.git`, `.env*`, `node_modules`, generated dependencies, credentials, and configured sensitive patterns;
- reject symlinks or resolve them only under a separately reviewed policy;
- enforce file-count, per-file, and total-size limits;
- create deterministic metadata and ordering;
- place selected directory contents at archive root;
- compute SHA-256 before upload.

### 17.3 Logging and redaction

Logs must not include:

- authorization headers;
- access tokens;
- private keys;
- signed upload/download URLs;
- config-var values;
- capability plaintext;
- private source content beyond bounded, explicitly safe metadata.

Every new module must use the existing redaction pipeline and add regression tests for sensitive fields.

### 17.4 Self-protection

General workflows must not modify, deploy, delete, migrate, or reconfigure `context-api` itself. Self-deployment requires a separately registered, security-sensitive workflow with explicit approval and stricter evidence requirements.

---

## 18. Observability and evidence

### 18.1 Correlation

Every operation and workflow step must carry:

- correlation ID;
- run ID where applicable;
- step ID;
- provider request ID when available;
- attempt number.

### 18.2 Evidence records

Evidence should include:

- type;
- source;
- observed at;
- resource binding;
- expected value;
- observed value;
- pass/fail/unknown;
- safe metadata;
- optional hash of larger evidence stored elsewhere.

Examples:

- commit exists;
- PR head SHA matched;
- build status succeeded;
- endpoint returned 200;
- response body matched required subset;
- config metadata was redacted;
- no paid add-ons existed.

### 18.3 Metrics

Recommended metrics:

- workflow runs by status;
- step latency;
- provider error rates;
- automatic correction count;
- retry count;
- human-intervention count;
- capability creation, expiry, and replay attempts;
- verification pass rate;
- average number of user turns per workflow;
- duplicate-work prevention count.

---

## 19. Data retention

- Capability plaintext: never persisted.
- Capability ciphertext: until consumed or expired, then deleted by TTL.
- Workflow runs: configurable retention, recommended 90 days for completed disposable runs and longer for production/security-sensitive runs.
- Evidence: retain according to operational and project requirements.
- Logs: retain under existing policy with redaction.
- Source archives: memory or temporary encrypted storage only; delete immediately after upload.

---

## 20. Schema and Action integration

The unified Action schema must expose discovery, preflight, and workflow operations without exceeding platform operation limits. Recommended approach:

1. Preserve the single unified path.
2. Keep dispatcher and operation as request fields.
3. Publish a bounded operation enum where possible.
4. Make discovery the runtime source for detailed contracts.
5. Generate schema fragments from the catalogue.
6. Validate generated schema in CI.
7. Include a schema revision in discovery and responses.

The GPT instructions should require:

1. call preflight for multi-step workflows;
2. create or resume a run;
3. use operation discovery after validation errors;
4. allow bounded server-side recovery;
5. stop only when the run reports a human-required blocker.

---

## 21. Cross-platform repository hygiene

The repository must contain no case-insensitive path collisions. Add a verification script that:

1. lists tracked paths;
2. normalizes each to a case-folded form;
3. fails if two distinct tracked paths collide;
4. reports the exact paths;
5. runs in `npm run verify`.

Use one canonical filename for the DevOps log service and update all imports to match exact casing.

---

## 22. Migration and rollout strategy

### Phase A: Read-only discovery

Add discovery operations without changing execution behavior.

### Phase B: Preflight

Add workflow validation and provider constraints. Initially advisory; later require successful preflight for high-level workflows.

### Phase C: Persistent runs

Add run storage and state machine. Keep direct low-level operations unchanged.

### Phase D: Shared capabilities

Migrate Heroku source capabilities from process memory to encrypted MongoDB-backed storage. Support a brief compatibility period, then remove process-local fallback in production.

### Phase E: Recovery and polling

Enable automatic recovery only for an explicit allowlist of safe error classes.

### Phase F: High-level workflows

Introduce GitHub-to-Heroku first, then Vercel preview deployment.

### Phase G: Envelope revision

Adopt normalized response envelopes through versioning.

Each phase requires isolated PRs, full verification, security review where applicable, deployment evidence, and rollback instructions.

---

## 23. Testing requirements

### 23.1 Unit tests

- catalogue-derived discovery;
- operation ambiguity;
- parameter schema descriptions;
- provider name constraints;
- run state transitions;
- invalid transition rejection;
- optimistic concurrency;
- capability encryption/decryption;
- expiry and replay;
- automatic recovery classification;
- retry limits;
- deterministic archive generation;
- redaction;
- response envelopes;
- case-collision detection.

### 23.2 Integration tests

- create, block, resume, verify, and complete a run;
- private GitHub source retrieval;
- Heroku capability lifecycle across separate service instances;
- duplicate step execution prevention;
- provider polling;
- endpoint verification;
- approval invalidation after parameter changes;
- no signed URL leakage in responses or logs;
- self-protection enforcement;
- full workflow failure and resume.

### 23.3 Live bounded smoke tests

Live tests must use disposable resources and must not create paid add-ons, databases, collaborators, production domains, or access changes. They must verify exact provider resource IDs and cleanly distinguish created, deployed, verified, and completed states.

---

## 24. Acceptance criteria

The autonomy architecture is considered implemented only when:

1. Zoro can discover valid operations and schemas without guessing.
2. A full workflow can be preflighted before mutation.
3. A run can stop, survive a process restart, and resume from stored state.
4. Heroku source capability state works across processes and cannot be replayed.
5. Recoverable operation/dispatcher/schema errors are corrected automatically within bounded policy.
6. Human-required decisions still stop reliably.
7. GitHub-to-Heroku deployment can be completed through one high-level governed workflow.
8. Vercel preview deployment can be completed through one high-level governed workflow.
9. Every operation returns consistent status, correlation, and safe evidence metadata.
10. Signed URLs and secrets never appear in logs or responses.
11. Existing provider policies, expected-state checks, redaction, and self-protection tests continue to pass.
12. The number of user turns required for a normal disposable full-stack deployment is materially reduced.

Recommended measurable target:

- A standard disposable GitHub → Heroku → Vercel Preview workflow should require no more than one initial approval and one final review unless a human-required blocker occurs.

---

## 25. Open decisions

The following decisions must be made before their respective implementation phases:

1. **Capability key management:** Heroku config key, external KMS, or another managed secret source.
2. **Workflow execution model:** synchronous request with bounded polling, scheduled worker, or hybrid.
3. **Run retention:** retention windows by workflow classification.
4. **Approval storage:** run-embedded approval evidence versus a dedicated approval record.
5. **Response envelope rollout:** new API version versus opt-in response revision.
6. **Provider constraint ownership:** code constants, generated schemas, or versioned data files.
7. **Archive implementation:** internal deterministic tar writer versus vetted dependency.
8. **Vercel source strategy:** Git integration, direct file deployment, or provider-native archive path.
9. **Cancellation semantics:** best-effort stop versus provider cancellation when supported.
10. **Cleanup workflows:** whether disposable cleanup is a separate explicit destructive workflow.

---

## 26. Recommended first release boundary

The first production-capable autonomy release should include:

1. operation discovery;
2. provider-aware preflight;
3. persistent run state;
4. shared encrypted capability storage;
5. bounded polling;
6. GitHub-to-Heroku high-level workflow;
7. standardized workflow evidence;
8. case-collision verification.

Automatic correction should initially be limited to operation resolution, dispatcher resolution, schema placement, provider name normalization, transient reads, rate limits, and pending async states. Broader recovery can be added only after evidence from real runs.
