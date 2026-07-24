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

### GitHub gateway configuration

All five are **required in production**. Startup fails if any is missing or malformed.

| Variable                    | Required | Notes                                              |
| --------------------------- | -------- | -------------------------------------------------- |
| `GITHUB_APP_ID`             | yes      | Positive integer from the GitHub App settings page |
| `GITHUB_INSTALLATION_ID`    | yes      | Positive integer from the installation URL         |
| `GITHUB_PRIVATE_KEY_BASE64` | yes      | Base64-encoded PEM; decoded in memory only         |
| `GITHUB_REPOSITORY_ACCESS`  | yes      | Only `all` is supported                            |
| `ZORO_GITHUB_API_KEY`       | yes      | Bearer secret, minimum 32 characters               |

Encode the private key without line wrapping, and set it without it entering shell history:

```bash
base64 -w0 your-app.private-key.pem > key.b64
heroku config:set GITHUB_PRIVATE_KEY_BASE64="$(cat key.b64)" --app <app-name>
shred -u key.b64 your-app.private-key.pem   # or delete securely
```

Generate the bearer secret with `openssl rand -hex 32`. It must match the value configured in the
Custom GPT Action authentication panel.

Confirm the variables exist **without printing their values**:

```bash
heroku config --app <app-name> | cut -d: -f1     # names only
heroku config:get GITHUB_REPOSITORY_ACCESS --app <app-name>   # safe: expect "all"
```

Never run `heroku config:get GITHUB_PRIVATE_KEY_BASE64` or `heroku config:get ZORO_GITHUB_API_KEY`.

The GitHub App installation needs exactly these repository permissions: metadata read, contents read
and write, pull requests read and write. Nothing broader.

> **Dependency note:** the gateway requires the `octokit` package. It is declared in `package.json`,
> but `package-lock.json` must be regenerated with `npm install octokit` in an environment that can
> reach the npm registry before deploying, or `npm ci` will fail on the lockfile mismatch.

Startup fails fast and lists every problem if required variables are missing or malformed.

### Vercel gateway configuration

Set these Heroku config vars for the Vercel gateway. Never commit populated values, paste them into
docs, or print them in terminal output.

| Variable                              | Required | Notes                                     |
| ------------------------------------- | -------- | ----------------------------------------- |
| `VERCEL_TOKEN`                        | yes      | Server-side upstream Vercel bearer token  |
| `ZORO_VERCEL_API_KEY`                 | yes      | Gateway bearer secret, minimum 32 chars   |
| `VERCEL_TEAM_ID`                      | no       | Team scope when operating against a team  |
| `VERCEL_TEAM_SLUG`                    | no       | Display metadata only                     |
| `VERCEL_PROJECT_ALLOWLIST`            | no       | Comma-separated project IDs or names      |
| `VERCEL_DOMAIN_ALLOWLIST`             | no       | Comma-separated DNS names                 |
| `VERCEL_REPOSITORY_ALLOWLIST`         | no       | Comma-separated `owner/repo` entries      |
| `VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS` | no       | Keep `false` unless separately authorized |

Generate the gateway bearer key with at least 32 bytes of entropy. A hex-encoded 32-byte value is
the normal shape:

```bash
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
```

Do not reuse `ZORO_GITHUB_API_KEY`. Configure the generated value in Heroku and in the GPT Action
authentication panel. The key must be transported as:

```http
Authorization: Bearer <ZORO_VERCEL_API_KEY>
```

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

## Verifying the deployed GitHub gateway

Load the bearer key from a secure source. Never paste it inline and never echo it.

```bash
BASE=https://<app-name>.herokuapp.com
read -rs ZORO_GITHUB_API_KEY && export ZORO_GITHUB_API_KEY
AUTH="Authorization: Bearer $ZORO_GITHUB_API_KEY"
```

Run the read and policy checks **before** attempting any write:

```bash
# 1. Unauthenticated access is refused
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/github/repositories"          # expect 401

# 2. Authenticated repository list
curl -s -o /dev/null -w '%{http_code}\n' -H "$AUTH" "$BASE/api/v1/github/repositories"  # expect 200

# 3. Repository root read
curl -s -o /dev/null -w '%{http_code}\n' -H "$AUTH" \
  "$BASE/api/v1/github/contents?owner=<owner>&repo=<repo>"                            # expect 200

# 4. Branch list
curl -s -o /dev/null -w '%{http_code}\n' -H "$AUTH" \
  "$BASE/api/v1/github/branches?owner=<owner>&repo=<repo>"                            # expect 200

# 5. Workflow paths stay blocked
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"owner":"<owner>","repo":"<repo>","branch":"main","path":".github/workflows/x.yml","content":"x","message":"test"}' \
  "$BASE/api/v1/github/files"                                                         # expect 403

# 6. Unknown repository fails safely
curl -s -o /dev/null -w '%{http_code}\n' -H "$AUTH" \
  "$BASE/api/v1/github/contents?owner=<owner>&repo=definitely-not-a-repo"             # expect 404
```

### Write smoke test

Use a **disposable path in a non-critical repository**. Do not use production application files.

1. Create a branch `test/gateway-smoke` from the default branch.
2. Create `docs/gateway-smoke-test.md` on that branch.
3. Read it back and record the blob SHA.
4. Replace it using that SHA.
5. Open a draft pull request and record its head SHA.
6. Close the pull request without merging.
7. Separately, create a disposable file directly on the default branch.
8. Read it, then delete it using its current SHA.
9. Confirm both commits appear in the default branch history.
10. Delete the temporary branch through the GitHub UI — branch deletion is not exposed by this API.

Confirm no secret value appeared in any command output or in `heroku logs`.

