# Context API

Context API is a Node.js, Express, MongoDB, and Mongoose service for structured context and governed engineering operations used by ChatGPT projects, coding agents, Architect workflows, the Ideas Hub, Zoro, and future applications.

## Current project status

Context API now serves two related roles:

1. **Structured context service** for reusable project, task, instruction, convention, glossary, learning, and Ideas Hub records.
2. **Governed engineering control plane** for closed-catalogue GitHub, Vercel, Heroku, Context API, and operations-log actions used by Zoro.

Verified milestones include:

- authenticated GitHub repository, content, branch, file, pull-request, and merge workflows;
- grouped Vercel read, write, and destructive dispatchers with provider policy enforcement;
- Full Operator mode with non-bypassable redaction, provider/account boundaries, Context API self-protection, destructive controls, and expected-state merge controls;
- Heroku app reads, config-var metadata redaction, health checks, mutation governance, and self-protection;
- a disposable private GitHub repository created, populated, reviewed, and merged through governed operations;
- a disposable Heroku app created and safely renamed without adding paid resources, add-ons, databases, or custom domains;
- a detailed Zoro governed-autonomy architecture specification and phased implementation plan on this branch.

Implemented but not yet live-verified:

- `uploadHerokuSourceArchive`, the governed operation that closes the gap between `createHerokuSource` and `createHerokuBuild` for private GitHub source deployment.

The Heroku blocker is not considered resolved until the exact implementation commit passes the full local verification suite, is deployed to the live Context API app, and succeeds through this bounded chain:

```text
createHerokuSource
→ uploadHerokuSourceArchive
→ createHerokuBuild
→ successful Heroku build
→ live /health 200
→ live /api/message 200
```

The current source-upload capability store is process-memory based. A restart invalidates outstanding capabilities, and multiple web dynos can route consecutive calls to different processes. Use one web dyno for bounded verification until a shared TTL-backed capability store is implemented.

## Unified Zoro engineering Action

The unified endpoint is:

```http
POST /api/v1/zoro/operations/{operationId}
```

It exposes a closed operation catalogue. Callers select a registered dispatcher and operation; they cannot provide arbitrary provider URLs, HTTP methods, or upstream paths.

Current dispatcher families include:

```text
health.check
context.resolve
engineering.read
engineering.write
engineering.archive
github.read
github.write
github.review
github.destructive
vercel.read
vercel.write
vercel.destructive
heroku.execute
opslog.read
opslog.write
```

The catalogue intentionally keeps provider policy in the delegated GitHub, Vercel, and Heroku services. High-level dispatch does not bypass provider allowlists, redaction, approval requirements, expected-state checks, destructive confirmations, billing controls, access controls, or Context API self-protection.

### Operation classifications

Operations are classified as:

```text
read
write
merge
production-sensitive
security-sensitive
billing
access-admin
destructive
```

Merge and higher-risk classifications require explicit governance according to the configured Zoro mode and provider policy. Destructive operations additionally require exact confirmation naming the resource.

### Known autonomy limitations

Current low-level operations are secure but still require too much conversational orchestration. Observed friction has included operation-name guessing, dispatcher guessing, unclear request-body placement, provider naming constraints discovered too late, process-local workflow state, manual polling, and repeated restatement of run resources.

The proposed autonomy architecture addresses this through:

- operation discovery and contract introspection;
- provider-aware workflow preflight;
- persistent resumable Zoro runs;
- shared encrypted TTL-backed provider capabilities;
- bounded automatic remediation;
- high-level GitHub-to-Heroku and GitHub-to-Vercel workflows;
- standard response envelopes and structured errors;
- safe polling, evidence collection, and verification;
- filename case-collision prevention for cross-platform development.

See:

- [`docs/ZORO_AUTONOMY_SPEC.md`](docs/ZORO_AUTONOMY_SPEC.md)
- [`docs/ZORO_AUTONOMY_IMPLEMENTATION_PLAN.md`](docs/ZORO_AUTONOMY_IMPLEMENTATION_PLAN.md)

