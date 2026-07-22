# Context API

Context API is a Node.js, Express, MongoDB, and Mongoose service for structured context used by ChatGPT projects, coding agents, Architect workflows, the Ideas Hub, and future applications.

## Security status

The context routes beneath `/api/v1` are intentionally **public and unauthenticated**. Every caller can read, create, update, archive, and restore records.

Do not store secrets, passwords, access tokens, private keys, private chat history, chain-of-thought, or sensitive personal information. Keep the existing rate limiting, CORS configuration, JSON body limit, schema validation, and safe logging enabled.

The GitHub gateway beneath `/api/v1/github` is the exception: it **requires a bearer API key** and can write to real repositories. See [GitHub gateway](#github-gateway).

## Requirements

- Node.js 20.19 or newer
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
npm run seed
npm run seed:reset
```

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

`PUT` is intentionally not part of the simplified MVP. Because updates are partial, `PUT` and any
other unsupported verb return `405 Method Not Allowed` with an `Allow` header rather than `404`.

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

Example:

```bash
curl -X POST http://localhost:4000/api/v1/projects \
  -H 'Content-Type: application/json' \
  -d '{
    "projectId": "context-api",
    "slug": "context-api",
    "name": "Context API",
    "status": "active",
    "source": {
      "type": "user-approved",
      "reference": "kofiarhin/context-api"
    }
  }'
```

```bash
curl -X PATCH http://localhost:4000/api/v1/projects/context-api \
  -H 'Content-Type: application/json' \
  -d '{"currentFocus":"Integrate agent context writes"}'
```

```bash
curl -X DELETE http://localhost:4000/api/v1/projects/context-api
```

```bash
curl -X PATCH http://localhost:4000/api/v1/projects/context-api \
  -H 'Content-Type: application/json' \
  -d '{"status":"active"}'
```

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

`/api/v1/github/*` lets an agent read and write GitHub repositories through a GitHub App
installation. It is authenticated separately from the rest of the API and does not require MongoDB —
a database outage leaves these routes working.

### Authentication

Every GitHub route requires:

```http
Authorization: Bearer <ZORO_GITHUB_API_KEY>
```

The token is compared in constant time, is never logged, and is never echoed back. Anything missing,
malformed, or incorrect returns `401 AUTHENTICATION_REQUIRED` before any GitHub call is made.

### Configuration

All five variables are required in production and validated at startup. Setting any one of them
locally causes all of them to be validated, so a typo fails immediately rather than on first request.

```text
GITHUB_APP_ID              positive integer
GITHUB_INSTALLATION_ID     positive integer
GITHUB_PRIVATE_KEY_BASE64  Base64-encoded PEM, decoded in memory only
GITHUB_REPOSITORY_ACCESS   all
ZORO_GITHUB_API_KEY        bearer secret, minimum 32 characters
```

Validation errors name the offending variable and never include its value.

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

Read a file, then replace it using the SHA the read returned:

```bash
curl -s "$BASE/api/v1/github/contents?owner=kofiarhin&repo=context-api&path=docs/example.md" \
  -H "Authorization: Bearer $ZORO_GITHUB_API_KEY"

curl -s -X PATCH "$BASE/api/v1/github/files" \
  -H "Authorization: Bearer $ZORO_GITHUB_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
        "owner": "kofiarhin",
        "repo": "context-api",
        "branch": "main",
        "path": "docs/example.md",
        "sha": "<sha from the read>",
        "content": "# Updated\n",
        "message": "docs: update example"
      }'
```

### Direct default-branch writes

> **Warning:** create, replace, and delete work directly on `main`, `master`, and any repository
> default branch. There is no staging step. A write lands as a real commit immediately.

Branch protection stays authoritative — the gateway never requests a bypass — so a protected branch
still rejects the write with `403`.

### Optimistic concurrency

Destructive operations require the caller to state what they expect to be true:

| Operation             | Required             | On mismatch |
| --------------------- | -------------------- | ----------- |
| replace a file        | current blob `sha`   | `409`       |
| delete a file         | current blob `sha`   | `409`       |
| fast-forward a branch | `expectedCurrentSha` | `409`       |
| merge a pull request  | `expectedHeadSha`    | `409`       |

A `409` is never retried automatically. Re-read the resource, recompute, and resubmit.

### Limits

- UTF-8 text only; binary content returns `415`
- file content: 250,000 characters
- request body: 512 KB for GitHub routes (context routes keep their 10 KB limit)
- commit messages: 250 characters

### Not available

Paths at or beneath `.github/workflows` are blocked by server policy for create, update, and delete,
case-insensitively and after path normalization, so traversal cannot reach them. Also unavailable:
force pushes, non-fast-forward branch updates, branch-protection bypasses, repository administration,
repository creation or deletion, collaborator and team management, secrets, variables, deploy keys,
environments, GitHub Actions administration, binary writes, and arbitrary GitHub API passthrough.

### GitHub error codes

```text
AUTHENTICATION_REQUIRED  401  missing or invalid bearer token
GITHUB_FORBIDDEN         403  GitHub or server policy denied the operation
GITHUB_NOT_FOUND         404  repository, ref, file, branch, or pull request not found
GITHUB_CONFLICT          409  stale SHA, existing resource, or state conflict
UNSUPPORTED_CONTENT      415  binary or otherwise unsupported content
GITHUB_VALIDATION_ERROR  422  GitHub rejected the operation as invalid
GITHUB_UNAVAILABLE       502  GitHub unavailable or unexpected upstream response
```

## Documentation

- GitHub gateway specification: [`docs/GITHUB_GATEWAY_SPEC.md`](docs/GITHUB_GATEWAY_SPEC.md)
- Custom GPT Action schema: [`docs/openapi/zoro-action.yaml`](docs/openapi/zoro-action.yaml)
- Deployment and live verification: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Technical specification: [`docs/SPEC.md`](docs/SPEC.md)
- Implementation plan: [`docs/PLAN.md`](docs/PLAN.md)
