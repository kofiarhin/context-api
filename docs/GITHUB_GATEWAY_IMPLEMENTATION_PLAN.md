# Context API — GitHub Gateway Implementation Plan

**Version:** 1.0  
**Status:** Approved for implementation  
**Owner:** Kofi  
**Target branch:** `main`  
**Last updated:** 2026-07-22  
**Source specification:** [`GITHUB_GATEWAY_SPEC.md`](GITHUB_GATEWAY_SPEC.md)

## 1. Delivery Objective

Implement an authenticated GitHub gateway inside the existing Context API so Zoro can perform full repository code and pull-request operations through the same Custom GPT Action it already uses for persistent context.

The implementation must support direct writes to repository default branches, including `main` and `master`, while continuing to deny force pushes, branch-protection bypasses, repository administration, secret access, Actions administration, and modifications beneath `.github/workflows/`.

This plan is implementation-ready and assumes the approved technical specification is authoritative.

## 2. Delivery Constraints

- Work directly on `main`, as explicitly authorized.
- Keep changes isolated to the GitHub gateway and required shared infrastructure.
- Preserve all existing Context API contracts.
- Follow the repository's CommonJS, Express, Jest, Supertest, centralized-error, and layered-service conventions.
- Add tests before or alongside implementation.
- Do not commit credentials, private keys, tokens, populated environment files, or generated installation tokens.
- Do not expose raw Octokit request or response objects through controllers.
- Do not modify `.github/workflows/*`.
- Do not deploy until tests, linting, and formatting checks pass.
- Update Zoro's Action schema only after the corresponding deployed endpoints exist.

## 3. Definition of Done

The GitHub gateway is complete only when:

- every endpoint in `GITHUB_GATEWAY_SPEC.md` is implemented;
- all GitHub routes require a valid `ZORO_GITHUB_API_KEY` bearer token;
- GitHub App installation authentication works in the deployed environment;
- direct default-branch create, update, and delete operations work when repository policy allows them;
- branch updates are always non-force and optimistic-concurrency protected;
- pull-request merges require the expected current head SHA;
- workflow paths remain blocked;
- existing Context API behavior and tests remain green;
- new unit, integration, service, and production-route tests pass;
- `npm test`, `npm run lint`, and `npm run format:check` pass;
- the Heroku deployment is healthy;
- Zoro's updated Action schema validates and exposes all GitHub operations;
- the complete end-to-end smoke test passes;
- durable project documentation is updated with verified outcomes.

## 4. Planned File Changes

### 4.1 New source files

```text
src/controllers/github.controller.js
src/middleware/requireGithubActionAuth.js
src/middleware/validateGithub.js
src/routes/v1/github.js
src/services/githubClient.js
src/services/github.service.js
src/services/githubPolicy.js
src/serializers/github.serializer.js
src/validation/github.schemas.js
```

### 4.2 Existing source files to update

```text
package.json
package-lock.json
.env.example
src/app.js
src/config/env.js
src/middleware/errorHandler.js
src/utils/errors.js
```

Potentially update:

```text
src/utils/responses.js
src/middleware/allowedMethods.js
src/utils/logger.js
```

Only change those files if the implementation requires shared behavior not already available.

### 4.3 New tests

```text
tests/unit/githubPolicy.test.js
tests/unit/githubAuth.test.js
tests/unit/githubEnv.test.js
tests/unit/githubSerializer.test.js
tests/unit/githubErrorTranslation.test.js
tests/unit/githubService.test.js
tests/integration/githubRoutes.test.js
tests/integration/githubBodyLimit.test.js
tests/integration/githubDatabaseIndependence.test.js
tests/integration/githubProductionRouteRegistration.test.js
```

Test filenames may be adjusted to match existing repository naming conventions, but coverage responsibilities must remain.

### 4.4 Documentation updates

```text
README.md
docs/DEPLOYMENT.md
.env.example
```

The Custom GPT OpenAPI schema is configured outside the repository and must be updated manually in the same release window.

## 5. Phase Overview

