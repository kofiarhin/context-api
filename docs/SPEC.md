# Context API — Technical Specification

**Version:** 0.1  
**Status:** Proposed for MVP implementation  
**Source:** `docs/PRD.md`  
**Last updated:** 2026-07-19

## 1. Purpose

Context API is a lightweight, read-oriented REST API for durable structured context used by ChatGPT projects, coding agents, Architect workflows, the Ideas Hub, and future applications.

The service replaces large duplicated instruction blocks with domain-specific JSON resources. Clients request only the context needed for the current task.

## 2. MVP Scope

The MVP includes:

- Node.js and Express application
- MongoDB persistence through Mongoose
- Versioned JSON API under `/api/v1`
- Read endpoints for all defined context domains
- Query and route validation
- Consistent success and error envelopes
- Deterministic seed data
- Health reporting for application and database state
- Request correlation IDs and safe logging
- Jest and Supertest coverage

The MVP excludes:

- authentication and authorization
- write endpoints
- multi-user support
- semantic or vector search
- automatic learning ingestion
- dashboards
- audit history
- application-managed encryption
- production-grade private data storage

All stored MVP data must be treated as potentially publicly readable.

## 3. Technology Stack

- Node.js
- Express
- MongoDB
- Mongoose
- Jest
- Supertest
- ESLint
- Prettier

Additional libraries may be used only for small, focused concerns such as validation, security headers, rate limiting, request logging, and environment validation. Avoid introducing frameworks or architectural layers not required by this specification.

## 4. Architecture

Use a modular layered structure:

```text
src/
  app.js
  server.js
  config/
    env.js
    database.js
  controllers/
  middleware/
  models/
  routes/
    v1/
  services/
  validation/
  serializers/
  utils/
  seeds/
tests/
  integration/
  unit/
docs/
```

Responsibilities:

- **Routes:** map HTTP methods and paths to middleware and controllers.
- **Validation:** parse and validate route and query inputs.
- **Controllers:** translate HTTP requests into service calls and send responses.
- **Services:** contain domain retrieval and precedence logic.
- **Models:** define Mongoose schemas and indexes.
- **Serializers:** expose approved response fields and hide database internals.
- **Middleware:** correlation IDs, logging, errors, not-found handling, CORS, and rate limiting.
- **Config:** environment parsing and database setup.

Controllers must not contain database queries or business rules.

## 5. Runtime Configuration

Required environment variables:

- `NODE_ENV`
- `PORT`
- `MONGODB_URI`

Optional variables:

- `LOG_LEVEL`
- `CORS_ORIGINS`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

Configuration must be validated during startup. The application must fail fast with a clear non-secret error when required configuration is missing.

Provide `.env.example` with placeholder values only.

## 6. API Conventions

### 6.1 Base paths

- Health: `/health`
- Versioned API: `/api/v1`

Unknown API versions return `404` using the standard error envelope.

### 6.2 Content type

All successful and failed API responses use JSON.

### 6.3 Success envelopes

Collection:

```json
{
  "data": [],
  "meta": {
    "count": 0,
    "version": "v1"
  }
}
```

Single resource:

```json
{
  "data": {},
  "meta": {
    "version": "v1"
  }
}
```

Collection metadata may also include pagination fields when pagination is enabled:

```json
{
  "count": 20,
  "total": 74,
  "page": 1,
  "pageSize": 20,
  "totalPages": 4,
  "version": "v1"
}
```

