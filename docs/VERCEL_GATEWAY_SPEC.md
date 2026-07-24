# Context API — Vercel Gateway Specification

**Version:** 1.0  
**Status:** Approved for specification; implementation not started  
**Owner:** Kofi Arhin  
**Target repository:** `kofiarhin/context-api`  
**Target branch:** `main`  
**Last updated:** 2026-07-23

## 1. Purpose

This specification defines an authenticated Vercel Gateway inside the existing Context API so Zoro can inspect and operate Kofi's Vercel resources through a governed Custom GPT Action.

The gateway is not limited to triggering deployments. Its intended role is to provide broad operational access comparable to the existing GitHub Gateway while preserving explicit approval boundaries, secret isolation, least-privilege controls, normalized responses, deterministic validation, and auditable behavior.

The intended operating model is:

```text
Kofi
  -> Zoro Custom GPT
  -> authenticated Context API Vercel Gateway
  -> Vercel REST API
  -> normalized result returned to Zoro
```

The GitHub Gateway controls source code and pull-request workflows. The Vercel Gateway controls project hosting, deployment lifecycle, runtime configuration, domains, aliases, DNS, and deployment diagnostics. Together they allow Zoro to inspect code, propose or implement authorized changes, observe preview deployments, diagnose failures, and manage approved releases without exposing platform credentials to the GPT.

## 2. Goals

The gateway must:

1. authenticate every Vercel operation separately from the public Context API routes;
2. keep the Vercel access token inside the server environment and never return or log it;
3. support read access to the current Vercel account or team, projects, deployments, deployment events, project domains, aliases, DNS metadata, and environment-variable metadata;
4. support governed project, deployment, environment-variable, domain, alias, and DNS mutations;
5. default deployment creation to Preview unless Production is explicitly authorized;
6. require explicit approval for production-sensitive and destructive operations;
7. prevent retrieval or disclosure of decrypted environment-variable values;
8. support optional allowlists for teams, projects, domains, and repositories;
9. normalize Vercel responses and errors into the Context API response contract;
10. preserve the existing Context API and GitHub Gateway behavior;
11. include unit, integration, security, policy, and release-validation coverage;
12. provide an OpenAPI contract suitable for a dedicated Zoro Vercel Action.

## 3. Non-goals

The first implementation must not expose:

- account deletion;
- team deletion;
- team-member invitation, removal, or role administration;
- billing, invoices, payment methods, or contract management;
- marketplace purchase or billing operations;
- certificate private-key operations;
- token creation, rotation, listing, or revocation;
- decrypted environment-variable values;
- arbitrary proxy access to undocumented Vercel endpoints;
- unrestricted account-wide destructive operations;
- automatic production promotion without explicit authority;
- automatic acceptance of project transfers;
- security-policy bypass, deployment-protection bypass, or firewall bypass;
- arbitrary log-drain destinations;
- storage-product administration unless separately specified and approved.

"Full access" in this specification means full operational control required to create, configure, deploy, inspect, promote, roll back, pause, unpause, and remove approved projects and their supporting resources. It does not mean unrestricted Vercel account administration.

## 4. Existing-system constraints

The implementation must follow the existing Context API conventions:

- Node.js 24.x;
- CommonJS modules;
- Express 5;
- layered route, middleware, controller, service, serializer, and error handling;
- Jest and Supertest tests;
- shared response envelopes;
- structured safe logging;
- explicit environment validation;
- no raw upstream response objects returned by controllers;
- no secrets committed to the repository;
- `npm run verify` as the release gate.

The Vercel routes must be mounted before the database-backed `/api/v1` router and must not require MongoDB at request time. The process-level MongoDB startup dependency may remain unchanged unless separately approved.

## 5. Upstream platform model

The gateway communicates with `https://api.vercel.com` using HTTPS and a Vercel Access Token in the upstream `Authorization: Bearer <token>` header.