| Phase | Outcome |
| --- | --- |
| 0 | Revalidate repository state and establish test fixtures |
| 1 | Add dependency and validated GitHub configuration |
| 2 | Add dedicated bearer authentication |
| 3 | Add GitHub client, policy, serializer, and error translation |
| 4 | Implement repository and content reads |
| 5 | Implement branch listing, creation, and safe updates |
| 6 | Implement default-branch-capable file writes and deletes |
| 7 | Implement pull-request lifecycle and merge operations |
| 8 | Integrate routing, body limits, and database independence |
| 9 | Complete regression coverage and documentation |
| 10 | Deploy, update Zoro's Action, and verify end to end |

## 6. Phase 0 — Revalidation and Test Harness

### Objective

Confirm the current `main` state before modifying runtime behavior and establish reusable GitHub test doubles.

### Tasks

1. Pull or inspect the latest `main` commit.
2. Confirm the existing application factory, environment loader, route registration, error hierarchy, response helpers, logger, and test conventions.
3. Run the existing baseline:

```bash
npm install
npm test
npm run lint
npm run format:check
```

4. Record current passing test count and any pre-existing warnings.
5. Create a reusable mocked Octokit shape for unit and integration tests.
6. Create representative fixtures for:
   - installation repositories;
   - file content;
   - directory content;
   - branches;
   - pull requests;
   - successful writes;
   - stale SHA conflicts;
   - branch-protection denials;
   - GitHub `404`, `409`, `422`, and `5xx` responses.
7. Confirm tests never make live GitHub requests.

### Verification

- Existing tests pass before changes.
- Test fixtures can inject deterministic GitHub service behavior.
- No environment secret is required for unit or integration tests.

### Exit criteria

- Baseline is recorded.
- The implementation can proceed without relying on live GitHub calls.

## 7. Phase 1 — Dependency and Environment Configuration

### Objective

Add Octokit and validate every required GitHub gateway environment variable without exposing secret values.

### Tasks

1. Install Octokit:

```bash
npm install octokit
```

2. Extend `.env.example` with empty placeholders:

```env
GITHUB_APP_ID=
GITHUB_INSTALLATION_ID=
GITHUB_PRIVATE_KEY_BASE64=
GITHUB_REPOSITORY_ACCESS=all
ZORO_GITHUB_API_KEY=
```

3. Extend `src/config/env.js` to validate:
   - positive integer GitHub App ID;
   - positive integer installation ID;
   - non-empty Base64 private key;
   - decoded PEM shape;
   - supported repository access mode;
   - bearer key minimum entropy/length.
4. Add helper functions for:
   - positive integer parsing;
   - Base64 decoding;
   - PEM validation;
   - secret string length validation.
5. Ensure validation errors only name the invalid variable.
6. Return validated GitHub configuration through the frozen environment object.
7. Update configuration tests for:
   - valid complete production configuration;
   - missing variables;
   - invalid integer IDs;
   - malformed Base64;
   - invalid PEM structure;
   - unsupported access mode;
   - short bearer secret;
   - no secret value leakage in thrown messages.

### Design notes

Tests may use a small generated test PEM fixture or a syntactically valid fake key accepted only by validation. Do not use production key material.

### Verification

```bash
npm test -- githubEnv
```

### Exit criteria

- Production startup fails fast for invalid GitHub configuration.
- Valid test configuration produces a frozen configuration object.
- No secret values appear in errors.

## 8. Phase 2 — Dedicated Bearer Authentication

### Objective

Protect every GitHub route with a dedicated bearer API key while leaving existing context routes unchanged.

### Tasks

1. Add error classes:
   - `AuthenticationRequiredError` with `401` and `AUTHENTICATION_REQUIRED`;
   - `GithubForbiddenError` with `403` and `GITHUB_FORBIDDEN`;
   - additional GitHub-specific errors defined later.