### 6.4 Error envelope

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found.",
    "details": []
  },
  "meta": {
    "correlationId": "generated-id",
    "version": "v1"
  }
}
```

`details` is optional and must not include stack traces, secrets, connection strings, or raw database errors.

### 6.5 Error codes

Minimum supported codes:

- `VALIDATION_ERROR`
- `RESOURCE_NOT_FOUND`
- `ROUTE_NOT_FOUND`
- `DATABASE_UNAVAILABLE`
- `INTERNAL_SERVER_ERROR`

### 6.6 Query behavior

- Unknown query parameters should be rejected for deterministic behavior.
- Invalid enums, dates, IDs, page values, and page sizes return `400`.
- Default pagination: page `1`, page size `20`.
- Maximum page size: `100`.
- Default sort: most recently updated first, then stable key ascending.
- Empty collections return `200` with `data: []`.

## 7. Shared Data Rules

All mutable records should use Mongoose timestamps and expose ISO-8601 timestamps.

Shared fields where applicable:

```text
_id
key or slug
name or title
description or content
scope
tags[]
source
status
version
createdAt
updatedAt
```

Rules:

- Stable machine-readable identifiers must be unique where the domain requires them.
- Human-readable labels must not be used as references when a stable key or ID exists.
- MongoDB internals such as `__v` must not appear in API responses.
- Assumptions must remain explicitly identified as assumptions.
- Secrets, passwords, private keys, access tokens, raw chat history, and chain-of-thought must not be stored.
- Archived or superseded records remain distinguishable from active records.

Suggested shared enums:

- `status`: `draft`, `approved`, `active`, `superseded`, `archived`
- `scope`: `global`, `project`
- `source.type`: `user-approved`, `ideas-hub`, `repository`, `system-generated`

Suggested source object:

```json
{
  "type": "repository",
  "reference": "kofiarhin/context-api/docs/PRD.md"
}
```

## 8. Domain Models

### 8.1 Profile

One active profile is expected for the MVP.

Fields:

- `key`: unique stable key, default `primary`
- `displayName`
- `professionalRoles[]`
- `preferredStack[]`
- `responsePreferences[]`
- `testingPreferences[]`
- `architecturePreferences[]`
- `communicationPreferences[]`
- shared metadata fields

Indexes:

- unique `key`
- `status`

### 8.2 Coding Convention

Fields:

- `key`: unique convention identifier
- `title`
- `description`
- `rules[]`
- `scope`
- `technology[]`
- `layer[]`
- `projectId` or project slug when project-scoped
- `priority`
- shared metadata fields

Indexes:

- unique `key`
- compound indexes supporting `scope`, `technology`, `layer`, and `projectId`

Conflict precedence:

1. project-scoped over global
2. approved or active over draft
3. higher explicit priority
4. higher semantic or numeric version
5. latest `updatedAt`

The API may return all matching records in MVP. Any resolved or merged representation must be explicit rather than silently discarding conflicts.

### 8.3 Project

Fields:

- `projectId`: stable unique identifier
- `slug`: unique human-readable key
- `name`
- `summary`
- `lifecycleState`
- `repositoryUrl`
- `liveUrl`
- `technologyStack[]`
- `currentFocus`
- `milestones[]`
- `architectureSummary`
- `relatedContextReferences[]`
- shared metadata fields

Indexes:

- unique `projectId`
- unique `slug`
- `lifecycleState`
- `technologyStack`
- `updatedAt`

The Ideas Hub remains the narrative source of truth. This model exposes normalized project context and must retain source traceability.

### 8.4 Task

Fields:

- `taskId`: unique stable identifier
- `title`
- `description`
- `projectId`
- `status`
- `priority`
- `acceptanceCriteria[]`
- `dependencies[]`
- `source`
- timestamps

Indexes:

- unique `taskId`
- compound `projectId`, `status`, `priority`

Task support is read-oriented and must not evolve into a general project-management feature during MVP implementation.

### 8.5 Instruction Set

Fields:

- `key`: unique stable identifier
- `title`
- `description`
- `instructions[]` or structured `content`
- `workflowStage`
- `applicableClients[]`
- `version`
- `status`
- shared metadata fields

Indexes:

- unique compound `key`, `version`
- `status`
- `workflowStage`

A single-record request by key returns the highest approved or active version unless a version filter is explicitly supported later.

### 8.6 Ideas Hub Context

Fields:

- `section`: unique stable section key
- `title`
- `description`
- `canonicalFiles[]`
- `repositoryLayout`
- `lifecycleDefinitions[]`
- `workflowDefinitions[]`
- `sourceOfTruthRules[]`
- `recordRelationships[]`
- `updateRoutingRules[]`
- shared metadata fields

Indexes:

- unique `section`
- `status`

### 8.7 Glossary Entry

Fields:

- `term`
- `normalizedKey`: unique lowercase normalized key
- `definition`
- `aliases[]`
- `scope`
- `relatedTerms[]`
- `source`
- shared metadata fields

Indexes:

- unique `normalizedKey`
- aliases index
- `scope`

Duplicate aliases across active entries must be rejected by seed validation. Requests by term match normalized key first and then aliases.

### 8.8 Learning

Fields:

- `learningId`: unique stable identifier
- `title`
- `content`
- `category`
- `projectId`
- `evidence[]`
- `reviewStatus`
- `supersedes`
- shared metadata fields

Indexes:

- unique `learningId`
- compound `category`, `projectId`, `status`

Only reviewed durable learnings should be marked approved or active. Unverified observations must remain draft or be excluded.

## 9. Endpoint Specification

### 9.1 Health

#### `GET /health`

Returns:

```json
{
  "data": {
    "status": "ok",
    "database": "connected",
    "environment": "development",
    "timestamp": "2026-07-19T00:00:00.000Z"
  }
}
```

- `200` when application and database are healthy.
- `503` when the application is running but the database is unavailable.
- Must not expose hostnames, credentials, or connection strings.

### 9.2 Profile

#### `GET /api/v1/profile`

Returns the active primary profile.

- `200` with profile
- `404` when no active profile exists

### 9.3 Coding Conventions

#### `GET /api/v1/coding-conventions`

Filters:

- `scope`
- `technology`
- `layer`
- `project`
- `status`
- pagination parameters

#### `GET /api/v1/coding-conventions/:key`

Returns one convention by exact key.

### 9.4 Projects

#### `GET /api/v1/projects`

Filters:

- `status`
- `technology`
- `updatedAfter`
- pagination parameters

#### `GET /api/v1/projects/:projectId`

Matches exact `projectId`; optional slug fallback should not be added unless documented.

### 9.5 Tasks

#### `GET /api/v1/tasks`

Filters:

- `projectId`
- `status`
- `priority`
- pagination parameters

#### `GET /api/v1/tasks/:taskId`

Returns one task by stable task ID.

### 9.6 Instruction Sets

#### `GET /api/v1/instruction-sets`

Filters:

- `status`
- `workflowStage`
- `client`
- pagination parameters

#### `GET /api/v1/instruction-sets/:key`

Returns the active or approved instruction set for the key.

### 9.7 Ideas Hub

#### `GET /api/v1/ideas-hub`

Returns all active sections.

#### `GET /api/v1/ideas-hub/:section`

Returns one section by stable section key.

### 9.8 Glossary

#### `GET /api/v1/glossary`

Filters:

- `query`: case-insensitive term, alias, or definition search
- `scope`
- pagination parameters

#### `GET /api/v1/glossary/:term`

Normalizes the supplied term and resolves exact key first, then alias.

### 9.9 Learnings

#### `GET /api/v1/learnings`

Filters:

- `category`
- `projectId`
- `status`
- pagination parameters

#### `GET /api/v1/learnings/:learningId`

Returns one learning by stable ID.

## 10. Validation

Validation must cover:

- route identifier format and maximum length
- supported enum values
- ISO-8601 date filters
- pagination integers and limits
- maximum query-string lengths
- unsupported query parameters

Validation occurs before controllers. Validation failures return `400` and use `VALIDATION_ERROR`.

Database object IDs must only be accepted on endpoints that explicitly use them. Stable domain identifiers should otherwise be validated as slugs or keys.

## 11. Serialization

Each domain must have an explicit serializer or projection. Responses must exclude:

- `__v`
- internal migration fields
- unapproved private fields
- raw database errors
- environment configuration

The API should use lean Mongoose queries where practical and then serialize through an allowlist.

## 12. Seed Data

Provide a deterministic seed command, for example `npm run seed`.

Requirements:

- safe to rerun
- upserts by stable key or ID
- no random identifiers for canonical records
- validates all seed records before writes
- reports inserted, updated, unchanged, and failed counts
- exits non-zero on partial failure
- never drops collections unless an explicit reset command is used

Representative seed data must include every domain and enough records to test filtering, scoping, aliases, project references, and precedence.

## 13. Logging and Observability

Every request should have a correlation ID. Accept a valid incoming ID or generate one.

Log:

- correlation ID
- method
- route template where available
- response status
- request duration
- validation failures
- database connection state changes

Do not log full context response bodies, secrets, tokens, authorization headers, cookies, or MongoDB connection strings.

## 14. Security Controls for MVP

Even without authentication:

- use secure HTTP headers
- configure CORS using an explicit allowlist
- apply basic rate limiting when internet-accessible
- cap request and query sizes
- expose read routes only
- reject unsupported methods
- avoid sensitive context records
- keep secrets in environment variables

The README and deployment documentation must state that authentication is required before storing private data or exposing the service publicly.

## 15. Database Failure Behavior

- Startup should attempt to connect before accepting traffic.
- If initial connection fails, startup should exit non-zero.
- Runtime disconnection should make `/health` return `503`.
- Domain requests during database unavailability should return `503` with `DATABASE_UNAVAILABLE`.
- Database errors must be logged safely and translated by centralized error middleware.

## 16. Testing Specification

### Unit tests

Cover:

- validation schemas
- service filters
- precedence selection
- serializers
- error translation
- seed validation

### Integration tests

Cover every endpoint for:

- success
- empty collection
- single-resource retrieval
- missing resource
- invalid route parameter
- invalid query parameter
- filter combinations
- response-envelope consistency
- exclusion of internal fields
- database/service failure

Health tests must cover both connected and unavailable database states.

Seed tests must verify stable IDs, required domain coverage, unique keys, valid project references, and glossary alias uniqueness.

## 17. Performance Boundaries

The MVP is optimized for correctness and maintainability rather than high scale.

Minimum safeguards:

- pagination for all potentially growing collections
- database indexes for documented filters
- lean read queries
- bounded query and page sizes
- no unbounded population of relationships
- no endpoint returning all domains in one payload

A target for normal local collection requests is sub-500 ms excluding cold starts and external hosting latency. This is a validation target, not a formal service-level agreement.

## 18. Compatibility Rules

- Existing `/api/v1` response shapes must remain backwards compatible within v1.
- New optional fields may be added when they do not change existing meaning.
- Renaming or removing fields requires a new API version.
- Instruction-set versions must not silently change older stored records.
- Source-of-truth discrepancies must be surfaced rather than silently reconciled.

## 19. Acceptance Criteria

The technical implementation is acceptable when:

- the service starts locally from documented commands
- MongoDB connection state is handled safely
- every PRD endpoint is implemented under `/api/v1`
- every collection supports documented filtering and bounded pagination
- all responses use the specified envelopes
- validation occurs before controller execution
- all database results are serialized through approved fields
- deterministic seeds populate every domain
- tests cover success and primary failure paths
- linting and tests pass
- no secrets or private context are committed
- unauthenticated limitations are clearly documented
- a sample client retrieves domains independently