Personal-account resources may be addressed without a team query. Team-owned resources must be scoped by the configured team identifier. The gateway must not allow callers to select an arbitrary team unless that team is explicitly allowlisted.

Vercel projects represent deployable applications and may contain one current Production deployment plus multiple Preview or other pre-production deployments. Git-connected projects can deploy automatically from repository changes. The REST API can also create and manage deployments directly.

Preview and Production are materially different authority levels. Preview operations are the default. Production deployment, promotion, rollback, domain reassignment, and Production environment-variable changes are production-sensitive operations.

## 6. Authentication boundaries

### 6.1 Zoro to Context API

Every route under `/api/v1/vercel` requires:

```http
Authorization: Bearer <ZORO_VERCEL_API_KEY>
```

The Vercel gateway credential must be separate from `ZORO_GITHUB_API_KEY`.

Requirements:

- minimum 32-character secret;
- constant-time comparison;
- deny by default when missing or unconfigured;
- never log the header or token;
- never attach the token to the request object;
- return `401 AUTHENTICATION_REQUIRED` for missing, malformed, or invalid credentials.

### 6.2 Context API to Vercel

The server authenticates upstream with:

```http
Authorization: Bearer <VERCEL_TOKEN>
```

The token must:

- be stored only in Heroku or local environment configuration;
- never be committed;
- never be returned in API responses;
- never appear in errors or logs;
- use the narrowest practical Vercel account or team scope;
- have an expiration date and a documented rotation procedure.

## 7. Environment configuration

Add the following variables:

```env
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_TEAM_SLUG=
ZORO_VERCEL_API_KEY=
VERCEL_PROJECT_ALLOWLIST=
VERCEL_DOMAIN_ALLOWLIST=
VERCEL_REPOSITORY_ALLOWLIST=
VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS=false
```

### 7.1 Validation rules

- `VERCEL_TOKEN` is required in production when the gateway is enabled.
- `VERCEL_TEAM_ID` must be a non-empty Vercel team identifier when team-scoped mode is used.
- `VERCEL_TEAM_SLUG` is optional metadata and must not be used as the sole authorization key.
- `ZORO_VERCEL_API_KEY` must meet the same minimum entropy policy as the GitHub gateway key.
- allowlists are comma-separated, trimmed, deduplicated, and matched case-insensitively where appropriate.
- project allowlist entries may use immutable project IDs and optionally project names; IDs are authoritative when both exist.
- repository allowlist entries use `owner/repo`.
- domain allowlist entries use normalized lower-case DNS names.
- destructive operations remain disabled unless `VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS=true` and the caller supplies the required explicit-confirmation fields.
- validation errors name variables but never echo values.

## 8. Authorization and approval policy

Technical access does not grant unlimited authority. The gateway must classify operations into four policy levels.

### 8.1 Level 1 — Read-only

May execute when the user's request clearly asks for inspection or status information:

- read current user metadata;
- list/read teams allowed by configuration;
- list/read projects;
- list/read deployments;
- read deployment status, metadata, files list, events, and safe logs;
- list project domains and aliases;
- inspect domain configuration;
- list DNS record metadata;
- list environment-variable metadata without decrypted values;
- inspect Git connection metadata;
- inspect project framework, build, root-directory, and production-branch settings.

### 8.2 Level 2 — Normal write

Requires a request that clearly authorizes the concrete mutation:

- create a project;
- update non-production project settings;
- connect an approved Git repository;
- create a Preview deployment;
- cancel a non-production deployment;
- create or update Preview/Development environment variables;
- add an approved project domain without moving production traffic;
- create an approved non-destructive DNS record;
- create or update aliases that do not affect the production domain;
- pause or unpause a non-production project when supported by policy.

### 8.3 Level 3 — Production-sensitive

Requires explicit approval naming the project and intended production effect:

- create a Production deployment;
- promote a deployment to Production;
- roll back Production;
- reassign production domains;
- change the production branch;
- update framework, build command, output directory, install command, or root directory for a production project;
- create, update, or remove Production environment variables;
- add, verify, move, redirect, or remove a production domain;
- update DNS records that affect production traffic;
- pause or unpause a production project.