2. Create `src/middleware/requireGithubActionAuth.js`.
3. Parse only the standard `Authorization` header.
4. Require the exact `Bearer` scheme, case-insensitively.
5. Reject empty or malformed tokens.
6. Compare supplied and configured keys using `crypto.timingSafeEqual` after normalizing buffers to equal lengths safely.
7. Do not attach the secret to `req`.
8. Do not log the authorization header.
9. Add unit tests for:
   - missing header;
   - malformed header;
   - wrong scheme;
   - empty bearer value;
   - incorrect token;
   - correct token;
   - unequal-length tokens;
   - no token leakage in logs or errors.
10. Add a minimal protected test router or defer route integration until Phase 8 while fully testing the middleware in isolation.

### Verification

```bash
npm test -- githubAuth
```

### Exit criteria

- Invalid requests receive deterministic `401` responses.
- Valid requests pass to the next middleware.
- Timing-safe comparison is covered by tests.

## 9. Phase 3 — Client, Policy, Serialization, and Error Translation

### Objective

Build the reusable infrastructure required by every endpoint before introducing route-specific behavior.

### 9.1 GitHub client

Create `src/services/githubClient.js`.

Tasks:

1. Use a cached dynamic import for `octokit`.
2. Construct one Octokit `App` instance from validated configuration.
3. Acquire an installation-authenticated client with `getInstallationOctokit`.
4. Cache the installation client promise.
5. Reset the cache when client creation fails so later requests can retry.
6. Export a factory that supports dependency injection in tests.
7. Never return raw credentials or tokens.
8. Test:
   - lazy construction;
   - single construction under concurrent calls;
   - retry after initialization failure;
   - installation ID forwarding;
   - no token exposure.

### 9.2 Policy service

Create `src/services/githubPolicy.js`.

Implement pure functions for:

- `assertOwner`;
- `assertRepositoryName`;
- `assertBranchName`;
- `assertRef`;
- `normalizeRepositoryPath`;
- `assertWritablePath`;
- `assertTextContent`;
- `assertContentSize`;
- `assertCommitMessage`;
- `assertPullRequestTitle`;
- `assertPullRequestBody`;
- `assertMergeMethod`.

Rules:

- default branch writes are allowed;
- `.github/workflows` and descendants are denied;
- traversal and control characters are denied;
- binary content is denied;
- force updates are never exposed;
- path normalization must not silently redirect to a different logical path.

Add exhaustive unit tests for accepted and rejected boundary cases.

### 9.3 Serializer

Create `src/serializers/github.serializer.js`.

Add explicit serializers for:

- repository;
- file content;
- directory content;
- branch;
- file write result;
- pull request;
- merge result.

Each serializer must expose only documented fields.

Test that raw GitHub installation data, permissions internals, token fields, request objects, and unrelated API fields are excluded.

### 9.4 Error translation

Extend `src/utils/errors.js` with:

- `GithubForbiddenError`;
- `GithubNotFoundError`;
- `GithubConflictError`;
- `UnsupportedContentError`;
- `GithubValidationError`;
- `GithubUnavailableError`.

Extend `src/middleware/errorHandler.js` or introduce a focused GitHub error translator invoked by the service.

Translate common Octokit failures:

| GitHub status | Application error |
| ---: | --- |
| 401 | `GITHUB_UNAVAILABLE` unless caused by Context API bearer auth |
| 403 | `GITHUB_FORBIDDEN` |
| 404 | `GITHUB_NOT_FOUND` |
| 409 | `GITHUB_CONFLICT` |
| 422 | `GITHUB_VALIDATION_ERROR` or `GITHUB_CONFLICT` when the reason is state conflict |
| 429 | `GITHUB_UNAVAILABLE` |
| 500-599 | `GITHUB_UNAVAILABLE` |

Discard raw upstream bodies. Preserve only safe high-level details.

### Verification

```bash
npm test -- githubPolicy githubSerializer githubErrorTranslation githubClient
```

### Exit criteria

- Every route can share one safe client, one deterministic policy layer, explicit serialization, and safe error mapping.

## 10. Phase 4 — Repository and Content Reads

### Objective

Deliver safe read capability first so Zoro can inspect repository state before performing writes.

### 10.1 Validation schemas

Create `src/validation/github.schemas.js` with explicit schemas for:

