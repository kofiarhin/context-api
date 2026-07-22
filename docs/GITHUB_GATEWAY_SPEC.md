# Context API — GitHub Gateway Technical Specification

**Version:** 1.0  
**Status:** Approved for implementation  
**Owner:** Kofi  
**Target branch:** `main`  
**Last updated:** 2026-07-22  
**Source:** Approved Shared Understanding Handoff for Zoro GitHub access

## 1. Purpose

Extend the existing Context API so Zoro can operate as a GitHub builder agent without replacing the Context API as Zoro's persistent brain.

The gateway must expose authenticated GitHub repository operations through the same Custom GPT Action that already exposes health, profile, project, and task operations.

The gateway must allow Zoro to:

- discover every repository available to the installed GitHub App;
- inspect repository metadata, branches, files, and directory contents;
- create branches;
- fast-forward existing branches without force-pushing;
- create, replace, and delete UTF-8 repository files;
- write directly to `main`, `master`, or any repository default branch;
- create, read, update, close, and merge pull requests;
- work across all current and future repositories granted to the GitHub App installation.

The gateway must not grant repository administration, organization administration, collaborator management, secret management, workflow administration, branch-protection bypasses, or force pushes.

## 2. Current System Context

The Context API is a Node.js, Express, MongoDB, and Mongoose service using CommonJS modules, Jest, Supertest, centralized errors, explicit validation, rate limiting, safe logging, and response envelopes.

The existing API mounts domain routes beneath `/api/v1`. The current Custom GPT Action exposes health, profile, project, and task operations.

GitHub App credentials are deployed as Heroku config variables. The GitHub App installation has repository permissions:

- Metadata: read-only
- Contents: read and write
- Pull requests: read and write

The app is installed with access to all repositories owned by the configured account, including future repositories.

## 3. Goals

1. Preserve all existing Context API behavior and response contracts.
2. Add a separately authenticated GitHub surface beneath `/api/v1/github`.
3. Use GitHub App installation authentication rather than personal access tokens.
4. Permit direct writes to default branches while honoring GitHub branch protection.
5. Provide optimistic concurrency controls for destructive or replacement writes.
6. Keep secrets, installation tokens, private keys, and raw upstream errors out of responses and logs.
7. Keep the resulting Custom GPT Action below the 30-operation limit.
8. Provide deterministic automated tests for authentication, validation, service behavior, policy enforcement, and route registration.

## 4. Non-Goals

The initial gateway will not support:

- creating, deleting, transferring, archiving, or changing visibility of repositories;
- repository settings or ruleset management;
- collaborator, team, role, or organization membership changes;
- deploy keys, repository secrets, Actions secrets, variables, or environments;
- triggering, cancelling, or re-running GitHub Actions;
- editing files beneath `.github/workflows/`;
- force-pushing or non-fast-forward branch updates;
- bypassing branch protection or required status checks;
- binary file upload or download;
- Git LFS operations;
- releases, packages, deployments, discussions, projects, or wikis;
- webhooks or event-driven execution;
- automatic pull-request approval;
- automatic retry of destructive writes after conflicts.

## 5. High-Level Architecture