The gateway request must include:

```json
{
  "approval": {
    "confirmed": true,
    "scope": "production",
    "reason": "User explicitly approved production promotion",
    "requestReference": "optional traceable reference"
  }
}
```

The server must reject absent, false, malformed, or mismatched production approval.

### 8.4 Level 4 — Destructive

Requires:

1. explicit user authorization naming the exact resource;
2. `VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS=true`;
3. a confirmation object containing the resource identifier and expected current state;
4. an allowlist match;
5. optimistic concurrency or equivalent precondition where Vercel exposes suitable state.

Destructive operations include:

- delete project;
- delete deployment;
- remove domain;
- delete DNS record;
- delete environment variable;
- remove aliases that currently serve production traffic.

Example:

```json
{
  "confirmation": {
    "confirmed": true,
    "resourceType": "project",
    "resourceId": "prj_example",
    "expectedName": "coffee-shop",
    "reason": "User explicitly requested deletion"
  }
}
```

Vague instructions such as "clean everything up" must not satisfy this requirement.

## 9. Secret-handling policy

Environment variables require special handling.

The gateway may return:

- variable ID;
- key;
- type;
- target environments;
- Git branch targeting metadata;
- creation and update timestamps;
- whether a value is configured.

The gateway must never return:

- decrypted values;
- encrypted ciphertext intended for later decryption;
- secret material embedded in upstream errors;
- values supplied during create or update after the request completes.

Create and update requests may accept a secret value from the immediate authenticated caller, but the server must:

- redact the value from logs;
- avoid including request bodies in error output;
- not persist it in MongoDB;
- not include it in the response;
- clear local references as soon as practical;
- return only normalized metadata.

## 10. Route namespace and operation groups

All routes are under:

```text
/api/v1/vercel
```

### 10.1 Identity and teams

```http
GET /api/v1/vercel/user
GET /api/v1/vercel/teams
GET /api/v1/vercel/teams/:teamId
```

Team reads must remain constrained to the configured or allowlisted teams.

### 10.2 Projects

```http
GET    /api/v1/vercel/projects
POST   /api/v1/vercel/projects
GET    /api/v1/vercel/projects/:projectIdOrName
PATCH  /api/v1/vercel/projects/:projectIdOrName
DELETE /api/v1/vercel/projects/:projectIdOrName
POST   /api/v1/vercel/projects/:projectIdOrName/pause
POST   /api/v1/vercel/projects/:projectIdOrName/unpause
```

Project creation supports approved Git connections and bounded build configuration. The gateway must reject arbitrary unsupported project properties rather than pass them through.

### 10.3 Deployments

```http
GET    /api/v1/vercel/deployments
POST   /api/v1/vercel/deployments
GET    /api/v1/vercel/deployments/:deploymentIdOrUrl
PATCH  /api/v1/vercel/deployments/:deploymentId/cancel
DELETE /api/v1/vercel/deployments/:deploymentId
GET    /api/v1/vercel/deployments/:deploymentId/events
GET    /api/v1/vercel/deployments/:deploymentId/files
GET    /api/v1/vercel/deployments/:deploymentId/logs
POST   /api/v1/vercel/deployments/:deploymentId/promote
POST   /api/v1/vercel/projects/:projectIdOrName/rollback
```

Implementation note: only endpoints confirmed in the current Vercel API must be used. Where Vercel exposes promotion or rollback through a project-specific endpoint with different upstream semantics, the Context API route remains stable and the service adapts to the upstream contract.

### 10.4 Environment variables

```http
GET    /api/v1/vercel/projects/:projectIdOrName/environment-variables
POST   /api/v1/vercel/projects/:projectIdOrName/environment-variables
PATCH  /api/v1/vercel/projects/:projectIdOrName/environment-variables/:variableId
DELETE /api/v1/vercel/projects/:projectIdOrName/environment-variables/:variableId
```