- list repositories query;
- get content query;
- list branches query;
- repository query for PR reads;
- route parameters.

Create or extend `src/middleware/validateGithub.js` to:

- reject unknown fields;
- return field-level validation errors;
- coerce bounded integer query values intentionally;
- preserve branch names and paths exactly after validation.

### 10.2 Service methods

Implement in `github.service.js`:

```text
listRepositories
getContent
listBranches
```

#### `listRepositories`

- call installation repository listing;
- preserve GitHub pagination;
- serialize repository metadata;
- return only repositories available to the installation.

#### `getContent`

- resolve default branch when `ref` is omitted;
- call the contents endpoint;
- distinguish files from directories;
- decode Base64 file content to UTF-8;
- reject binary or invalid UTF-8 content with `415`;
- serialize symlinks and submodules explicitly;
- avoid recursively expanding directories.

#### `listBranches`

- fetch repository metadata for default branch;
- list branches with pagination;
- serialize name, SHA, and protection state.

### 10.3 Controllers

Implement thin controller methods that:

- pass validated input to the service;
- return the standard response envelope;
- set `200` status;
- forward errors to centralized middleware.

### 10.4 Tests

Test:

- repository pagination;
- public and private repository serialization;
- default branch resolution;
- file read;
- empty file;
- directory listing;
- repository root listing;
- ref not found;
- file not found;
- binary content rejection;
- symlink representation;
- submodule representation;
- missing and invalid bearer token;
- safe upstream errors.

### Verification

```bash
npm test -- githubService githubRoutes
```

### Exit criteria

- Zoro can safely discover repositories, read content, and inspect branches without MongoDB.

## 11. Phase 5 — Branch Operations

### Objective

Allow Zoro to create branches and move existing branches only through safe fast-forward updates.

### 11.1 Create branch

Implement `createBranch`:

1. validate owner, repository, target branch, and optional base ref;
2. resolve the repository default branch when base ref is omitted;
3. resolve the base ref to a commit SHA;
4. check whether the target branch already exists;
5. create `refs/heads/<branch>`;
6. serialize the branch response.

### 11.2 Update branch

Implement `updateBranch`:

1. validate route branch and body;
2. read current branch ref;
3. compare current SHA with `expectedCurrentSha`;
4. return `409` on mismatch;
5. confirm `newSha` resolves to a commit in the repository;
6. call GitHub ref update with `force: false`;
7. return the updated branch state.

Default branches, including `main`, are allowed. GitHub branch protection remains authoritative.

### 11.3 Tests

Create branch tests:

- default base branch;
- explicit base branch;
- tag or commit base ref;
- existing branch conflict;
- missing base ref;
- invalid branch name;
- upstream validation error.

Update branch tests:

- successful feature-branch fast-forward;
- successful default-branch fast-forward;
- stale current SHA;
- non-fast-forward rejection;
- protected branch denial;
- missing new commit;
- confirm `force` is always `false`;
- confirm caller cannot inject a force field.

### Verification

```bash
npm test -- githubService githubRoutes githubPolicy
```

### Exit criteria

- Branch creation works.
- Safe fast-forward updates work on feature and default branches.
- Force pushes are impossible through the gateway.

## 12. Phase 6 — File Create, Replace, and Delete

### Objective

Provide complete UTF-8 file write access on feature and default branches with optimistic concurrency and workflow-path protection.

### 12.1 Shared file-write preparation

Add reusable service helpers:

- repository and branch verification;
- writable path policy;
- UTF-8 content validation;
- current file lookup;
- write-result serialization;
- stale SHA classification.

Do not run concurrent create/update/delete operations for the same path inside one request.

### 12.2 Create file

Implement `createFile`:

1. validate body;
2. verify repository and branch;
3. enforce writable-path policy;
4. confirm path does not exist;
5. encode UTF-8 content as Base64;
6. call GitHub create/update contents without a SHA;
7. return `201` and serialized commit/content SHAs.

Default branch writes are allowed.

### 12.3 Update file

Implement `updateFile`:

