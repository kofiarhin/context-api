# Context API

Context API is a Node.js, Express, MongoDB, and Mongoose service for structured context used by ChatGPT projects, coding agents, Architect workflows, the Ideas Hub, and future applications.

## Security status

This MVP is intentionally **public and unauthenticated**. Every caller can read, create, update, archive, and restore records.

Do not store secrets, passwords, access tokens, private keys, private chat history, chain-of-thought, or sensitive personal information. Keep the existing rate limiting, CORS configuration, JSON body limit, schema validation, and safe logging enabled.

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

`PUT` is intentionally not part of the simplified MVP.

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
Duplicate identifier  409 Conflict
Database unavailable  503 Service Unavailable
Unexpected failure    500 Internal Server Error
```

## Documentation

- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Technical specification: [`docs/SPEC.md`](docs/SPEC.md)
- Implementation plan: [`docs/PLAN.md`](docs/PLAN.md)