These documents are proposed architecture only. They do not authorize implementation, merge, deployment, migration, or production rollout.

## Security status

The context routes beneath `/api/v1` are intentionally **public and unauthenticated**. Every caller can read, create, update, archive, and restore records.

Do not store secrets, passwords, access tokens, private keys, private chat history, chain-of-thought, or sensitive personal information. Keep the existing rate limiting, CORS configuration, JSON body limit, schema validation, redaction, and safe logging enabled.

Provider gateways and the unified Zoro Action require bearer authentication and can mutate real external resources. They must never expose or log:

- access tokens;
- private keys;
- authorization headers;
- decrypted configuration values;
- signed upload or download URLs;
- credentials embedded in URLs;
- provider secrets or payment details.

Never run `heroku releases:info` as part of Context API operations or verification because it can expose configuration values. Environment-variable inspection must remain metadata-only.

## Requirements

- Node.js 24.x
- npm
- MongoDB

## Setup

```bash
npm install
cp .env.example .env
```

Example environment:

```env
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/context_api
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

Never commit a populated `.env` file.

## Commands

```bash
npm start
npm run dev
npm test
npm run test:watch
npm run test:coverage
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run generate:heroku-actions
npm run verify:context-read
npm run verify:github-gateway
npm run verify:vercel-gateway
npm run verify:heroku-gateway
npm run verify:engineering-action
npm run verify
npm run seed
npm run seed:reset
```

`npm run verify` is the required local quality gate before deployment. Implementation, local verification, deployment, live smoke verification, and completion are separate evidence states.

## API

Health:

```http
GET /health
```

Profile singleton:

```http
POST   /api/v1/profile
GET    /api/v1/profile
PATCH  /api/v1/profile
DELETE /api/v1/profile
```

Collection domains:

```text
coding-conventions/:key
projects/:projectId
tasks/:taskId
instruction-sets/:key
ideas-hub/:section
glossary/:term
learnings/:learningId
```

Each collection supports:

```http
POST   /api/v1/<domain>
GET    /api/v1/<domain>
GET    /api/v1/<domain>/:identifier
PATCH  /api/v1/<domain>/:identifier
DELETE /api/v1/<domain>/:identifier
```

The bounded resolver is read-only:

```http
GET /api/v1/context/resolve
```

`PUT` is intentionally not part of the simplified MVP. Because updates are partial, `PUT` and any other unsupported verb return `405 Method Not Allowed` with an `Allow` header rather than `404`.

## Optimized context reads

The API supports a hot-path read model without breaking the original page-based contract.

### Existing offset flow

A request with no pagination parameters, or with `page` and `pageSize`, keeps the original behavior:

```http
GET /api/v1/projects?page=1&pageSize=20
```

- detailed records;
- exact `total` and `totalPages`;
- the domain's existing stable sort.

### Cursor flow

Supplying `limit` or `cursor` selects keyset pagination:

```http
GET /api/v1/projects?limit=20
GET /api/v1/projects?limit=20&cursor=<nextCursor>
```

Cursor mode defaults to:

- compact summaries;
- no `countDocuments()` call;
- `hasNextPage` and `nextCursor` metadata;
- the domain's indexed `updatedAt` and stable-identifier sort.

Use these common controls on every collection:

```text
view=summary|detail
includeTotal=true|false
updatedAfter=<ISO-8601 timestamp>
limit=1..100
cursor=<opaque cursor>
```

Do not combine `cursor` or `limit` with `page` or `pageSize`.

### Bounded resolver

Resolve the context needed for one client, project, task, and workflow stage:

```http
GET /api/v1/context/resolve?client=zoro&projectId=context-api&taskId=context-api-health-endpoint&stage=verification&maxItems=8
```

The resolver returns:

- compact profile, project, and task records;
- the latest applicable instruction-set summaries;
- global and matching project coding-convention summaries;
- source references;
- a stable package revision.

It never returns instruction bodies, coding rules, task acceptance criteria, full project architecture, inbox history, logs, or unrelated project context. Fetch a full record only after selecting it from the resolver response.

### Conditional requests

Successful reads include `ETag` and `Cache-Control: private, must-revalidate`.

```http
If-None-Match: W/"<previous response hash>"
```

An unchanged `GET` or `HEAD` returns `304 Not Modified` without a response body.

See [`docs/CONTEXT_READ_MODEL.md`](docs/CONTEXT_READ_MODEL.md) for the complete contract and [`docs/openapi/zoro-context-read-action.yaml`](docs/openapi/zoro-context-read-action.yaml) for the separate read-only Zoro/Architect Action schema.

## Write behavior

- `POST` requires the domain's client-provided stable identifier.
- `POST` returns `201 Created` and never performs an upsert.
- Duplicate identifiers, including identifiers on archived records, return `409`.
- `PATCH` partially updates schema-defined fields.
- Stable identifiers and MongoDB-managed fields are immutable.
- Unknown fields and invalid schema values return `400`.
- `DELETE` is idempotent and performs a soft delete.
- Soft deletion sets `status` to `archived` and records `archivedAt`.
- Restore an archived record with `PATCH` by assigning a valid non-archived status.
- Normal collection reads exclude archived records.
- Use `?status=archived` to list archived records.
- Individual resource reads can inspect archived records so agents can restore them.

## Response status codes

```text
POST    201 Created
GET     200 OK
PATCH   200 OK
DELETE  200 OK