1. validate body;
2. verify repository and branch;
3. enforce writable-path policy;
4. read current path;
5. reject directories, symlinks, or submodules;
6. compare current blob SHA with supplied SHA;
7. return `409` on mismatch;
8. encode full replacement content;
9. call GitHub contents update with the current SHA;
10. return `200` and serialized result.

### 12.4 Delete file

Implement `deleteFile`:

1. validate body;
2. verify repository and branch;
3. enforce writable-path policy;
4. read current path;
5. reject directories, symlinks, or submodules;
6. compare current SHA with supplied SHA;
7. return `409` on mismatch;
8. call GitHub delete contents;
9. return `200` and deletion commit SHA.

### 12.5 Tests

Create tests:

- feature branch success;
- `main` success;
- `master` success;
- repository-specific default branch success;
- existing file conflict;
- missing branch;
- workflow path denial;
- traversal denial;
- oversize content;
- empty content;
- GitHub branch-protection denial.

Update tests:

- feature branch success;
- default branch success;
- stale SHA;
- missing file;
- directory rejection;
- symlink rejection;
- workflow path denial;
- complete replacement semantics;
- upstream conflict.

Delete tests:

- feature branch success;
- default branch success;
- stale SHA;
- missing file;
- workflow path denial;
- directory rejection;
- upstream branch protection.

### Verification

```bash
npm test -- githubService githubRoutes githubPolicy
```

### Exit criteria

- Zoro can create, replace, and delete text files on any allowed branch, including default branches.
- Stale SHA conflicts are deterministic.
- Workflow files remain inaccessible for writes.

## 13. Phase 7 — Pull-Request Lifecycle and Merge

### Objective

Allow Zoro to manage the complete pull-request lifecycle permitted by the GitHub App's pull-request permission.

### 13.1 Create pull request

Implement:

- title, body, head, base, draft, and maintainer-modification validation;
- draft default `true`;
- conflict translation when an equivalent PR exists;
- explicit serialized PR response.

### 13.2 Get pull request

Implement:

- repository query plus numeric route parameter;
- current head/base refs and SHAs;
- draft, state, mergeability, mergeable state, and URL;
- unknown mergeability preservation.

### 13.3 Update or close pull request

Implement patch support for:

- title;
- body;
- state `open` or `closed`;
- base branch;
- maintainer-modification setting.

Reject empty patch bodies and unknown fields.

### 13.4 Merge pull request

Implement:

1. validate owner, repository, number, expected head SHA, merge method, and optional commit text;
2. fetch the current pull request;
3. reject already merged or invalid state;
4. compare current head SHA with `expectedHeadSha`;
5. return `409` on mismatch;
6. call the GitHub merge endpoint;
7. preserve repository settings, checks, reviews, conflicts, and branch protection as authoritative;
8. serialize the merge result.

Never add an endpoint for approving a pull request or bypassing review requirements.

### 13.5 Tests

Create tests for:

- draft PR creation;
- non-draft PR creation;
- duplicate PR conflict;
- missing head or base;
- PR read;
- mergeability unknown state;
- title update;
- body update;
- close;
- reopen;
- base retarget;
- empty patch rejection;
- successful squash merge;
- successful merge and rebase methods;
- stale expected head SHA;
- merge conflict;
- required checks missing;
- required reviews missing;
- branch-protection denial;
- already merged;
- closed PR;
- unsupported merge method;
- safe error responses.

### Verification

```bash
npm test -- githubService githubRoutes githubSerializer githubErrorTranslation
```

### Exit criteria

- Zoro can create, read, update, close, reopen, and merge pull requests safely.
- Merge concurrency and repository policy are enforced.

## 14. Phase 8 — Application Integration and Route Registration

### Objective

Mount the GitHub gateway correctly without changing existing context-route body limits or MongoDB behavior.

### Tasks