## Verifying the deployed Vercel gateway

On Windows, use Git Bash for the examples below so `export`, `read -rs`, and `$VARIABLE` expansion
behave as shown. Keep the key in shell memory only. Never paste it inline, never echo it, and never
use `curl --insecure`. If Windows curl reports a certificate revocation check failure, use
`--ssl-no-revoke`; this preserves certificate validation while bypassing the local revocation-check
problem.

```bash
BASE=https://context-api-3b9dfadf403e.herokuapp.com
read -rs ZORO_VERCEL_API_KEY && export ZORO_VERCEL_API_KEY
AUTH="Authorization: Bearer $ZORO_VERCEL_API_KEY"
```

Run the authentication checks before any write operation:

```bash
# 1. Unauthenticated access is refused
curl --ssl-no-revoke -s -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/vercel/user"
# expect 401

# 2. Authenticated current-user smoke test
curl --ssl-no-revoke -s -o /dev/null -w '%{http_code}\n' -H "$AUTH" "$BASE/api/v1/vercel/user"
# expect 200
```

If step 2 returns `401 AUTHENTICATION_REQUIRED`, compare SHA-256 hashes only. Do not compare,
print, screenshot, or paste the secret value.

Local hash:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(process.env.ZORO_VERCEL_API_KEY || '').digest('hex'))"
```

Heroku hash:

```bash
heroku run 'node -e "console.log(require(\"crypto\").createHash(\"sha256\").update(process.env.ZORO_VERCEL_API_KEY || \"\").digest(\"hex\"))"' --app context-api
```

The two hashes must match exactly. The SHA-256 hash of an empty local value is:

```text
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

If the local hash equals that value, the local shell has not loaded `ZORO_VERCEL_API_KEY`. Reload it
from the secure source and rerun the authenticated smoke test.

### Rotating the Vercel gateway key

Rotate `ZORO_VERCEL_API_KEY` when exposure is suspected, when local and Heroku hashes cannot be
reconciled, or on the normal credential rotation schedule. This rotates only the Zoro-to-Context-API
gateway key; rotate `VERCEL_TOKEN` separately in Vercel if provider access is exposed.

```bash
NEW_KEY=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
heroku config:set ZORO_VERCEL_API_KEY="$NEW_KEY" --app context-api
export ZORO_VERCEL_API_KEY="$NEW_KEY"
unset NEW_KEY
```

Then update the GPT Action authentication panel with the new bearer key, save the GPT, start a fresh
conversation, and rerun the authenticated smoke test. Do not print the old or new key.

### Vercel gateway troubleshooting

- `401` without an `Authorization` header is expected and proves the route fails closed.
- `401` with a bearer header usually means the local key is empty, stale, copied with extra shell
  quoting, or different from Heroku. Compare hashes only.
- If local and Heroku hashes match but `401` continues, verify the Heroku release SHA and ensure the
  deployed dyno is running the expected code.
- If authentication succeeds but Vercel calls fail, inspect `VERCEL_TOKEN`, team scope, allowlists,
  and upstream Vercel permissions without printing secret values.
- Use `heroku config --app context-api | cut -d: -f1` to list variable names only.
- Never run `heroku config:get ZORO_VERCEL_API_KEY --app context-api` unless piping directly into a
  hash command that does not print the secret.

## Rolling back the GitHub gateway

```bash
git revert <gateway-commit>          # never force-push as part of recovery
git push heroku main
heroku releases --app <app-name>     # confirm the rollback release is current
```

Then remove the GitHub operations from the Custom GPT Action schema and save the GPT.

If credential exposure is suspected, in this order:

1. rotate `ZORO_GITHUB_API_KEY` and update the Action authentication panel;
2. generate a new GitHub App private key and update `GITHUB_PRIVATE_KEY_BASE64`;
3. revoke the previous private key in the GitHub App settings;
4. suspend or uninstall the GitHub App if immediate repository isolation is required.

Recover affected repositories through normal Git history — revert commits and restore files from
prior commits. Do not force-push. Record affected repositories, paths, commits, and correlation IDs.

## Keeping the OpenAPI Action schema in sync

> **Warning:** the schema the Custom GPT Action actually uses is configured in the GPT itself and is
> **not** deployed from this repository. Nothing in CI can detect drift between it and the deployed
> API. Whenever a route, method, request body, or field changes here, update the Action schema in the
> same change window, or the assistant will call endpoints that do not exist or omit required fields.

The maintained copy lives at [`openapi/zoro-action.yaml`](openapi/zoro-action.yaml). Edit it here,
then paste it into the GPT Builder. It currently declares **27 operations** (15 context + 12 GitHub).

The Action schema must:

- use OpenAPI 3.1.0;
- declare the deployed base URL as its server;
- expose `listTasks`, `getTask`, `createTask`, `updateTask`, and `deleteTask` with unique
  `operationId` values;
- describe request bodies with explicit object properties, not free-form objects;
- use `PATCH` for updates — never `PUT`;
- stay below the Custom GPT Action operation limit (30);
- declare a bearer security scheme and apply it to every GitHub operation;
- never contain the bearer secret itself — set that in the Action authentication panel.

After updating the GPT, start a **new conversation**: an existing one caches stale Action metadata.

Validate the file's structure, operation count, and `$ref` integrity before pasting:

```bash
node -e "
const y=require('js-yaml'),f=require('fs');
const d=y.load(f.readFileSync('docs/openapi/zoro-action.yaml','utf8'));
const ops=Object.values(d.paths).flatMap(p=>Object.keys(p).filter(m=>m!=='parameters').map(m=>p[m].operationId));
console.log('operations:',ops.length,'unique:',new Set(ops).size);
"
```

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
