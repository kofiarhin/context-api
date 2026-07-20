# Context API — Product Requirements Document

**Version:** 0.2  
**Status:** Approved for CRUD MVP  
**Owner:** Kofi  
**Last updated:** 2026-07-20

## 1. Product Overview

Context API is a centralized persistent-context service for ChatGPT projects, Architect workflows, coding agents, the Ideas Hub, and future applications.

It stores structured user, engineering, project, workflow, glossary, task, and learning context so clients can retrieve and update only the records needed for a task.

## 2. Product Goal

Provide a small, predictable MongoDB-backed API that AI agents can use as shared durable context.

The MVP must support public, unauthenticated create, read, partial update, soft delete, and restore operations for every existing context domain.

## 3. Context Domains

- Profile
- Coding conventions
- Projects
- Tasks
- Instruction sets
- Ideas Hub context
- Glossary entries
- Learnings

## 4. CRUD MVP Scope

The supported operations are:

```text
POST    create
GET     read
PATCH   partial update or restore
DELETE  soft delete
```

`PUT` is not included.

Every collection domain supports a collection route and a stable-identifier route. Profile remains a singleton resource.

## 5. Stable Identifiers

Clients supply stable identifiers when creating records:

| Domain             | Stable identifier |
| ------------------ | ----------------- |
| Profile            | `key`             |
| Coding conventions | `key`             |
| Projects           | `projectId`       |
| Tasks              | `taskId`          |
| Instruction sets   | `key`             |
| Ideas Hub context  | `section`         |
| Glossary entries   | `normalizedKey`   |
| Learnings          | `learningId`      |

Stable identifiers cannot be changed through `PATCH`.

`POST` never behaves as an upsert. An identifier already used by an active or archived record returns `409 Conflict`.

## 6. Soft Deletion

`DELETE` does not permanently remove MongoDB documents.

It sets:

```json
{
  "status": "archived",
  "archivedAt": "2026-07-20T12:00:00.000Z"
}
```

Deletion is idempotent. Deleting an already archived record returns `200` with that archived resource.

Archived records are excluded from normal collection reads. They remain available through `?status=archived` and individual resource reads.

Restore uses the existing `PATCH` endpoint by changing `status` to a valid non-archived value. The API clears `archivedAt` automatically.

## 7. Profile Singleton

Profile supports:

```http
POST   /api/v1/profile
GET    /api/v1/profile
PATCH  /api/v1/profile
DELETE /api/v1/profile
```

Only one non-archived profile may exist. Creating another returns `409 Conflict`.

After archival, the archived profile can be restored using `PATCH`, or a new profile with a different stable key can be created.

## 8. Validation

- Writes accept only fields defined by the domain's current Mongoose schema.
- `POST` requires the stable identifier and all schema-required fields.
- `PATCH` requires at least one valid field.
- Unknown fields return `400`.
- `_id`, `__v`, `createdAt`, `updatedAt`, and `archivedAt` are API-managed and cannot be supplied.
- Nested schema validation remains enforced by Mongoose.
- Existing JSON payload and query-string size limits remain enabled.

## 9. Response Contract

Successful writes return the resulting serialized resource using the existing envelope.

```text
POST    201 Created
GET     200 OK
PATCH   200 OK
DELETE  200 OK
```

Errors:

```text
400  VALIDATION_ERROR
404  RESOURCE_NOT_FOUND or ROUTE_NOT_FOUND
409  RESOURCE_CONFLICT
500  INTERNAL_SERVER_ERROR
503  DATABASE_UNAVAILABLE
```

## 10. Security Posture

The MVP is intentionally public and unauthenticated so AI agents can read and update context without credentials.

Anyone who discovers the API URL can modify or archive records. Therefore:

- never store secrets, credentials, private keys, tokens, chain-of-thought, or sensitive personal context;
- retain rate limiting, CORS configuration, payload limits, safe logging, and explicit serializers;
- treat authentication and authorization as deferred work before storing private or production-sensitive data.

## 11. Out of Scope

- Authentication and authorization
- API keys
- Multi-user ownership
- Role-based access control
- `PUT`
- Permanent deletion
- Dedicated restore endpoints
- Audit history and rollback
- Webhooks
- Management dashboard
- Automatic upserts

## 12. Acceptance Criteria

- Every existing domain supports the approved methods.
- Existing read filters and pagination continue to work.
- Archived records are hidden by default and explicitly queryable.
- Duplicate identifiers return `409`.
- Invalid and unknown fields return `400`.
- Unknown identifiers return `404`.
- Soft delete, idempotent delete, and restore work consistently.
- MongoDB internals remain excluded from responses.
- Jest and Supertest cover representative CRUD behavior across every domain.
- Linting, formatting, and tests pass before deployment.