1. Create `src/routes/v1/github.js` with the 12 specified operations.
2. Update `src/app.js`:
   - remove the global JSON parser;
   - preserve security, correlation, logging, and query middleware;
   - keep health outside database requirements;
   - apply rate limiting and allowed methods to `/api/v1`;
   - mount GitHub routes with `512kb` JSON parsing and bearer authentication;
   - mount existing context routes with the existing `10kb` parser and `requireDatabase`.
3. Ensure GitHub routes remain reachable when MongoDB is unavailable.
4. Confirm existing context routes still return database-unavailable behavior when appropriate.
5. Confirm unsupported methods return `405`.
6. Confirm a GitHub route without auth returns `401` before any GitHub service call.
7. Confirm GitHub request bodies above `512kb` return `400` through the existing safe body-limit translation.
8. Add production route registration coverage using the exported application in production mode.

### Expected route flow

```text
/health
  -> health controller

/api/v1/github/*
  -> rate limiter
  -> allowed methods
  -> 512 KB JSON parser
  -> GitHub bearer authentication
  -> GitHub router

/api/v1/*
  -> rate limiter
  -> allowed methods
  -> 10 KB JSON parser
  -> MongoDB availability guard
  -> existing v1 router
```

### Tests

- GitHub route works with disconnected MongoDB and mocked GitHub service.
- Existing project/task/profile routes still require MongoDB.
- Existing body-limit tests remain green.
- GitHub-specific larger body limit works.
- Middleware ordering prevents unauthenticated service execution.
- Production route registration exposes all 12 GitHub operations.

### Verification

```bash
npm test -- githubRoutes githubBodyLimit githubDatabaseIndependence githubProductionRouteRegistration productionRouteRegistration
```

### Exit criteria

- Middleware order matches the specification.
- Existing APIs are not regressed.
- GitHub routes are independent from MongoDB availability.

## 15. Phase 9 — Documentation, Action Schema, and Regression Closure

### Objective

Document the deployed contract and prepare the Custom GPT Action update.

### Repository documentation tasks

1. Update `README.md` with:
   - GitHub gateway overview;
   - route catalogue;
   - bearer-auth requirement;
   - warning about direct default-branch writes and deletions;
   - explicit out-of-scope operations.
2. Update `docs/DEPLOYMENT.md` with:
   - required Heroku variables;
   - safe configuration verification;
   - GitHub deployment smoke tests;
   - rollback and key rotation steps.
3. Update `.env.example`.
4. Confirm no secret values exist in the repository history introduced by this work.
5. Update package documentation for Octokit if dependency policy requires it.

### Custom GPT Action tasks

1. Start from the current OpenAPI 3.1 schema.
2. Preserve the 15 existing operations.
3. Add the 12 GitHub operations from the specification.
4. Add explicit request/response schemas.
5. Add a bearer API-key security scheme.
6. Apply security to GitHub operations.
7. Confirm the total operation count is 27.
8. Validate the schema in the GPT editor.
9. Do not paste the bearer secret into the schema text.
10. Configure the Action authentication UI with the same secret stored in `ZORO_GITHUB_API_KEY`.

### Regression closure

Run:

```bash
npm test
npm run lint
npm run format:check
```

Review:

```bash
git diff --check
git status --short
```

Inspect committed files for accidental credentials:

```bash
git grep -n "BEGIN.*PRIVATE KEY"
git grep -n "GITHUB_PRIVATE_KEY_BASE64=.*[^=]"
git grep -n "ZORO_GITHUB_API_KEY=.*[^=]"
```

The grep expressions are safeguards and may need adjustment for shell behavior. They must never print actual deployment values because those values must not exist in the repository.

### Exit criteria

- Documentation matches implementation.
- Action schema matches deployed routes.
- All automated checks pass.
- No credentials are committed.

## 16. Phase 10 — Deployment and End-to-End Verification

### Objective

Deploy the verified implementation and prove the full workflow through Zoro.

### 16.1 Pre-deployment checks

1. Confirm the following Heroku config variables exist without printing secrets:

```text
GITHUB_APP_ID
GITHUB_INSTALLATION_ID
GITHUB_PRIVATE_KEY_BASE64
GITHUB_REPOSITORY_ACCESS
ZORO_GITHUB_API_KEY
```

