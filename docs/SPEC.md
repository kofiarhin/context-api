# Context API — Technical Specification

**Version:** 0.2  
**Status:** Approved for CRUD MVP implementation  
**Source:** `docs/PRD.md`  
**Last updated:** 2026-07-20

## 1. Architecture

The service uses Node.js, Express, MongoDB, Mongoose, Jest, and Supertest.

```text
src/
  app.js
  config/
  controllers/
  middleware/
  models/
  routes/v1/
  serializers/
  services/
  validation/
  utils/
tests/
```

Responsibilities remain layered:

- Routes map methods and paths.
- Middleware validates queries, identifiers, and request bodies.
- Controllers translate HTTP requests into service calls and responses.
- Services contain CRUD and retrieval rules.
- Models enforce schema and index constraints.
- Serializers expose explicit response allowlists.
- Centralized error middleware maps operational failures to safe envelopes.

## 2. Public API

Base path: `/api/v1`

### Profile

```http
POST   /profile
GET    /profile
PATCH  /profile
DELETE /profile
```

### Collection domains

```text
/coding-conventions/:key
/projects/:projectId
/tasks/:taskId
/instruction-sets/:key
/ideas-hub/:section
/glossary/:term
/learnings/:learningId
```

Each collection supports:

```http
POST   /<domain>
GET    /<domain>
GET    /<domain>/:identifier
PATCH  /<domain>/:identifier
DELETE /<domain>/:identifier
```

`PUT` is not registered.

## 3. Request Validation

Write bodies must be JSON objects.

### Create

- Stable identifier is required.
- Identifier uses the existing public identifier format and maximum length.
- Unknown top-level and nested fields are rejected.
- API-managed fields are rejected.
- Mongoose required-field, enum, length, and custom validation runs before persistence.

### Patch

- At least one field is required.
- Stable identifier is immutable.
- API-managed fields are immutable.
- Partial schema validation runs against the hydrated document before saving.

Managed fields:

```text
_id
__v
createdAt
updatedAt
archivedAt
```

## 4. CRUD Service Rules

Domain configuration maps each domain to:

- Mongoose model
- stable identifier field
- serializer
- display label
- optional identifier normalizer
- optional lookup sort
- singleton behavior

### Create

1. Normalize and check the stable identifier.
2. Reject any existing active or archived identifier with `409`.
3. Enforce profile singleton behavior.
4. Construct the document with strict schema mode.
5. Save and return the serialized document with `201`.

### Patch

1. Locate the resource by stable identifier.
2. Apply allowed fields using strict schema mode.
3. When status becomes `archived`, set `archivedAt`.
4. When status becomes non-archived, clear `archivedAt`.
5. Validate, save, serialize, and return `200`.

### Delete

1. Locate the resource, including archived records.
2. If active, set `status: archived` and `archivedAt`.
3. If already archived, preserve the record and return it.
4. Return `404` only when no matching identifier exists.

## 5. Collection Visibility

The shared pagination helper adds:

```js
{
  status: {
    $ne: 'archived';
  }
}
```

when the caller did not explicitly provide a status filter.

An explicit `status` filter is preserved, allowing:

```http
GET /api/v1/projects?status=archived
```

Single-resource lookups do not apply the collection exclusion rule.

Instruction-set reads preserve published-version precedence. When no published version exists, the latest stored version is returned so an archived record remains inspectable and restorable.

## 6. Profile Behavior

- Create rejects another non-archived profile.
- Read returns the existing active or approved profile using the established precedence logic.
- Patch and delete target the current non-archived profile.
- When no non-archived profile exists, patch and delete target the most recently updated archived profile so it can be restored or deleted idempotently.

## 7. Models and Serialization

All mutable domains expose `archivedAt` as an ISO-8601 timestamp or `null`.

Serializers continue to exclude:

```text
_id
__v
internal migration fields
raw database errors
environment configuration
```

## 8. Error Mapping

Minimum error mappings:

| Condition                                        | HTTP | Code                    |
| ------------------------------------------------ | ---: | ----------------------- |
| Invalid body, query, identifier, or schema value |  400 | `VALIDATION_ERROR`      |
| Unknown record                                   |  404 | `RESOURCE_NOT_FOUND`    |
| Unknown route or unsupported method path         |  404 | `ROUTE_NOT_FOUND`       |
| Duplicate identifier or unique field             |  409 | `RESOURCE_CONFLICT`     |
| Database unavailable                             |  503 | `DATABASE_UNAVAILABLE`  |
| Unexpected failure                               |  500 | `INTERNAL_SERVER_ERROR` |

MongoDB duplicate-key errors are translated without returning raw driver messages.

## 9. Security and Operations

The API is intentionally unauthenticated and publicly writable.

Required protections that remain enabled:

- Helmet security headers
- CORS allowlist behavior
- rate limiting
- 10 KB JSON body limit
- bounded query strings and pagination
- correlation IDs
- safe structured logging
- startup environment validation
- database availability checks

No sensitive or secret material may be stored.

## 10. Verification

Required automated verification:

- existing read endpoint suites remain green;
- representative create, patch, delete, archived read, idempotent delete, and restore behavior is tested for every domain;
- duplicate, immutable, managed, unknown, empty, and missing-identifier bodies are tested;
- unknown patch and delete targets return `404`;
- serializers never expose MongoDB internals;
- `npm test`, `npm run lint`, and `npm run format:check` pass.