No route for retrieving decrypted values is permitted.

### 10.5 Project domains

```http
GET    /api/v1/vercel/projects/:projectIdOrName/domains
POST   /api/v1/vercel/projects/:projectIdOrName/domains
GET    /api/v1/vercel/projects/:projectIdOrName/domains/:domain
POST   /api/v1/vercel/projects/:projectIdOrName/domains/:domain/verify
PATCH  /api/v1/vercel/projects/:projectIdOrName/domains/:domain
DELETE /api/v1/vercel/projects/:projectIdOrName/domains/:domain
```

### 10.6 Account domains and DNS

```http
GET    /api/v1/vercel/domains
GET    /api/v1/vercel/domains/:domain
GET    /api/v1/vercel/domains/:domain/configuration
POST   /api/v1/vercel/domains
PATCH  /api/v1/vercel/domains/:domain
DELETE /api/v1/vercel/domains/:domain

GET    /api/v1/vercel/domains/:domain/dns-records
POST   /api/v1/vercel/domains/:domain/dns-records
PATCH  /api/v1/vercel/domains/:domain/dns-records/:recordId
DELETE /api/v1/vercel/domains/:domain/dns-records/:recordId
```

Account-domain and DNS mutations are disabled by default until their policy and test coverage are independently verified.

### 10.7 Aliases

```http
GET    /api/v1/vercel/aliases
POST   /api/v1/vercel/aliases
GET    /api/v1/vercel/aliases/:aliasIdOrName
DELETE /api/v1/vercel/aliases/:aliasIdOrName
```

Alias operations must distinguish generated preview URLs from custom production aliases.

## 11. Request validation

Every route must use operation-specific schemas with `additionalProperties: false` semantics.

Validation requirements include:

- bounded string lengths;
- normalized project IDs, names, deployment IDs, team IDs, repository references, domains, branches, and record identifiers;
- pagination bounds;
- explicit enums for deployment target, environment target, environment-variable type, framework, redirect status, and DNS record type;
- URL validation for deployment URLs;
- lower-case domain normalization;
- rejection of credentials in project configuration fields;
- rejection of environment-variable values in query strings;
- rejection of unsupported Vercel properties;
- confirmation-object validation for production and destructive operations;
- body-size limits appropriate to configuration operations;
- separate, explicitly larger limits only if direct deployment file upload is later approved.

Direct file-upload deployment is out of scope for the first release. Git-connected deployment is the preferred first implementation because Zoro already has governed GitHub access.

## 12. Git-connected project behavior

The first implementation should prioritize repositories already accessible through the GitHub Gateway and approved by `VERCEL_REPOSITORY_ALLOWLIST`.

For project creation or Git connection:

1. validate `owner/repo`;
2. confirm the repository is allowlisted;
3. resolve the Vercel team scope;
4. check whether an equivalent Vercel project already exists;
5. reject ambiguous duplicate names;
6. create or update the project connection using only supported Git provider fields;
7. return normalized project and Git connection metadata;
8. never broaden GitHub App permissions as part of a Vercel request.

The Vercel Gateway must not create GitHub repositories. Repository creation requires a separately specified GitHub capability.

## 13. Deployment behavior

### 13.1 Preview-first default

When `target` is omitted, deployment creation defaults to `preview`.

A Production target requires a valid production approval object.

### 13.2 Deployment status

Normalize upstream lifecycle states to:

```text
queued
building
ready
failed
canceled
unknown
```

Preserve the raw upstream state in a non-authoritative metadata field only when safe and useful.

### 13.3 Completion response

A deployment response may include:

```json
{
  "data": {
    "id": "dpl_example",
    "projectId": "prj_example",
    "projectName": "coffee-shop",
    "status": "ready",
    "target": "preview",
    "url": "https://coffee-shop-example.vercel.app",
    "createdAt": "2026-07-23T12:00:00.000Z",
    "readyAt": "2026-07-23T12:01:30.000Z",
    "git": {
      "provider": "github",
      "repository": "kofiarhin/coffee-shop",
      "branch": "feature/example",
      "commitSha": "..."
    }
  },
  "meta": {
    "version": "v1"
  }
}
```

### 13.4 Polling

The gateway does not hold an HTTP request open for an entire build. Zoro creates a deployment, receives its ID and initial URL, then polls the read endpoint at a bounded interval.

The OpenAPI description must instruct Zoro to stop polling when the deployment becomes `ready`, `failed`, or `canceled`, and to avoid excessive repeated calls.

### 13.5 Promotion and rollback

Promotion and rollback must:

- verify the target project and deployment;
- require explicit production approval;
- inspect current production state first;
- record the previous production deployment identifier when available;
- return both the requested target and resulting current deployment;
- never claim success until the upstream state confirms the production assignment;
- preserve enough metadata for a later rollback investigation.

## 14. Logs and diagnostic data

The gateway may expose deployment events and bounded logs required to diagnose builds and runtime failures.

Controls:

- default to a small result limit;
- support bounded time windows and pagination or cursors;
- redact authorization headers, cookies, known secret keys, access tokens, database connection strings, and environment-variable values;
- truncate oversized entries;
- preserve timestamp, level, source, message, deployment ID, and request metadata when safe;
- never return raw unbounded log streams;
- never persist logs to MongoDB by default.

Because logs may contain application-generated secrets, redaction is defense in depth and must not be represented as perfect secret detection.

## 15. Project and resource allowlists

The policy layer must support:

- team allowlisting through the configured team ID;
- project allowlisting by project ID or normalized name;
- repository allowlisting by `owner/repo`;
- domain allowlisting by exact domain or explicitly supported subdomain pattern;
- optional read-all/write-allowlisted mode;
- deny-by-default mutation behavior when an allowlist is configured and no match exists.

Wildcard rules must not be inferred. Any wildcard support requires an explicit documented syntax and tests.

## 16. Upstream client

Create a dedicated client module that:

- uses the global `fetch` available in Node.js 24 unless an approved SDK provides clear value;
- sets the Vercel authorization header internally;
- applies configured team scope internally;
- sets JSON content headers only when needed;
- enforces request timeouts with `AbortController`;
- normalizes network, timeout, malformed-response, rate-limit, authentication, authorization, validation, conflict, and upstream-server failures;
- does not expose raw response bodies when they may contain sensitive content;
- supports dependency injection for tests;
- records safe request metadata without logging bodies or credentials.

No controller may call `fetch` or a Vercel SDK directly.

## 17. Error model

Add gateway-specific errors mapped into the existing error envelope.

Recommended codes:

```text
AUTHENTICATION_REQUIRED       401
VERCEL_FORBIDDEN              403
VERCEL_RESOURCE_NOT_ALLOWED   403
VERCEL_NOT_FOUND              404
VERCEL_CONFLICT               409
VERCEL_APPROVAL_REQUIRED      409
VERCEL_PRECONDITION_FAILED    412
VERCEL_RATE_LIMITED           429
VERCEL_VALIDATION_ERROR       400
VERCEL_UNSUPPORTED_OPERATION  422
VERCEL_UPSTREAM_ERROR         502
VERCEL_TIMEOUT                504
```

Error responses must include safe field-level details where helpful and the shared correlation ID. They must not include tokens, environment values, raw HTML, or unreviewed upstream payloads.

## 18. Response serialization

Serializers must return stable Context API resources rather than raw Vercel objects.

Required serializer groups:

- user;
- team;
- project;
- deployment;
- deployment event/log entry;
- environment-variable metadata;
- project domain;
- account domain;
- DNS record;
- alias;
- pagination/cursor metadata.

Fields not required by Zoro's workflow should be omitted. Unknown upstream fields must not pass through automatically.

## 19. Logging and auditability