2. Confirm `GITHUB_REPOSITORY_ACCESS=all`.
3. Confirm the GitHub App remains installed on all repositories.
4. Confirm GitHub App permissions remain:
   - metadata read;
   - contents read/write;
   - pull requests read/write.
5. Confirm all local verification commands pass.

### 16.2 Deploy

Deploy the verified `main` commit using the repository's established Heroku process.

Verify:

```bash
heroku releases --app context-api
heroku logs --tail --app context-api
```

Confirm startup completes without logging secret values.

### 16.3 API smoke tests before Zoro update

Use a local shell with the bearer key loaded from a secure source.

Test in order:

1. unauthenticated repository list returns `401`;
2. authenticated repository list returns `200`;
3. repository root read returns `200`;
4. branch list returns `200`;
5. workflow-path create attempt returns `403`;
6. invalid repository returns safe `404`;
7. MongoDB outage simulation, if practical, does not break GitHub routes.

Do not send file writes until read and policy checks pass.

### 16.4 Safe write smoke test

Use a disposable path such as:

```text
docs/zoro-gateway-smoke-test.md
```

Prefer a non-critical repository for the first write test.

1. Create a feature branch.
2. Create the disposable file.
3. Read it and capture the blob SHA.
4. Update it with the captured SHA.
5. Create a draft pull request.
6. Read the pull request and capture its head SHA.
7. Close the PR without merging.
8. Perform a separate direct write to the repository default branch using another disposable file.
9. Read that file and capture the SHA.
10. Delete it using the current SHA.
11. Confirm the default branch history contains the create and delete commits.

Do not merge the first PR smoke test unless the repository is explicitly disposable.

### 16.5 Update Zoro

1. Open Zoro's GPT editor.
2. Open the existing Context API Action.
3. replace the schema with the verified full updated schema;
4. configure bearer API-key authentication;
5. save/update Zoro;
6. open a new Zoro conversation to avoid stale Action metadata.

### 16.6 Zoro verification prompts

Use prompts that force one operation at a time:

```text
List the GitHub repositories available to you.
```

```text
Read README.md from kofiarhin/context-api on main.
```

```text
Create docs/zoro-action-smoke-test.md on main with a short test message, then report the commit SHA.
```

```text
Read docs/zoro-action-smoke-test.md, then delete it using its current SHA.
```

```text
Create a branch named test/zoro-pr-smoke from main, add a disposable file, and open a draft pull request.
```

Verify every claimed action directly in GitHub.

### 16.7 Post-deployment cleanup

- remove disposable files;
- close disposable pull requests;
- delete disposable branches manually if branch deletion is not implemented;
- retain safe correlation IDs and commit links in the verification record;
- rotate the bearer key if it was exposed during setup;
- archive local copies of the GitHub private key securely.

### Exit criteria

- Deployed API is healthy.
- Zoro can read and write repositories.
- Direct default-branch create/update/delete works.
- PR lifecycle works.
- Workflow-path writes remain blocked.
- All claims are verified in GitHub.

## 17. Test Matrix

| Area | Success | Validation | Auth | Conflict | Permission | Upstream |
| --- | --- | --- | --- | --- | --- | --- |
| repositories | list/paginate | invalid page | 401 | n/a | 403 | 502 |
| contents | file/directory | invalid path | 401 | n/a | 403 | 404/502 |
| branches list | list/paginate | invalid repo | 401 | n/a | 403 | 404/502 |
| branch create | explicit/default base | invalid ref | 401 | exists | 403 | 422/502 |
| branch update | feature/default | invalid SHA | 401 | stale/non-FF | protected | 422/502 |
| file create | feature/default | invalid path/content | 401 | exists | protected/workflow | 422/502 |
| file update | feature/default | invalid body | 401 | stale SHA | protected/workflow | 422/502 |
| file delete | feature/default | invalid body | 401 | stale SHA | protected/workflow | 422/502 |
| PR create | draft/open | invalid refs | 401 | duplicate | 403 | 422/502 |
| PR get | open/closed | invalid number | 401 | n/a | 403 | 404/502 |
| PR update | edit/close/reopen | empty patch | 401 | state conflict | 403 | 422/502 |
| PR merge | merge/squash/rebase | invalid method | 401 | stale/conflict | checks/protection | 422/502 |

