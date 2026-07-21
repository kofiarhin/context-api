# Deployment

This document is deployment-oriented and is the only place that names the hosted environment. Keep
reusable API documentation in [`../README.md`](../README.md) host-agnostic.

## Supported HTTP methods

The API supports exactly:

```text
GET, HEAD, OPTIONS, POST, PATCH, DELETE
```

`PUT` and every other verb return `405 Method Not Allowed` with an `Allow` header. `DELETE` is a
soft delete: it sets `status` to `archived` and records `archivedAt`. There is no hard delete and no
separate restore route — restore with `PATCH` by assigning a non-archived status.

The allowlist lives in [`../src/middleware/allowedMethods.js`](../src/middleware/allowedMethods.js)
and is applied unconditionally in [`../src/app.js`](../src/app.js). It is deliberately not
environment-dependent.

> **Regression history:** an earlier release wired a GET-only variant of this guard, which made the
> deployed API read-only while local development kept full CRUD. `tests/integration/productionRouteRegistration.test.js`
> exercises the exported app in production mode so this cannot regress silently again.

## Production start command

```bash
npm start   # -> node src/server.js
```

`Procfile` declares `web: node src/server.js` so the dyno cannot fall back to another entry point.
`src/server.js` connects to MongoDB before binding `process.env.PORT`, so the dyno never accepts
traffic it cannot serve.

## Required configuration

Set these as Heroku config vars. Never commit populated values.

| Variable               | Required | Notes                                            |
| ---------------------- | -------- | ------------------------------------------------ |
| `NODE_ENV`             | yes      | Must be `production`                             |
| `PORT`                 | yes      | Provided by the platform; do not set manually    |
| `MONGODB_URI`          | yes      | Must start with `mongodb://` or `mongodb+srv://` |
| `LOG_LEVEL`            | no       | Defaults to `info`                               |
| `CORS_ORIGINS`         | no       | Comma-separated allowlist; never a wildcard      |
| `RATE_LIMIT_WINDOW_MS` | no       | Defaults to `900000`                             |
| `RATE_LIMIT_MAX`       | no       | Defaults to `100`                                |

Startup fails fast and lists every problem if required variables are missing or malformed.

## Deploying

Heroku deploys the branch you push to its `main`. Deploy only a commit that has passed CI.

```bash
git push heroku main
heroku releases --app <app-name>          # confirm the new release is current
heroku logs --tail --app <app-name>       # confirm "server.listening"
```

To deploy a topic branch, push it explicitly to Heroku's `main`:

```bash
git push heroku <branch>:main
```

## Verifying the deployed CRUD routes

A green build is not proof the dyno is running the code you think it is. After every release, verify
the deployed methods directly. Substitute the deployed base URL for `$BASE`.

```bash
BASE=https://<app-name>.herokuapp.com

# 1. Service is up and reports the expected environment
curl -s "$BASE/health"

# 2. Create
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/v1/tasks" \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"deployment-smoke-test","projectId":"projectos","title":"Verify deployed CRUD","status":"ready","priority":"medium","source":{"type":"user-approved","reference":"deployment verification"}}'
# expect 201

# 3. Read
curl -s "$BASE/api/v1/tasks/deployment-smoke-test"                      # expect 200

# 4. Update
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH "$BASE/api/v1/tasks/deployment-smoke-test" \
  -H 'Content-Type: application/json' -d '{"status":"in-progress"}'     # expect 200

# 5. Soft delete, then repeat it to prove idempotency
curl -s -X DELETE "$BASE/api/v1/tasks/deployment-smoke-test"            # expect 200, status archived
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE "$BASE/api/v1/tasks/deployment-smoke-test"

# 6. Archived records leave the default list but stay reachable
curl -s "$BASE/api/v1/tasks" | grep -c deployment-smoke-test            # expect 0
curl -s "$BASE/api/v1/tasks?status=archived" | grep -c deployment-smoke-test

# 7. PUT stays unsupported
curl -s -i -X PUT "$BASE/api/v1/tasks/deployment-smoke-test" | head -1  # expect 405
```

A `405` on step 2 with `Allow: GET, HEAD, OPTIONS` means the dyno is running a stale release that
predates CRUD support. Confirm with `heroku releases` and redeploy rather than changing code.

The same sequence runs locally against the production entry point via
`tests/integration/productionRouteRegistration.test.js`.

## Keeping the OpenAPI Action schema in sync

> **Warning:** the OpenAPI schema used by the Custom GPT Action is configured in the GPT itself and
> is **not** stored in this repository. Nothing in CI can detect drift between it and the deployed
> API. Whenever a route, method, request body, or field changes here, update the Action schema in the
> same change window, or the assistant will call endpoints that do not exist or omit required fields.

The Action schema must:

- use OpenAPI 3.1.0;
- declare the deployed base URL as its server;
- expose `listTasks`, `getTask`, `createTask`, `updateTask`, and `deleteTask` with unique
  `operationId` values;
- describe request bodies with explicit object properties, not free-form objects;
- use `PATCH` for updates — never `PUT`;
- stay below the Custom GPT Action operation limit (30).

### Task field contract

Tasks accept only these writable fields. Note that tasks have **no `version` field**, unlike most
other domains; sending one returns `400`.

```text
taskId (required, immutable)  title (required)  projectId (required)  description
status: backlog | ready | in-progress | blocked | done | archived
priority: low | medium | high | critical
acceptanceCriteria[]  dependencies[]  tags[]
source: { type, reference } (required)
```

`archivedAt`, `createdAt`, and `updatedAt` are API-managed and rejected on write.