Structured logs may record:

- correlation ID;
- normalized operation name;
- team ID;
- project ID/name;
- deployment ID;
- domain or DNS record identifier;
- target environment;
- result status;
- safe duration and upstream status;
- whether approval was required and present;
- denial reason category.

Logs must not record:

- Vercel token;
- Zoro bearer key;
- environment-variable values;
- request authorization headers;
- cookies;
- full unredacted deployment logs;
- raw upstream response bodies.

Meaningful successful repository or deployment state transitions should be recorded through the existing Ideas Hub operational-log policy only when the active workflow authorizes that separate durable update. Context API runtime logging does not replace project records, deployment evidence, or Architect verification.

## 20. Rate limiting and abuse controls

The Vercel namespace uses the existing API rate limiter plus gateway-specific controls.

Requirements:

- lower limits for destructive and production-sensitive operations;
- bounded pagination;
- bounded log queries;
- bounded polling guidance;
- no bulk delete endpoint in the first release;
- no caller-controlled upstream URL;
- no generic method/path proxy;
- idempotency or duplicate detection for project and environment-variable creation where supported;
- correlation IDs on every response;
- safe handling of upstream `429` responses and retry metadata.

## 21. OpenAPI and Custom GPT Action design

The Vercel Gateway uses dedicated maintained schemas:

```text
docs/openapi/zoro-vercel-core-action.yaml
docs/openapi/zoro-vercel-config-action.yaml
```

This avoids overloading the existing Context/GitHub Action schema and creates a separate authentication boundary.

The Vercel contract is published as two files because a GPT Builder Action schema may declare at most 30 operations and the implemented Vercel surface is larger than that. The split is by capability, not by risk level: the core schema carries user, team, project, and deployment operations, and the configuration schema carries environment-variable metadata, project domains, aliases, domain configuration, and DNS records. The two files are disjoint — no operation ID or route appears in both — and together they cover every implemented route.

Both files declare the same `ZORO_VERCEL_API_KEY` bearer scheme, so they install as two Actions sharing one credential.

Recommended Zoro Action organization:

```text
Action 1 — Context records
Action 2 — GitHub Gateway
Action 3 — Vercel Gateway (core)
Action 4 — Vercel Gateway (configuration)
```

All actions may use the same Context API host but should use focused schemas and separate bearer credentials where supported.

Each Vercel Action schema must:

- describe approval requirements in operation summaries and request schemas;
- distinguish Preview, Production, and destructive operations;
- state that secret values must never be retrieved or repeated;
- expose only implemented endpoints;
- use unique, stable operation IDs that are not reused by the other Vercel schema;
- remain within current Custom GPT Action limits, currently at most 30 operations per schema;
- include normalized success and error schemas;
- be validated by a repository release script;
- be manually installed and smoke-tested in GPT Builder after deployment.

## 22. Proposed source layout

```text
src/controllers/vercel.controller.js
src/middleware/requireVercelActionAuth.js
src/middleware/requireVercelResourceAccess.js
src/middleware/requireVercelApproval.js
src/middleware/validateVercel.js
src/routes/v1/vercel.js
src/services/vercelClient.js
src/services/vercel.service.js
src/services/vercelPolicy.js
src/services/vercelErrors.js
src/serializers/vercel.serializer.js
src/validation/vercel.schemas.js
```

Existing files likely requiring focused updates:

```text
.env.example
README.md
package.json
src/app.js
src/config/env.js
src/middleware/errorHandler.js
src/utils/errors.js
docs/DEPLOYMENT.md
docs/openapi/zoro-vercel-core-action.yaml
docs/openapi/zoro-vercel-config-action.yaml
scripts/validate-vercel-gateway-release.js
```

## 23. Test requirements

### 23.1 Unit tests

Cover:

- environment parsing and secret-safe failures;
- bearer authentication;
- allowlist normalization and matching;
- operation-level policy classification;
- production approval validation;
- destructive confirmation validation;
- domain normalization;
- response serializers;
- upstream error translation;
- log redaction;
- deployment status normalization;
- project duplicate detection;
- secret value non-return behavior.