## 18. Security Review Checklist

Before deployment, confirm:

- [ ] bearer authentication covers every GitHub route;
- [ ] bearer token comparison is timing-safe;
- [ ] secrets are absent from request logs;
- [ ] private keys are decoded only in memory;
- [ ] installation tokens are managed by Octokit;
- [ ] raw upstream bodies are not returned;
- [ ] `.github/workflows/*` is blocked case-insensitively after path normalization;
- [ ] traversal paths are rejected;
- [ ] binary content is rejected;
- [ ] content length is bounded;
- [ ] update and delete require current blob SHA;
- [ ] branch update requires expected current SHA;
- [ ] branch update always sets `force: false`;
- [ ] PR merge requires expected head SHA;
- [ ] repository administration is not exposed;
- [ ] secret or Actions endpoints are not exposed;
- [ ] branch protection remains authoritative;
- [ ] direct default-branch writes are explicitly documented;
- [ ] destructive-operation smoke tests use disposable paths.

## 19. Operational Risks and Mitigations

### Direct writes to default branches

Risk: an incorrect change becomes immediately visible or deployable.

Mitigations:

- require explicit branch input;
- require current SHA for replacements and deletions;
- retain Git history for rollback;
- document direct-write behavior in Zoro instructions;
- verify commit SHA after every write;
- prefer feature branches for risky changes even though main writes are allowed.

### Installation-wide repository scope

Risk: a compromised bearer key can affect every accessible repository.

Mitigations:

- use a high-entropy bearer key;
- never expose it in prompts or schema text;
- rotate immediately on suspected exposure;
- retain the ability to suspend or uninstall the GitHub App;
- keep GitHub App permissions limited to metadata, contents, and pull requests.

### Concurrent writes

Risk: Zoro overwrites newer work.

Mitigations:

- require current blob SHA for update/delete;
- require expected branch SHA for branch updates;
- require expected head SHA for PR merge;
- return `409` without automatic destructive retry.

### Branch protection

Risk: direct writes or merges fail unexpectedly.

Mitigation: surface safe `403`, `409`, or `422` errors and never claim success when GitHub rejects the operation.

### Large files

Risk: request memory pressure and Action payload limits.

Mitigations:

- 512 KB request-body limit;
- 250,000-character file-content limit;
- UTF-8 text only;
- no binary or LFS support.

## 20. Rollback Plan

### Application rollback

1. Revert the gateway implementation commit on `main`.
2. Redeploy the previous verified release.
3. Confirm existing context endpoints remain healthy.

### Zoro rollback

1. Remove GitHub paths from the Action schema or restore the previous schema.
2. Save/update Zoro.
3. Start a new conversation and confirm GitHub operations are unavailable.

### Credential containment

On suspected exposure:

1. rotate `ZORO_GITHUB_API_KEY`;
2. update the Action authentication value;
3. generate a new GitHub App private key;
4. update `GITHUB_PRIVATE_KEY_BASE64`;
5. revoke the old GitHub App private key;
6. suspend or uninstall the GitHub App if immediate isolation is required.

### Repository recovery

- revert incorrect commits through normal Git history;
- restore deleted files from prior commits;
- do not force-push as part of automated recovery;
- record affected repositories, paths, commits, and correlation IDs.

## 21. Completion Report Requirements

After verified implementation, record:

- final commit SHA on `main`;
- changed files;
- added dependencies;
- tests added;
- exact verification commands and outcomes;
- deployed Heroku release;
- Action schema operation count;
- smoke-test repositories, branches, paths, commits, and PR links;
- known limits;
- remaining risks;
- whether disposable artifacts were cleaned up;
- whether project records and Context API tasks were updated.

Do not mark implementation complete before automated verification, deployment verification, Action verification, and direct GitHub confirmation all pass.