Invalid request       400 Validation Error
Unknown record        404 Not Found
Unsupported method    405 Method Not Allowed
Duplicate identifier  409 Conflict
Database unavailable  503 Service Unavailable
Unexpected failure    500 Internal Server Error
```

## GitHub gateway

`/api/v1/github/*` lets an agent read and write GitHub repositories through a GitHub App installation. It is authenticated separately from public context routes and does not require MongoDB, so a database outage does not take the gateway offline.

### Authentication

Every GitHub route requires:

```http
Authorization: Bearer <ZORO_GITHUB_API_KEY>
```

The token is compared in constant time, is never logged, and is never echoed back. Anything missing, malformed, or incorrect returns `401 AUTHENTICATION_REQUIRED` before any GitHub call is made.

### Configuration

```text
GITHUB_APP_ID              positive integer
GITHUB_INSTALLATION_ID     positive integer
GITHUB_PRIVATE_KEY_BASE64  Base64-encoded PEM, decoded in memory only
GITHUB_REPOSITORY_ACCESS   configured access mode
ZORO_GITHUB_API_KEY        bearer secret, minimum 32 characters
```

Account-level repository creation can use a separately governed fine-grained user token. It must remain distinct from the GitHub App private key and must never be returned by gateway responses.

### Endpoints

```text
GET    /api/v1/github/repositories                       list installation repositories
GET    /api/v1/github/contents                           read a file or list a directory
GET    /api/v1/github/branches                           list branches
POST   /api/v1/github/branches                           create a branch
PATCH  /api/v1/github/branches/:branch                   fast-forward a branch
POST   /api/v1/github/files                              create a UTF-8 file
PATCH  /api/v1/github/files                              replace a UTF-8 file
DELETE /api/v1/github/files                              delete a file
POST   /api/v1/github/pull-requests                      create a pull request
GET    /api/v1/github/pull-requests/:pullNumber          read a pull request
PATCH  /api/v1/github/pull-requests/:pullNumber          update, close, or reopen
POST   /api/v1/github/pull-requests/:pullNumber/merge    merge
```

### Direct default-branch writes

> **Warning:** create, replace, and delete can work directly on `main`, `master`, and repository default branches. A write lands as a real commit immediately.

Branch protection remains authoritative. The gateway never requests a bypass.

### Optimistic concurrency

| Operation             | Required             | On mismatch |
| --------------------- | -------------------- | ----------- |
| replace a file        | current blob `sha`   | `409`       |
| delete a file         | current blob `sha`   | `409`       |
| fast-forward a branch | `expectedCurrentSha` | `409`       |
| merge a pull request  | `expectedHeadSha`    | `409`       |

A `409` is never blindly retried. Re-read the resource, recompute, and resubmit.

### Limits and exclusions

- UTF-8 text only for direct file operations;
- file content limited by gateway policy;
- normalized paths beneath `.github/workflows` are blocked;
- no force pushes or branch-protection bypasses;
- no arbitrary GitHub API passthrough;
- no secret, variable, environment, deploy-key, or Actions administration through the gateway.

## Vercel gateway

The Vercel gateway provides grouped read, write, and destructive dispatchers. It preserves project/account boundaries, production approval, destructive confirmation, secret redaction, and no-secret-return controls.

```http
POST /api/v1/vercel/read
POST /api/v1/vercel/write
POST /api/v1/vercel/destructive
```

Submitting an operation through the wrong dispatcher is rejected.

## Heroku gateway

The Heroku gateway is descriptor-driven and exposes registered operations through `heroku.execute`. It enforces mutation switches, resource allowlists, billing and access controls, destructive confirmation, config-var redaction, and Context API self-protection.

Verified live reads include app listing, app detail, and config-var metadata. Config metadata must contain only names, configured state, sensitivity metadata, and `[REDACTED]` values.

The governed private-source deployment path is designed as:

```text
createHerokuSource
→ uploadHerokuSourceArchive
→ createHerokuBuild
→ getHerokuBuild / bounded polling
→ endpoint verification
```

`uploadHerokuSourceArchive` must never become a generic URL uploader. Its destination is bound to a short-lived opaque capability issued by `createHerokuSource`, and signed URLs must never be returned or logged.

## Deployment and verification status

The latest known merged and live-verified Heroku read fix is merge commit:

```text
ed1f2d153c15fbcd07f35e7b5f1a1d95291cea72
```

The governed source-upload implementation exists on `main` through:

```text
d1501481e59e4036bbfd0daac29147c78ddac04e
```

That source-upload revision is **implemented but not yet claimed as locally verified, deployed, live-smoke verified, or blocker-resolving** in this documentation.

Required evidence before declaring the blocker resolved:

1. clean-checkout `npm run verify` passes;
2. the exact verified SHA is deployed;
3. the live catalogue exposes `uploadHerokuSourceArchive`;
4. no signed URL or config value appears in responses or bounded logs;
5. the private-source archive uploads successfully;
6. the Heroku build succeeds;
7. the disposable app serves the expected health and message endpoints.

## Documentation

- Context read model: [`docs/CONTEXT_READ_MODEL.md`](docs/CONTEXT_READ_MODEL.md)
- Read-only Context Action schema: [`docs/openapi/zoro-context-read-action.yaml`](docs/openapi/zoro-context-read-action.yaml)
- GitHub gateway specification: [`docs/GITHUB_GATEWAY_SPEC.md`](docs/GITHUB_GATEWAY_SPEC.md)
- Custom GPT GitHub/write Action schema: [`docs/openapi/zoro-action.yaml`](docs/openapi/zoro-action.yaml)
- Vercel gateway specification: [`docs/VERCEL_GATEWAY_SPEC.md`](docs/VERCEL_GATEWAY_SPEC.md)
- Vercel Action schemas: [`docs/openapi/zoro-vercel-core-action.yaml`](docs/openapi/zoro-vercel-core-action.yaml) and [`docs/openapi/zoro-vercel-config-action.yaml`](docs/openapi/zoro-vercel-config-action.yaml)
- Deployment and live verification: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Technical specification: [`docs/SPEC.md`](docs/SPEC.md)
- Implementation plan: [`docs/PLAN.md`](docs/PLAN.md)
- Zoro governed-autonomy architecture: [`docs/ZORO_AUTONOMY_SPEC.md`](docs/ZORO_AUTONOMY_SPEC.md)
- Zoro governed-autonomy implementation plan: [`docs/ZORO_AUTONOMY_IMPLEMENTATION_PLAN.md`](docs/ZORO_AUTONOMY_IMPLEMENTATION_PLAN.md)