```text
Zoro Custom GPT
  |
  | Bearer ZORO_GITHUB_API_KEY
  v
Context API
  |- existing context routes
  `- /api/v1/github/*
       |- authentication middleware
       |- request validation
       |- GitHub policy enforcement
       |- GitHub service
       `- Octokit installation client
            |
            | short-lived installation token
            v
        GitHub REST API
```

The Context API remains the only system exposed to Zoro. Zoro never receives the GitHub private key, app JWT, installation token, or Heroku credentials.

## 6. Runtime Dependencies

Add the official Octokit package:

```bash
npm install octokit
```

Because the repository uses CommonJS, the GitHub client service may use a cached dynamic import:

```js
const { App } = await import('octokit');
```

No additional validation library is required. Validation should follow the repository's existing explicit middleware and schema conventions.

## 7. Environment Configuration

### 7.1 Required variables

```text
GITHUB_APP_ID
GITHUB_INSTALLATION_ID
GITHUB_PRIVATE_KEY_BASE64
GITHUB_REPOSITORY_ACCESS
ZORO_GITHUB_API_KEY
```

### 7.2 Expected values

- `GITHUB_APP_ID`: positive integer represented as a string.
- `GITHUB_INSTALLATION_ID`: positive integer represented as a string.
- `GITHUB_PRIVATE_KEY_BASE64`: Base64-encoded PEM private key.
- `GITHUB_REPOSITORY_ACCESS`: currently `all`.
- `ZORO_GITHUB_API_KEY`: cryptographically random bearer secret with at least 32 bytes of entropy.

### 7.3 Validation rules

Production startup must fail fast when any required GitHub variable is missing or malformed.

The environment loader must never include secret values in validation errors. Errors may name the invalid variable only.

The decoded private key must begin with a supported PEM header and end with the matching footer. The decoded value must never be logged.

### 7.4 Returned configuration

The frozen environment object may expose:

```js
{
  githubAppId,
  githubInstallationId,
  githubPrivateKey,
  githubRepositoryAccess,
  zoroGithubApiKey,
}
```

Secrets remain server-side only.

## 8. Authentication and Authorization

### 8.1 Context API bearer authentication

Every `/api/v1/github/*` endpoint requires:

```http
Authorization: Bearer <ZORO_GITHUB_API_KEY>
```

Authentication middleware must:

1. reject a missing header with `401`;
2. reject unsupported authentication schemes with `401`;
3. compare the supplied token using a timing-safe comparison;
4. reject invalid tokens with `401`;
5. avoid logging the header or token;
6. call the next middleware only after successful validation.

### 8.2 GitHub authorization

GitHub authorization is provided by a GitHub App installation token generated from:

- GitHub App ID;
- decoded private key;
- installation ID.

Octokit should generate and refresh short-lived installation tokens automatically.

The server must not attempt to bypass GitHub branch protection. A GitHub `403` or `422` caused by repository policy must be returned as a safe application error.

### 8.3 Repository scope

`GITHUB_REPOSITORY_ACCESS=all` means the gateway may operate on every repository visible to the configured installation.

The service must still verify repository visibility through GitHub before writes. A user-supplied owner/repository pair is not trusted merely because it is syntactically valid.

## 9. Route Mounting and Middleware Order

GitHub routes must not depend on MongoDB availability.

Recommended application flow:

```js
app.use(helmet());
app.use(createCors(env));
app.use(correlationId);
app.use(requestLogger);
app.use(queryLimits);

app.get('/health', getHealth);

app.use('/api/v1', createRateLimiter(env), allowedMethods);

app.use(
  '/api/v1/github',
  express.json({ limit: '512kb' }),
  requireGithubActionAuth(env),
  githubRouter
);

app.use(
  '/api/v1',
  express.json({ limit: JSON_BODY_LIMIT }),
  requireDatabase,
  v1Router
);
```

The current global JSON parser must be refactored so GitHub file operations can use a route-specific limit while existing context routes retain the 10 KB limit.

The shared allowed-method middleware already permits the required verbs: `GET`, `POST`, `PATCH`, and `DELETE`.

## 10. API Conventions

### 10.1 Base path

```text
/api/v1/github
```

### 10.2 Response envelope

Successful responses use the existing resource envelope:

```json
{
  "data": {},
  "correlationId": "string"
}
```

Collections may include `meta`:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "perPage": 30,
    "hasNextPage": false
  },
  "correlationId": "string"
}
```

### 10.3 Error envelope

Errors use the existing error structure:

```json
{
  "error": {
    "code": "GITHUB_CONFLICT",
    "message": "The GitHub operation conflicts with the current repository state.",
    "details": []
  },
  "correlationId": "string"
}
```

### 10.4 Owner and repository identifiers

- `owner`: 1-100 characters; GitHub-compatible login characters only.
- `repo`: 1-100 characters; GitHub-compatible repository name characters only.
- The pair is always supplied separately, not as an arbitrary URL.

### 10.5 Branch and ref values

- branch names must be 1-255 characters;
- refs must not contain control characters, spaces, `..`, `@{`, trailing dots, or consecutive slashes;
- write routes require an explicit branch;
- read routes may omit `ref`, in which case the repository default branch is used.

### 10.6 Repository paths

Paths must:

- be relative repository paths;
- use `/` separators;
- not begin with `/`;
- not contain null bytes;
- not contain `.` or `..` traversal segments;
- not exceed 1,024 characters;
- not target `.github/workflows` or any descendant.

### 10.7 File content

The initial version supports UTF-8 text only.

- Maximum `content` length: 250,000 characters.
- Empty content is valid.
- Binary/base64 input is out of scope.

### 10.8 Commit messages

- required for create, update, and delete operations;
- 1-250 characters;
- line breaks allowed only after the first line;
- must not contain credentials or secret values.

## 11. Endpoint Catalogue

The GitHub gateway adds 12 operations. Combined with the 15 current Action operations, the total is 27, below the 30-operation limit.

| Method | Path | Operation ID |
| --- | --- | --- |
| GET | `/repositories` | `listGithubRepositories` |
| GET | `/contents` | `getGithubContent` |
| GET | `/branches` | `listGithubBranches` |
| POST | `/branches` | `createGithubBranch` |
| PATCH | `/branches/{branch}` | `updateGithubBranch` |
| POST | `/files` | `createGithubFile` |
| PATCH | `/files` | `updateGithubFile` |
| DELETE | `/files` | `deleteGithubFile` |
| POST | `/pull-requests` | `createGithubPullRequest` |
| GET | `/pull-requests/{pullNumber}` | `getGithubPullRequest` |
| PATCH | `/pull-requests/{pullNumber}` | `updateGithubPullRequest` |
| POST | `/pull-requests/{pullNumber}/merge` | `mergeGithubPullRequest` |

## 12. Endpoint Specifications

### 12.1 List repositories

```http
GET /api/v1/github/repositories?page=1&perPage=30
```

#### Query

- `page`: integer, default `1`, minimum `1`.
- `perPage`: integer, default `30`, minimum `1`, maximum `100`.

#### Behavior

List repositories available to the configured GitHub App installation.

#### Response data

Each item contains only:

```json
{
  "owner": "kofiarhin",
  "name": "context-api",
  "fullName": "kofiarhin/context-api",
  "private": false,
  "archived": false,
  "defaultBranch": "main",
  "htmlUrl": "https://github.com/kofiarhin/context-api",
  "permissions": {
    "contents": "write",
    "pullRequests": "write"
  }
}
```

Do not return installation tokens, internal GitHub App metadata, clone credentials, webhook secrets, or raw permission payloads.

#### Statuses

- `200` success
- `401` missing or invalid Context API bearer token
- `502` GitHub unavailable or returned an unexpected response

### 12.2 Get repository content

```http
GET /api/v1/github/contents?owner=kofiarhin&repo=context-api&path=src/app.js&ref=main
```

#### Query

- `owner`: required
- `repo`: required
- `path`: optional; empty path means repository root
- `ref`: optional; defaults to the repository default branch

#### Behavior

Read a UTF-8 file or list directory entries.

#### File response data

```json
{
  "type": "file",
  "owner": "kofiarhin",
  "repo": "context-api",
  "path": "src/app.js",
  "ref": "main",
  "sha": "blob-sha",
  "size": 2048,
  "encoding": "utf-8",
  "content": "complete file text",
  "htmlUrl": "https://github.com/..."
}
```

#### Directory response data

```json
{
  "type": "directory",
  "owner": "kofiarhin",
  "repo": "context-api",
  "path": "src",
  "ref": "main",
  "entries": [
    {
      "type": "file",
      "name": "app.js",
      "path": "src/app.js",
      "sha": "blob-sha",
      "size": 2048,
      "htmlUrl": "https://github.com/..."
    }
  ]
}
```

Submodules and symbolic links must be represented explicitly and must not be treated as ordinary editable files.

#### Statuses

- `200` success
- `400` invalid query
- `401` authentication failure
- `404` repository, ref, or path not found
- `415` unsupported binary content
- `502` upstream failure

### 12.3 List branches

```http
GET /api/v1/github/branches?owner=kofiarhin&repo=context-api&page=1&perPage=30
```

#### Response data

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "defaultBranch": "main",
  "branches": [
    {
      "name": "main",
      "sha": "commit-sha",
      "protected": false
    }
  ]
}
```

#### Statuses

- `200` success
- `400` invalid query
- `401` authentication failure
- `404` repository not found
- `502` upstream failure

### 12.4 Create branch

```http
POST /api/v1/github/branches
```

#### Body

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "branch": "feature/github-gateway",
  "baseRef": "main"
}
```

`baseRef` defaults to the repository default branch when omitted.

#### Behavior

1. Resolve `baseRef` to a commit SHA.
2. Reject an existing target branch with `409`.
3. Create `refs/heads/<branch>` at the base commit.

#### Response data

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "branch": "feature/github-gateway",
  "sha": "commit-sha",
  "baseRef": "main",
  "htmlUrl": "https://github.com/.../tree/feature/github-gateway"
}
```

#### Statuses

- `201` created
- `400` invalid body
- `401` authentication failure
- `404` repository or base ref not found
- `409` branch already exists
- `422` GitHub rejected the ref
- `502` upstream failure

### 12.5 Update branch

```http
PATCH /api/v1/github/branches/{branch}
```

#### Body

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "expectedCurrentSha": "current-commit-sha",
  "newSha": "new-commit-sha"
}
```

#### Behavior

1. Read the current branch SHA.
2. Return `409` when it does not equal `expectedCurrentSha`.
3. Update the branch to `newSha` with `force: false`.
4. Never expose a `force` option to callers.

This endpoint may update a default branch, including `main`, when GitHub allows the fast-forward update.

#### Statuses

- `200` updated
- `400` invalid input
- `401` authentication failure
- `403` branch protection or permission denial
- `404` branch, repository, or target commit not found
- `409` stale expected SHA or non-fast-forward conflict
- `422` GitHub rejected the update
- `502` upstream failure

### 12.6 Create file

```http
POST /api/v1/github/files
```

#### Body

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "branch": "main",
  "path": "docs/example.md",
  "content": "# Example\n",
  "message": "docs: add example"
}
```

#### Behavior

- allow writes to feature branches and default branches;
- reject `.github/workflows/*`;
- confirm the path does not already exist at the target branch;
- create the file through GitHub's contents API;
- return the resulting commit and content SHA.

#### Response data

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "branch": "main",
  "path": "docs/example.md",
  "contentSha": "blob-sha",
  "commitSha": "commit-sha",
  "commitUrl": "https://github.com/.../commit/..."
}
```

#### Statuses

- `201` created
- `400` invalid body
- `401` authentication failure
- `403` protected path, branch protection, or permission denial
- `404` repository or branch not found
- `409` file already exists or branch moved during the operation
- `422` GitHub rejected the write
- `502` upstream failure

### 12.7 Update file

```http
PATCH /api/v1/github/files
```

#### Body

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "branch": "main",
  "path": "docs/example.md",
  "sha": "current-blob-sha",
  "content": "# Updated example\n",
  "message": "docs: update example"
}
```

#### Behavior

- allow replacement on feature and default branches;
- require the current blob SHA;
- reject missing files with `404`;
- reject stale SHA values with `409`;
- reject `.github/workflows/*`;
- replace the complete file contents.

Partial patches are out of scope. Zoro must read the file, calculate complete replacement content, then submit the update.

#### Statuses

- `200` updated
- `400` invalid body
- `401` authentication failure
- `403` protected path, branch protection, or permission denial
- `404` repository, branch, or file not found
- `409` stale SHA or concurrent update
- `422` GitHub rejected the write
- `502` upstream failure

### 12.8 Delete file

```http
DELETE /api/v1/github/files
```

#### Body

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "branch": "main",
  "path": "docs/example.md",
  "sha": "current-blob-sha",
  "message": "docs: remove obsolete example"
}
```

#### Behavior

- permit deletion on feature and default branches;
- require the current blob SHA;
- reject stale SHA values with `409`;
- reject `.github/workflows/*`;
- return the deletion commit SHA.

#### Statuses

- `200` deleted
- `400` invalid body
- `401` authentication failure
- `403` protected path, branch protection, or permission denial
- `404` repository, branch, or file not found
- `409` stale SHA or concurrent update
- `422` GitHub rejected the deletion
- `502` upstream failure

### 12.9 Create pull request

```http
POST /api/v1/github/pull-requests
```

#### Body

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "title": "Add GitHub gateway",
  "body": "Implements the approved gateway specification.",
  "head": "feature/github-gateway",
  "base": "main",
  "draft": true,
  "maintainerCanModify": true
}
```

`draft` defaults to `true`.

#### Statuses

- `201` created
- `400` invalid body
- `401` authentication failure
- `404` repository, head, or base not found
- `409` an equivalent pull request already exists
- `422` GitHub rejected the pull request
- `502` upstream failure

### 12.10 Get pull request

```http
GET /api/v1/github/pull-requests/{pullNumber}?owner=kofiarhin&repo=context-api
```

#### Response data

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "number": 42,
  "title": "Add GitHub gateway",
  "body": "...",
  "state": "open",
  "draft": true,
  "mergeable": true,
  "mergeableState": "clean",
  "head": {
    "ref": "feature/github-gateway",
    "sha": "head-sha"
  },
  "base": {
    "ref": "main",
    "sha": "base-sha"
  },
  "htmlUrl": "https://github.com/.../pull/42"
}
```

GitHub may return an unknown mergeable state while calculating mergeability. The service must preserve that state without guessing.

### 12.11 Update or close pull request

```http
PATCH /api/v1/github/pull-requests/{pullNumber}
```

#### Body

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "title": "Updated title",
  "body": "Updated body",
  "state": "closed",
  "base": "main",
  "maintainerCanModify": true
}
```

At least one mutable property is required.

Supported changes:

- title;
- body;
- state: `open` or `closed`;
- base branch;
- maintainer modification setting.

Reopening a closed but unmerged pull request is permitted when GitHub allows it.

### 12.12 Merge pull request

```http
POST /api/v1/github/pull-requests/{pullNumber}/merge
```

#### Body

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "expectedHeadSha": "current-head-sha",
  "mergeMethod": "squash",
  "commitTitle": "feat: add GitHub gateway",
  "commitMessage": "Implements authenticated repository operations."
}
```

#### Rules

- `expectedHeadSha` is required to prevent merging a pull request that changed after inspection;
- `mergeMethod` is one of `merge`, `squash`, or `rebase`;
- repository merge settings remain authoritative;
- required checks, reviews, and branch protection remain authoritative;
- the service never requests a branch-protection bypass.

#### Response data

```json
{
  "owner": "kofiarhin",
  "repo": "context-api",
  "number": 42,
  "merged": true,
  "sha": "merge-commit-sha",
  "message": "Pull Request successfully merged"
}
```

#### Statuses

- `200` merge attempted and completed
- `400` invalid body
- `401` authentication failure
- `403` protected branch, missing checks, missing reviews, or permission denial
- `404` repository or pull request not found
- `409` stale head SHA, merge conflict, closed PR, or already merged state
- `422` GitHub rejected the merge method or request
- `502` upstream failure

## 13. Policy Enforcement

### 13.1 Allowed

- reading public and private repositories visible to the installation;
- reading any branch, tag, or commit ref;
- creating branches;
- fast-forwarding branches, including default branches;
- creating, updating, and deleting UTF-8 files;
- direct commits to `main`, `master`, and repository default branches;
- creating, reading, editing, closing, reopening, and merging pull requests.

### 13.2 Always denied

- any path equal to `.github/workflows` or beginning `.github/workflows/`;
- force branch updates;
- repository administration;
- secrets, variables, deploy keys, environments, or Actions administration;
- branch-protection bypasses;
- binary file writes;
- arbitrary GitHub API passthrough requests.

### 13.3 GitHub remains authoritative

The gateway must not simulate success. When GitHub denies an operation due to branch protection, permissions, repository settings, validation, merge conflicts, required reviews, or required status checks, the Context API must return a safe error that accurately reflects failure.

## 14. GitHub Client Service

Create `src/services/githubClient.js`.

Responsibilities:

1. decode the private key from environment configuration;
2. lazily construct one Octokit `App` instance;
3. lazily acquire an installation-authenticated Octokit client;
4. reuse the client across requests;
5. allow dependency injection for tests;
6. never expose tokens or authentication objects outside the service boundary.

The service must not cache a raw installation token manually unless Octokit requires it. Prefer Octokit's installation authentication lifecycle.

## 15. GitHub Domain Service

Create `src/services/github.service.js`.

Responsibilities:

- repository listing;
- repository metadata verification;
- content reads and UTF-8 decoding;
- branch listing, creation, and safe update;
- file creation, replacement, and deletion;
- pull-request creation, retrieval, update, close, and merge;
- pagination normalization;
- upstream response serialization;
- upstream error translation inputs.

Controllers remain thin and must not contain Octokit calls.

## 16. GitHub Policy Service

Create `src/services/githubPolicy.js`.

Responsibilities:

- owner/repository syntax validation helpers;
- branch/ref safety validation;
- repository path normalization;
- workflow-path denial;
- content-size enforcement;
- commit-message enforcement;
- prevention of force updates;
- UTF-8 text-only policy.

Policy functions should be deterministic and unit-testable without GitHub or MongoDB.

## 17. Validation Layer

Create `src/validation/github.schemas.js` and `src/middleware/validateGithub.js`, or extend the repository's existing validation system while preserving separation from MongoDB domain schemas.

Validation must:

- reject unknown query and body fields;
- reject empty patch bodies;
- reject invalid enums;
- apply maximum lengths;
- normalize safe fields only where normalization is unambiguous;
- preserve branch names, paths, commit messages, PR titles, and PR bodies exactly after validation;
- return field-level details in the existing validation-error shape.

## 18. Controllers and Routes

Create:

```text
src/controllers/github.controller.js
src/routes/v1/github.js
```

Recommended route registration:

```js
router.get('/repositories', validateGithubQuery('listRepositories'), controller.listRepositories);
router.get('/contents', validateGithubQuery('getContent'), controller.getContent);
router.get('/branches', validateGithubQuery('listBranches'), controller.listBranches);
router.post('/branches', validateGithubBody('createBranch'), controller.createBranch);
router.patch(
  '/branches/:branch',
  validateGithubParam('branch'),
  validateGithubBody('updateBranch'),
  controller.updateBranch
);
router.post('/files', validateGithubBody('createFile'), controller.createFile);
router.patch('/files', validateGithubBody('updateFile'), controller.updateFile);
router.delete('/files', validateGithubBody('deleteFile'), controller.deleteFile);
router.post('/pull-requests', validateGithubBody('createPullRequest'), controller.createPullRequest);
router.get(
  '/pull-requests/:pullNumber',
  validateGithubParam('pullNumber'),
  validateGithubQuery('pullRequestRepository'),
  controller.getPullRequest
);
router.patch(
  '/pull-requests/:pullNumber',
  validateGithubParam('pullNumber'),
  validateGithubBody('updatePullRequest'),
  controller.updatePullRequest
);
router.post(
  '/pull-requests/:pullNumber/merge',
  validateGithubParam('pullNumber'),
  validateGithubBody('mergePullRequest'),
  controller.mergePullRequest
);
```

## 19. Error Model

Add application errors where needed:

| Code | HTTP | Meaning |
| --- | ---: | --- |
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid Context API bearer token |
| `GITHUB_FORBIDDEN` | 403 | GitHub or server policy denied the operation |
| `GITHUB_NOT_FOUND` | 404 | Repository, ref, file, branch, commit, or pull request not found |
| `GITHUB_CONFLICT` | 409 | Stale SHA, existing resource, branch conflict, merge conflict, or state conflict |
| `UNSUPPORTED_CONTENT` | 415 | Binary or unsupported repository content |
| `GITHUB_VALIDATION_ERROR` | 422 | GitHub rejected a semantically invalid operation |
| `GITHUB_UNAVAILABLE` | 502 | GitHub unavailable or returned an unexpected upstream response |

The centralized translator must discard raw upstream error bodies. Safe details may include:

- field name;
- repository full name;
- branch name;
- path;
- pull-request number;
- high-level GitHub status reason.

Never include:

- request headers;
- authorization values;
- signed JWTs;
- installation tokens;
- private key material;
- raw Octokit request objects;
- full upstream stack traces.

## 20. Logging and Observability

Safe request logs may contain:

- correlation ID;
- method;
- normalized route;
- status;
- duration;
- owner;
- repository;
- branch;
- path;
- pull-request number;
- resulting commit SHA;
- high-level GitHub error code.

Logs must never contain:

- authorization headers;
- Zoro API keys;
- GitHub tokens or app JWTs;
- private keys;
- complete file content;
- pull-request bodies when they may include sensitive text;
- raw upstream response bodies.

Add event names such as:

```text
github.repository.listed
github.content.read
github.branch.created
github.branch.updated
github.file.created
github.file.updated
github.file.deleted
github.pull_request.created
github.pull_request.updated
github.pull_request.merged
github.request.rejected
github.request.failed
```

## 21. Testing Requirements

### 21.1 Unit tests

Test:

- private-key decoding and environment validation;
- timing-safe bearer-token authentication;
- owner/repository validation;
- branch and ref validation;
- path normalization and traversal rejection;
- `.github/workflows/*` blocking;
- content-size limits;
- commit-message validation;
- GitHub response serialization;
- GitHub error classification;
- optimistic-concurrency checks;
- `force: false` branch updates;
- merge `expectedHeadSha` enforcement.

### 21.2 Integration tests with mocked GitHub service

For every endpoint, test:

- successful request;
- missing bearer token;
- invalid bearer token;
- invalid query or body;
- unknown fields;
- safe response envelope;
- correlation ID presence;
- expected status codes;
- error envelope;
- no MongoDB requirement.

### 21.3 Service tests with mocked Octokit

Test:

- correct GitHub method and argument mapping;
- pagination normalization;
- default branch resolution;
- default-branch file writes;
- file update and deletion SHA forwarding;
- branch update with `force: false`;
- PR merge with expected head SHA;
- raw upstream errors are not exposed.

### 21.4 Regression tests

- existing CRUD suites remain green;
- health behavior remains unchanged;
- existing 10 KB body limit remains enforced for context routes;
- GitHub routes accept the documented larger body limit;
- unsupported methods still return `405` with the correct `Allow` header;
- production route registration includes all GitHub routes.

### 21.5 Required verification commands

```bash
npm test
npm run lint
npm run format:check
```

## 22. Custom GPT Action Requirements

The Action schema must:

- remain OpenAPI 3.1.0;
- preserve all current operations;
- add the 12 GitHub operation IDs listed in this specification;
- use the deployed Context API server URL;
- declare a bearer API-key security scheme;
- apply bearer security to GitHub operations;
- use explicit request objects with `additionalProperties: false`;
- avoid generic arbitrary objects for write operations;
- remain below 30 operations;
- document that direct default-branch writes and file deletions are allowed;
- document that workflow paths, force pushes, administration, and secret operations are denied.

The Action schema is configured in the Custom GPT and is not automatically deployed with the repository. It must be updated in the same release window as the API.

## 23. Deployment Requirements

Before deployment:

1. confirm all five GitHub environment variables exist;
2. confirm the private key is not committed;
3. run tests, lint, and formatting checks;
4. deploy the verified `main` commit;
5. verify the Heroku release and logs;
6. update Zoro's Action schema;
7. configure Zoro's Action authentication as bearer API key;
8. run end-to-end smoke tests.

## 24. End-to-End Smoke Test

Use a disposable text file in a non-critical repository or a dedicated test path.

1. List repositories.
2. Read repository root.
3. List branches.
4. Create a temporary feature branch.
5. Create a UTF-8 file on the branch.
6. Read the file and record its SHA.
7. Update the file using the current SHA.
8. Create a draft pull request.
9. Read the pull request and record its head SHA.
10. Close the pull request without merging.
11. Delete the temporary branch through GitHub UI or a later approved endpoint if branch deletion is added.
12. Independently test a direct default-branch write on a disposable file.
13. Read the created file and record its SHA.
14. Delete the disposable file using the SHA.
15. Confirm `.github/workflows/*` writes return `403`.
16. Confirm missing bearer authentication returns `401`.

Do not use production application files for the first smoke test.

## 25. Rollback

If deployment fails or unsafe behavior is detected:

1. revert the GitHub gateway commit on `main`;
2. redeploy the previous verified release;
3. remove GitHub operations from Zoro's Action schema;
4. rotate `ZORO_GITHUB_API_KEY`;
5. rotate the GitHub App private key when credential exposure is suspected;
6. suspend or uninstall the GitHub App when immediate repository isolation is required;
7. preserve correlation IDs and safe logs for incident review.

## 26. Acceptance Criteria

- Existing Context API operations remain functional and unchanged.
- Every GitHub route requires valid bearer authentication.
- Zoro can list all repositories available to the installation.
- Zoro can read UTF-8 files and directory contents from arbitrary refs.
- Zoro can list, create, and safely fast-forward branches.
- Zoro can create, update, and delete UTF-8 files on feature and default branches.
- Direct writes to `main`, `master`, and repository default branches are permitted when GitHub allows them.
- File updates and deletions require the current blob SHA.
- Zoro can create, read, update, close, reopen, and merge pull requests.
- Pull-request merges require the expected current head SHA.
- `.github/workflows/*` remains blocked by server policy.
- Force pushes and branch-protection bypasses are impossible through the API.
- Repository administration, collaborators, secrets, and Actions administration remain unavailable.
- GitHub failures are translated into safe deterministic errors.
- Tokens, keys, and file contents never appear in logs.
- Unit, integration, and regression tests pass.
- Linting and formatting checks pass.
- The deployed API and Zoro Action pass the documented smoke test.
