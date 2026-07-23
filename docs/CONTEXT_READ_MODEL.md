# Context API Read Model

**Status:** Implemented on `main`  
**Last updated:** 2026-07-23

## Purpose

The read model keeps durable context available without forcing agents to retrieve full records, total counts, unrelated pages, or every applicable instruction on each request.

It adds four compatible capabilities:

1. compact summary representations;
2. cursor pagination without large MongoDB offsets;
3. optional totals and delta filters;
4. one bounded context resolver endpoint.

Existing page-based clients remain supported.

## Collection read modes

All collection routes support the same read controls:

```text
GET /api/v1/<domain>
```

### Legacy offset mode

Offset mode is selected when the request uses `page` or `pageSize`, or when it supplies no pagination parameters.

```http
GET /api/v1/projects?page=1&pageSize=20
```

Defaults:

- representation: `detail`;
- total count: included;
- pagination: `page` and `pageSize`;
- sort: the domain's established stable sort.

This preserves the original API contract.

### Cursor mode

Cursor mode is selected when the request uses `limit` or `cursor`.

```http
GET /api/v1/projects?limit=20
```

Defaults:

- representation: `summary`;
- total count: omitted;
- pagination: `updatedAt` and MongoDB `_id` keyset cursor;
- maximum limit: `100`.

Example response metadata:

```json
{
  "count": 20,
  "limit": 20,
  "hasNextPage": true,
  "nextCursor": "eyJ1cGRhdGVkQXQiOiIuLi4iLCJpZCI6Ii4uLiJ9",
  "version": "v1"
}
```

Fetch the next page by returning the cursor unchanged:

```http
GET /api/v1/projects?limit=20&cursor=<nextCursor>
```

Do not combine `cursor` or `limit` with `page` or `pageSize`.

## Representation control

Use:

```text
view=summary | detail
```

`summary` omits the largest nested fields, including project milestones and architecture details, task acceptance criteria, coding-convention rules, instruction bodies, Ideas Hub governance arrays, and learning evidence/content.

Single-resource endpoints continue returning full records.

Examples:

```http
GET /api/v1/instruction-sets?limit=10
GET /api/v1/instruction-sets?limit=10&view=detail
GET /api/v1/projects?page=1&pageSize=20&view=summary
```

## Optional totals

Cursor requests avoid `countDocuments()` by default.

Use this only when a consumer needs an exact total:

```http
GET /api/v1/tasks?limit=20&includeTotal=true
```

Offset requests retain totals by default. They may skip the count explicitly:

```http
GET /api/v1/tasks?page=1&pageSize=20&includeTotal=false
```

## Delta reads

Every collection accepts an ISO-8601 lower bound:

```http
GET /api/v1/tasks?limit=20&updatedAfter=2026-07-23T12:00:00.000Z
```

Only records whose `updatedAt` is later than the supplied value are returned. Delta filtering composes with domain filters, cursor pagination, summary/detail views, and optional totals.

## Conditional requests

Successful resource and collection responses include:

```http
ETag: W/"<response-hash>"
Cache-Control: private, must-revalidate
```

A client can avoid downloading an unchanged payload:

```http
If-None-Match: W/"<response-hash>"
```

An unchanged `GET` or `HEAD` returns `304 Not Modified` with no response body.

## Context resolver

The resolver returns one bounded task-oriented context package:

```http
GET /api/v1/context/resolve
  ?client=zoro
  &projectId=context-api
  &taskId=context-api-health-endpoint
  &stage=verification
  &maxItems=8
```

### Query parameters

| Parameter | Required | Meaning |
| --- | --- | --- |
| `client` | yes | Agent or application identifier used to select instruction sets |
| `projectId` | no | Stable project identifier |
| `taskId` | no | Stable task identifier |
| `stage` | no | Workflow stage used to select instructions |
| `maxItems` | no | Maximum instruction sets and conventions, `1` to `20`, default `8` |
| `updatedAfter` | no | Optional delta bound for instruction sets and conventions |

When both a project and task are supplied, the task must belong to that project.

### Resolver response

```json
{
  "data": {
    "resolvedFor": {
      "client": "zoro",
      "projectId": "context-api",
      "taskId": "context-api-health-endpoint",
      "workflowStage": "verification",
      "updatedAfter": null,
      "maxItems": 8
    },
    "revision": "<stable package hash>",
    "profile": {},
    "project": {},
    "task": {},
    "instructionSets": [],
    "codingConventions": [],
    "references": []
  },
  "meta": {
    "version": "v1"
  }
}
```

The resolver returns summaries only. It does not return instruction bodies, coding rules, acceptance criteria, project architecture details, raw repository files, logs, inbox history, or unrelated projects.

Use individual resource endpoints only when a selected summary proves that full detail is required.

## Recommended agent flow

```text
Load compact runtime instructions
  -> resolve project/task identity
  -> GET /api/v1/context/resolve
  -> inspect summary references
  -> fetch only selected full records
  -> fetch repository evidence only when required
```

For broad collection traversal:

```text
GET collection?limit=20
  -> process summaries
  -> follow nextCursor
  -> request detail only for selected IDs
  -> retain ETag and revision for later checks
```

## Compatibility and limits

- Existing filters remain unchanged.
- Existing page-based responses remain detailed and counted by default.
- `PUT` remains unsupported.
- Writes and soft-delete behavior are unchanged.
- Cursor values are opaque and must not be edited.
- A malformed or unsupported cursor returns `400 VALIDATION_ERROR`.
- Archived records remain excluded unless `status=archived` is requested.
- The context routes remain public and unauthenticated; do not store sensitive data.