### 23.2 Service tests

Use injected mocked clients. Cover:

- successful list/read/create/update/delete flows;
- personal and team-scoped requests;
- allowlist denials before upstream calls;
- Preview default behavior;
- Production rejection without approval;
- destructive rejection when globally disabled;
- stale expected-state conflicts;
- Vercel `400`, `401`, `403`, `404`, `409`, `412`, `429`, and `5xx` translation;
- timeout and malformed JSON handling;
- duplicate project and environment-variable behavior;
- promotion and rollback state verification;
- absence of decrypted environment-variable endpoints.

### 23.3 Integration tests

Cover:

- route registration;
- authentication on every route;
- database middleware bypass;
- body limits;
- method allowlisting;
- validation failures;
- response envelopes;
- correlation IDs;
- rate limiting;
- policy denials;
- no upstream calls after failed auth, validation, allowlist, or approval checks;
- existing Context API and GitHub Gateway regression behavior.

### 23.4 Release validation

Add `npm run verify:vercel-gateway` and include it in `npm run verify`.

The validator must confirm:

- required specification and OpenAPI files exist;
- production server URL is correct;
- each schema declares at most 30 operations;
- operation IDs are unique within a schema and are never reused across the two schemas;
- every documented exposed route is implemented, and every implemented route is documented exactly once;
- both schemas declare the same `ZORO_VERCEL_API_KEY` bearer scheme, and all write operations declare bearer authentication;
- production/destructive schemas require approval or confirmation objects;
- no decrypted environment-variable operation exists;
- no account, billing, team-member, token, or certificate-private-key administration operation exists;
- no generic proxy path exists.

## 24. Implementation phases

### Phase 0 — Revalidation and authority

- inspect current `main`;
- run clean baseline verification;
- confirm current Vercel API contracts from official documentation;
- create deterministic client fixtures;
- record existing test count and warnings.

### Phase 1 — Configuration, client, and authentication

- add validated environment configuration;
- add dedicated bearer authentication;
- implement safe Vercel client and error translation;
- add tests.

### Phase 2 — Read-only inventory

- user and team reads;
- project list/read;
- deployment list/read/events/files/logs;
- environment-variable metadata list;
- project-domain and account-domain reads;
- DNS and alias reads;
- serializers and policy enforcement.

### Phase 3 — Preview deployment operations

- create Preview deployments;
- cancel Preview deployments;
- delete approved Preview deployments;
- polling and diagnostic workflows;
- Git-connected repository validation.

### Phase 4 — Project configuration

- create projects;
- connect approved Git repositories;
- update bounded project settings;
- pause/unpause;
- duplicate detection.

### Phase 5 — Environment variables

- create/update/delete Development and Preview variables;
- add Production-variable approval gate;
- prove values never appear in responses or logs.

### Phase 6 — Domains, aliases, and DNS

- project-domain management;
- domain verification;
- aliases;
- allowlisted DNS mutation;
- production-traffic approval gates.

### Phase 7 — Production lifecycle

- Production deployment;
- promotion;
- rollback;
- current-state verification;
- explicit evidence requirements.

### Phase 8 — Destructive operations

- project, deployment, domain, alias, DNS, and environment-variable deletion;
- global feature flag;
- exact-resource confirmations;
- comprehensive denial and concurrency tests.

### Phase 9 — Action schema, deployment, and smoke test

- create and validate dedicated OpenAPI schema;
- run `npm ci` and `npm run verify` from a clean checkout;
- deploy verified revision;
- configure Heroku secrets manually;
- install the Vercel Action in GPT Builder;
- perform read-only smoke tests;
- perform one disposable Preview deployment test;
- perform controlled configuration tests on disposable resources;
- verify no secrets are exposed;
- record exact deployed revision and evidence;
- do not test destructive Production operations without separate explicit authorization.

## 25. Definition of done

The gateway is complete only when:

- the approved operation set is implemented;
- every route is authenticated;
- team/project/repository/domain policies are enforced;
- Preview is the default deployment target;
- Production and destructive operations require the documented approval controls;
- decrypted environment-variable values cannot be retrieved;
- secrets do not appear in logs, errors, or responses;
- normalized serializers and error responses are stable;
- all new and existing tests pass;
- lint and formatting pass;
- release validation passes;
- the verified revision is deployed;
- the dedicated Zoro Action schema is installed;
- read-only and disposable Preview smoke tests pass;
- deployment URLs and failures are returned accurately;
- production behavior is not claimed verified without separate production evidence;
- durable project documentation is updated only after verification.

## 26. Acceptance scenarios

### Scenario A — Inspect a failed deployment

Kofi asks Zoro to inspect the latest failed KareBraids deployment. Zoro lists deployments, retrieves the failed deployment, reads bounded events/logs, and reports a redacted diagnosis without changing resources.

### Scenario B — Create a new Preview deployment

Kofi authorizes a Preview deployment for an allowlisted repository and branch. The gateway creates the deployment, returns its ID and URL, and Zoro polls until `ready` or `failed`.

### Scenario C — Create a Git-connected project

Kofi authorizes creation of a Vercel project for an allowlisted GitHub repository. The gateway checks for duplicates, creates the project, links the repository, returns normalized configuration, and does not create a Production deployment unless separately authorized.

### Scenario D — Configure a Preview secret

Kofi provides a value for `API_URL` targeted to Preview. The gateway sends it upstream, returns only variable metadata, and proves through tests and logs that the value is not echoed or stored.

### Scenario E — Attempt Production promotion without approval

Zoro calls the promotion route without a valid production approval object. The gateway returns `409 VERCEL_APPROVAL_REQUIRED` and makes no upstream mutation.

### Scenario F — Attempt project deletion

Zoro requests project deletion. The gateway rejects it unless destructive operations are enabled, the project is allowlisted, and the confirmation exactly matches the current project ID and expected name.

### Scenario G — Combined GitHub and Vercel recovery

Zoro identifies a failed deployment, reads the relevant GitHub code through the existing gateway, creates an authorized branch and pull request, observes the resulting Preview deployment, and returns the URL. Merge and Production promotion remain separate approval-gated actions.

## 27. Risks and mitigations

### Credential compromise

Mitigate with separate credentials, expiration, rotation, secret-safe logging, narrow Vercel scope, and immediate revocation procedures.

### Accidental Production changes

Mitigate with Preview defaults, server-enforced approval objects, explicit operation classification, allowlists, and separate production smoke-test authority.

### Secret exposure through environment variables or logs

Mitigate by blocking decrypted-value endpoints, redacting logs, avoiding body logging, normalizing errors, and testing non-disclosure.

### Ambiguous project names

Mitigate by preferring immutable project IDs and rejecting duplicate or ambiguous name resolution.

### Upstream API drift

Mitigate with an isolated client adapter, official API revalidation during implementation, release validation, contract fixtures, and no generic proxy.

### Excessive Custom GPT schema size

Mitigate with a dedicated Vercel Action schema and a focused operation surface rather than combining every Context, GitHub, and Vercel operation in one document.

### False completion claims

Mitigate by separating implemented, committed, deployed, smoke-tested, production-verified, and completed states. A successful API response or deployment build does not by itself prove the application is functionally correct.

## 28. Final architectural decision

The approved target architecture is a dedicated, authenticated Vercel Gateway within the existing Context API, modeled after the GitHub Gateway but with independent credentials, resource allowlists, Preview-first behavior, explicit Production and destructive approval gates, blocked secret readback, normalized responses, and a dedicated Zoro Vercel Action schema.

Implementation must proceed in phases, with read-only access and Preview deployment management before Production, DNS, and destructive capabilities.