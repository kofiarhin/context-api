# Context API — Vercel Gateway Implementation Plan

**Version:** 1.0  
**Status:** Implementation-ready plan; runtime implementation not started  
**Owner:** Kofi Arhin  
**Target repository:** `kofiarhin/context-api`  
**Target branch:** `main`  
**Last updated:** 2026-07-23  
**Source specification:** [`VERCEL_GATEWAY_SPEC.md`](VERCEL_GATEWAY_SPEC.md)  
**Repository base inspected:** `d542006dd20e1b58a6c8f5951f6fb6ecec26d805`  
**Specification blob inspected:** `f0ec1fd9c1032627a515c9d0513f262af568f013`

## 1. Delivery objective

Implement a dedicated, authenticated Vercel Gateway inside the existing Context API so Zoro can inspect and operate approved Vercel resources without receiving or storing the Vercel access token.

The intended end-to-end flow is:

```text
Kofi
  -> Zoro Custom GPT
  -> authenticated Context API Vercel Gateway
  -> Vercel REST API
  -> normalized result returned to Zoro
```

The Vercel Gateway complements rather than replaces the existing GitHub Gateway:

- the **GitHub Gateway** governs source code, branches, files, and pull requests;
- the **Vercel Gateway** governs hosting projects, deployment lifecycle, deployment diagnostics, runtime configuration metadata and mutations, domains, aliases, and DNS;
- source changes, preview deployments, merge approval, and production promotion remain distinct states and authority gates;
- neither gateway may infer user approval from technical access or from the success of an earlier operation.

The first implementation must be Preview-first, fail closed when configuration or approval evidence is invalid, block decrypted environment-variable readback, normalize all upstream responses and errors, and preserve existing Context API and GitHub Gateway behavior.

This document is a delivery plan only. It does not assert that any Vercel route, credential, Action, deployment, or runtime integration currently exists.

## 2. Authority, sources, and decision labels

### 2.1 Authority hierarchy

Implementation must follow, in order:

1. Kofi's latest explicit instruction;
2. the approved [`VERCEL_GATEWAY_SPEC.md`](VERCEL_GATEWAY_SPEC.md);
3. current verified Context API implementation and repository conventions;
4. this implementation plan;
5. documented assumptions and open questions.

A conflict between the specification and current implementation must be surfaced before changing runtime behavior. This plan must not silently override the specification.

### 2.2 Labels used in this plan

- **Approved decision** — explicitly defined by the approved specification.
- **Current fact** — observed in the inspected Context API repository revision.
- **Recommendation** — an implementation approach derived from the approved design and current repository conventions.
- **Assumption** — a reversible belief that must be confirmed during implementation.
- **Open question** — a material uncertainty requiring evidence or approval before the affected capability is enabled.
- **Approval gate** — an operation or phase that must stop until explicit authority is recorded.

### 2.3 Approved architectural decisions

The specification approves:

- a dedicated `/api/v1/vercel` namespace inside the existing Context API;
- separate Zoro-to-Context-API and Context-API-to-Vercel credentials;
- optional team, project, repository, and domain allowlists;
- Preview as the default deployment target;
- explicit approval controls for Production and destructive operations;
- no decrypted environment-variable readback;
- an explicit client, policy, validation, service, serializer, and error boundary;
- a dedicated maintained Vercel Action schema;
- phased delivery, with read-only and Preview capabilities before Production, DNS, and destructive operations.

## 3. Current-state assessment

The implementation must preserve the following current architecture and conventions observed at repository base `d542006dd20e1b58a6c8f5951f6fb6ecec26d805`.

### 3.1 Runtime and module conventions

| Concern | Current evidence | Vercel implementation requirement |
| --- | --- | --- |
| Runtime | `package.json` declares Node.js `24.x`. | Use Node.js 24 global `fetch` unless an SDK is separately justified and approved. |
| Modules | Source files use CommonJS and `'use strict'`. | New files must use CommonJS and existing import/export style. |
| Web framework | `package.json` uses Express 5. | Add an Express router under the existing application factory. |
| Application factory | `src/app.js` exports `createApp(options)` for in-process tests. | Mount the Vercel router through `createApp`; support injected test configuration. |
| Process startup | `src/server.js` validates environment, connects to MongoDB, then listens. | Preserve process-level MongoDB startup behavior unless a separate architecture change is approved. |
| Request-time database independence | `src/app.js` mounts `/api/v1/github` before `requireDatabase`. | Mount `/api/v1/vercel` before the database-backed router so Vercel requests do not pass through `requireDatabase`. |

### 3.2 Middleware and request lifecycle

Current shared middleware includes:

- `src/middleware/correlationId.js`;
- `src/middleware/requestLogger.js`;
- `src/middleware/queryLimits.js`;
- `src/middleware/allowedMethods.js`;
- `src/middleware/security.js` for CORS and rate limiting;
- `src/middleware/notFound.js`;
- `src/middleware/errorHandler.js`.

The GitHub namespace in `src/app.js` establishes the required ordering pattern:

```text
/api/v1/*
  -> shared rate limiter
  -> allowed-method middleware

/api/v1/github/*
  -> bounded JSON parser
  -> dedicated bearer authentication
  -> repository access policy
  -> gateway router
  -> gateway-local 404 termination

/api/v1/*
  -> smaller JSON parser
  -> requireDatabase
  -> context router
```

**Recommendation:** introduce the Vercel namespace beside the GitHub namespace, with its own bounded parser, dedicated authentication, resource policy, approval enforcement, and local 404 termination. Failed authentication, validation, allowlist, or approval checks must occur before any Vercel client call.

### 3.3 Environment validation

`src/config/env.js` currently:

- validates all environment configuration before use;
- fails startup with variable names but not secret values;
- supports optional gateway configuration outside production and mandatory gateway configuration in production;
- requires a minimum 32-character bearer secret;
- returns a frozen configuration object;
- exposes `getEnv()` and `resetEnv()` for runtime and tests.

**Recommendation:** implement `loadVercelConfig` parallel to `loadGithubConfig`, including normalized allowlists and a boolean destructive-operation flag. Missing or partial Vercel configuration must fail closed. Error messages must name configuration variables without echoing values.

### 3.4 Authentication and resource policy

Current GitHub patterns:

- `src/middleware/requireGithubActionAuth.js` parses only `Authorization: Bearer`, hashes both values to fixed-width digests, and uses `crypto.timingSafeEqual`;
- the bearer value is not attached to `req`, logged, or returned;
- `src/middleware/requireGithubRepositoryAccess.js` normalizes an optional repository allowlist;
- `src/services/githubPolicy.js` centralizes pure validation and authorization helpers.

**Recommendation:** mirror these boundaries with Vercel-specific authentication, resource access, approval, and policy modules. Do not reuse `ZORO_GITHUB_API_KEY` for Vercel.

### 3.5 Validation

Current gateway validation uses:

- operation-specific schemas in `src/validation/github.schemas.js`;
- `additionalProperties: false` behavior;
- `src/middleware/validateGithub.js` to place normalized input in `req.validated`;
- pure policy helpers in `src/services/githubPolicy.js` for values requiring deeper semantic rules.

The Vercel implementation must validate and normalize:

- team IDs;
- project IDs and names;
- deployment IDs and URLs;
- repository references;
- branches;
- domains;
- aliases;
- DNS record IDs, names, types, and values;
- environment-variable keys, types, and targets;
- bounded pagination and log windows;
- production approval objects;
- destructive confirmation objects;
- optimistic-concurrency or expected-state fields.

No environment-variable secret value may be accepted in a query string.

### 3.6 Controllers, services, clients, and serializers

Current GitHub layering is explicit:

- `src/controllers/github.controller.js` reads validated input, calls one service method, and emits a shared envelope;
- `src/services/github.service.js` orchestrates policy, upstream calls, and serialization;
- `src/services/githubClient.js` owns authenticated upstream-client construction;
- `src/services/githubErrors.js` translates upstream failures and discards unsafe raw payloads;
- `src/serializers/github.serializer.js` maps fields explicitly and never spreads upstream objects;
- `src/utils/responses.js` emits resource and paged collection envelopes.

The Vercel Gateway must follow the same separation. Controllers must not call `fetch` directly, enforce approval policy, or return raw Vercel objects.

### 3.7 Error handling and response envelopes

Current errors derive from `AppError` in `src/utils/errors.js`. `src/middleware/errorHandler.js` translates framework/database failures, logs safe metadata, and returns:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "details": []
  },
  "meta": {
    "correlationId": "...",
    "version": "v1"
  }
}
```

**Recommendation:** add Vercel-specific `AppError` subclasses and translate upstream Vercel failures inside `src/services/vercelErrors.js`. Modify `src/middleware/errorHandler.js` only if a framework-level Vercel failure cannot be safely translated at the client/service boundary.

### 3.8 Logging, limits, and correlation

`src/utils/logger.js` performs structured JSON logging and redacts keys containing authorization, cookies, passwords, secrets, tokens, API keys, credentials, and connection strings. Every request receives a correlation ID.

The Vercel implementation must:

- log only normalized operation names and safe resource identifiers;
- never log authorization headers, request bodies containing environment values, raw upstream bodies, or unbounded deployment logs;
- redact known sensitive keys and values in diagnostic log entries;
- enforce bounded body sizes, pagination, log windows, polling guidance, and per-operation rate limits;
- preserve correlation IDs in all responses and safe operational logs.

**Open question:** key-name redaction alone is not sufficient for arbitrary application-generated deployment logs. A Vercel-specific content redactor and truncation policy must be implemented and tested before log endpoints are enabled.

### 3.9 Tests and release validation

Current conventions include:

- Jest 30 and Supertest;
- `tests/helpers/testApp.js` for injected app configuration;
- service-boundary mocking in `tests/integration/githubRoutes.test.js`;
- unit suites for authentication, environment loading, policy, serializers, services, and error translation;
- integration suites for route registration, body limits, database independence, authentication, validation, status codes, envelopes, correlation IDs, and unsupported methods;
- `scripts/validate-github-gateway-release.js`;
- `npm run verify:github-gateway`;
- aggregate `npm run verify`, currently running tests, lint, formatting, and the GitHub release validator.

Vercel tests must use injected mocked clients and deterministic fixtures. Automated tests must never make live Vercel requests.

### 3.10 Maintained OpenAPI schemas

`docs/openapi/zoro-action.yaml` currently declares 27 operations: 15 context operations and 12 GitHub operations. `scripts/validate-github-gateway-release.js` asserts the operation count, unique operation IDs, production server URL, required GitHub operations, and bearer authentication.

The approved Vercel specification selects a dedicated schema:

```text
docs/openapi/zoro-vercel-action.yaml
```

This plan preserves that decision.

## 4. Target architecture and request flow

### 4.1 Request flow

```text
Zoro request
  -> shared security headers, CORS, correlation ID, request logger, query limits
  -> /api/v1 rate limiter and allowed methods
  -> Vercel-specific JSON body limit
  -> requireVercelActionAuth
  -> validateVercel*
  -> requireVercelResourceAccess
  -> requireVercelApproval when classification requires it
  -> vercel.controller
  -> vercel.service
  -> vercelPolicy + vercelClient
  -> Vercel REST API
  -> vercelErrors translation
  -> vercel.serializer
  -> shared Context API response envelope
```

### 4.2 Dependency direction

```text
routes
  -> middleware
  -> controllers
  -> services
  -> client / policy / errors / serializers
  -> shared utilities
```

No upstream client object, token, raw response, or request body containing secret values may cross the client/service boundary into a controller response.

### 4.3 Team scope

The client must apply configured Vercel team scope internally. Callers must not be able to select an arbitrary team merely by adding a query parameter.

- Personal-account mode may omit team scope when explicitly configured.
- Team mode must use the configured `VERCEL_TEAM_ID` as the authoritative scope.
- Any future multi-team mode requires an explicit team allowlist, exact matching, and separate approval.
- `VERCEL_TEAM_SLUG` is display metadata, not an authorization key.

## 5. Scope and capability matrix

Classification meanings:

- **Read-only** — inspection only; no upstream mutation.
- **Normal write** — concrete, approved mutation that does not affect Production traffic or delete resources.
- **Production-sensitive** — changes Production deployment, configuration, variables, or traffic; requires explicit production approval.
- **Destructive** — deletes or irreversibly detaches a resource; requires global enablement, exact confirmation, allowlist match, and expected-state verification where possible.
- **Prohibited** — not exposed in the first release or excluded by specification.

| Resource area | Operation or capability | Classification | Initial delivery status |
| --- | --- | --- | --- |
| Identity | Read current user metadata | Read-only | Phase 4 |
| Teams | List/read configured or allowlisted teams | Read-only | Phase 4 |
| Teams | Invite/remove members, change roles, delete team | Prohibited | Never in this specification |
| Projects | List/read projects and safe settings | Read-only | Phase 4 |
| Projects | Create project | Normal write | Phase 7 |
| Projects | Connect approved Git repository | Normal write | Phase 7 |
| Projects | Update non-production settings | Normal write | Phase 7 |
| Projects | Change production branch, framework, build/install commands, output directory, or root directory for a production project | Production-sensitive | Phase 10 |
| Projects | Pause/unpause non-production project | Normal write | Phase 7, only if confirmed upstream |
| Projects | Pause/unpause production project | Production-sensitive | Phase 10, only if confirmed upstream |
| Projects | Delete project | Destructive | Phase 10 |
| Deployments | List/read status and metadata | Read-only | Phase 4 |
| Deployment diagnostics | Read bounded events, files, and redacted logs | Read-only | Phase 5 |
| Deployments | Create Git-connected Preview deployment | Normal write | Phase 6 |
| Deployments | Create Production deployment | Production-sensitive | Phase 10 |
| Deployments | Cancel non-production deployment | Normal write | Phase 6 |
| Deployments | Cancel production-targeted deployment | Production-sensitive | Phase 10 |
| Deployments | Promote to Production | Production-sensitive | Phase 10 |
| Deployments | Roll back Production | Production-sensitive | Phase 10 |
| Deployments | Delete deployment | Destructive | Phase 10 |
| Deployments | Direct file-upload deployment | Prohibited | First release |
| Environment variables | List metadata without decrypted values | Read-only | Phase 4 |
| Environment variables | Create/update Development or Preview variable | Normal write | Phase 8 |
| Environment variables | Create/update Production variable | Production-sensitive | Phase 10 |
| Environment variables | Delete variable | Destructive | Phase 10 |
| Environment variables | Retrieve decrypted value | Prohibited | Never in this specification |
| Project domains | List/read domain metadata | Read-only | Phase 4 |
| Project domains | Add approved domain without moving production traffic | Normal write | Phase 9 |
| Project domains | Verify, redirect, move, or update production domain | Production-sensitive | Phase 10 |
| Project domains | Remove domain | Destructive | Phase 10 |
| Account domains | List/read/configuration inspection | Read-only | Phase 4 |
| Account domains | Add/update domain | Production-sensitive | Disabled until Phase 9/10 policy and tests pass |
| Account domains | Remove domain | Destructive | Phase 10 |
| DNS | List DNS metadata | Read-only | Phase 4 |
| DNS | Create/update approved record | Production-sensitive | Disabled until Phase 9/10 policy and tests pass |
| DNS | Delete record | Destructive | Phase 10 |
| Aliases | List/read aliases | Read-only | Phase 4 |
| Aliases | Create preview/non-production alias | Normal write | Phase 9 |
| Aliases | Create/update alias affecting Production traffic | Production-sensitive | Phase 10 |
| Aliases | Remove alias | Destructive | Phase 10 |
| Git linkage | Inspect Git repository linkage | Read-only | Phase 4 |
| Git linkage | Link approved `owner/repo` | Normal write | Phase 7 |
| Git linkage | Broaden GitHub App permissions or create repositories | Prohibited | Separate GitHub authority required |
| Account administration | Billing, invoices, marketplace, tokens, certificates/private keys, transfers, firewall/protection bypass | Prohibited | Never in this specification |
| Generic access | Caller-controlled Vercel method, path, URL, or arbitrary proxy | Prohibited | Never |

## 6. Security and approval model

### 6.1 Credentials

#### Zoro to Context API

Every `/api/v1/vercel` route requires:

```http
Authorization: Bearer <ZORO_VERCEL_API_KEY>
```

Requirements:

- separate from `ZORO_GITHUB_API_KEY`;
- minimum 32 characters;
- constant-time comparison using fixed-width digests;
- deny all requests when unconfigured;
- never log, echo, persist, or attach the credential to `req`;
- return `401 AUTHENTICATION_REQUIRED` for missing, malformed, empty, or invalid credentials.

#### Context API to Vercel

The server sends:

```http
Authorization: Bearer <VERCEL_TOKEN>
```

Requirements:

- configured only through Heroku or local environment;
- never committed, logged, returned, or included in error details;
- narrowest practical account/team scope;
- documented expiration, rotation, and revocation procedure;
- no caller override of the upstream authorization header.

### 6.2 Required environment variables

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

Implementation rules:

- all required Vercel configuration is mandatory in production when the namespace is enabled;
- partial local configuration is rejected rather than ignored;
- empty allowlists mean the exact behavior approved in the specification and must be documented explicitly;
- lists are trimmed, deduplicated, and normalized;
- project IDs are authoritative over names;
- repositories use normalized `owner/repo`;
- domains use lower-case normalized DNS names;
- malformed booleans are rejected rather than coerced;
- validation failures name variable keys only.

**Open question:** the specification does not define a separate `VERCEL_GATEWAY_ENABLED` flag. Implementation must decide whether gateway enablement is inferred from any Vercel variable being present, mirrors the GitHub production-required behavior, or uses a new explicit flag. Adding a new flag requires approval because it changes configuration semantics.

### 6.3 Resource access policy

`requireVercelResourceAccess` and `vercelPolicy` must enforce:

- configured team scope;
- project allowlist by immutable ID and optionally normalized name;
- repository allowlist for project creation/linkage;
- domain allowlist by exact domain or an explicitly documented subdomain syntax;
- deny-by-default writes when an applicable allowlist exists and no match is found;
- no inferred wildcard behavior;
- duplicate or ambiguous project names rejected before mutation;
- expected-state checks before destructive or production-sensitive operations where upstream evidence is available.

### 6.4 Preview default

Deployment creation defaults to:

```json
{ "target": "preview" }
```

Omitting `target` must never create or promote Production. Supplying `target: "production"` requires a valid production approval object.

### 6.5 Production approval

Production-sensitive requests must include:

```json
{
  "approval": {
    "confirmed": true,
    "scope": "production",
    "reason": "User explicitly approved the named production effect",
    "requestReference": "optional durable reference"
  }
}
```

Server enforcement must verify:

- `confirmed` is exactly `true`;
- `scope` is exactly `production`;
- reason is non-empty and bounded;
- the approved project/resource matches the request;
- the requested effect is represented in the validated operation classification;
- approval evidence is not accepted from query strings;
- absence, mismatch, or ambiguity returns `409 VERCEL_APPROVAL_REQUIRED` before any upstream mutation.

**Recommendation:** include normalized `resourceType`, `resourceId`, and `operation` in the approval schema so the server can match approval evidence to the exact mutation. This is stricter than the minimum example and should be confirmed during Phase 0 before implementation.

### 6.6 Destructive confirmation

Destructive requests require all of:

1. explicit user authority naming the exact resource;
2. `VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS=true`;
3. applicable resource allowlist match;
4. confirmation object with exact type, identifier, expected state/name, and bounded reason;
5. current-state read before mutation;
6. optimistic concurrency or equivalent upstream precondition where supported.

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

No bulk-delete endpoint is permitted. Vague instructions do not satisfy confirmation.

### 6.7 Environment-variable secrecy

The gateway may return only:

- variable ID;
- key;
- type;
- target environments;
- branch-target metadata;
- timestamps;
- whether a value is configured.

It must never return:

- decrypted values;
- encrypted values intended for later decryption;
- supplied values after create/update;
- raw upstream errors that may echo values;
- request bodies in logs or error output.

Values may exist only long enough to construct the authenticated upstream request. They must not be stored in MongoDB, caches, files, logs, traces, snapshots, fixtures, or response objects.

### 6.8 Idempotency and concurrency

Implementation must use the strongest available mechanism per resource:

- duplicate detection before project, alias, domain, DNS, and environment-variable creation;
- caller-supplied idempotency key when Vercel supports it;
- expected project/deployment/domain/record state for production-sensitive and destructive actions;
- current production deployment ID before promote or rollback;
- no automatic destructive retry after `409`, `412`, timeout, or ambiguous network failure;
- safe re-read and reconciliation after an uncertain upstream result.

### 6.9 Failure-closed rules

No upstream call may occur when:

- bearer authentication fails;
- environment configuration is missing or invalid;
- request validation fails;
- resource allowlist fails;
- Production approval is absent or mismatched;
- destructive operations are disabled;
- destructive confirmation is absent or stale;
- an operation is not explicitly implemented and classified;
- team/project name resolution is ambiguous.

## 7. Proposed API surface

All routes are under `/api/v1/vercel`. Operation IDs are recommendations and must remain unique and stable once published.

Common errors across protected routes:

- `400 VERCEL_VALIDATION_ERROR` or shared validation error;
- `401 AUTHENTICATION_REQUIRED`;
- `403 VERCEL_FORBIDDEN` or `VERCEL_RESOURCE_NOT_ALLOWED`;
- `404 VERCEL_NOT_FOUND`;
- `409 VERCEL_CONFLICT` or `VERCEL_APPROVAL_REQUIRED`;
- `412 VERCEL_PRECONDITION_FAILED`;
- `429 VERCEL_RATE_LIMITED`;
- `502 VERCEL_UPSTREAM_ERROR`;
- `504 VERCEL_TIMEOUT`.

### 7.1 Identity and teams

| Method | Route | Operation ID | Purpose and request | Class | Success | Approval |
| --- | --- | --- | --- | --- | ---: | --- |
| GET | `/user` | `getVercelUser` | Read normalized current-user metadata. No body. | Read-only | 200 | Clear inspection request |
| GET | `/teams` | `listVercelTeams` | List configured/allowlisted teams with bounded pagination. | Read-only | 200 | Clear inspection request |
| GET | `/teams/:teamId` | `getVercelTeam` | Read one team after configured-scope validation. | Read-only | 200 | Clear inspection request |

Specific errors: team not allowed `403`; unknown team `404`; pagination validation `400`.

### 7.2 Projects

| Method | Route | Operation ID | Purpose and request | Class | Success | Approval |
| --- | --- | --- | --- | --- | ---: | --- |
| GET | `/projects` | `listVercelProjects` | List normalized projects; query supports bounded pagination and safe filters. | Read-only | 200 | Inspection |
| POST | `/projects` | `createVercelProject` | Create a bounded project definition; optional approved Git linkage and non-production settings. | Normal write | 201 | Concrete project creation |
| GET | `/projects/:projectIdOrName` | `getVercelProject` | Read project, safe build settings, Git linkage, and current deployment metadata. | Read-only | 200 | Inspection |
| PATCH | `/projects/:projectIdOrName` | `updateVercelProject` | Patch an allowlisted field set. Classification is derived from fields and current production use. | Normal or Production-sensitive | 200 | Concrete mutation; production approval for production-affecting fields |
| DELETE | `/projects/:projectIdOrName` | `deleteVercelProject` | Delete exact project after current-state match. | Destructive | 200 | Exact destructive confirmation and global enablement |
| POST | `/projects/:projectIdOrName/pause` | `pauseVercelProject` | Pause project only if current upstream contract supports it. | Normal or Production-sensitive | 200 | Concrete request; production approval when serving Production |
| POST | `/projects/:projectIdOrName/unpause` | `unpauseVercelProject` | Unpause project only if current upstream contract supports it. | Normal or Production-sensitive | 200 | Concrete request; production approval when serving Production |

Create/update body fields must be explicitly allowlisted and may include project name, framework enum, build/install/output/root settings, production branch, and Git repository reference only when approved. Unsupported upstream properties are rejected.

Specific errors: ambiguous name `409`; duplicate project `409`; repository not allowed `403`; unsupported setting `422`; stale expected state `412`.

### 7.3 Deployments and diagnostics

| Method | Route | Operation ID | Purpose and request | Class | Success | Approval |
| --- | --- | --- | --- | --- | ---: | --- |
| GET | `/deployments` | `listVercelDeployments` | List deployments with bounded project, state, target, time, and cursor filters. | Read-only | 200 | Inspection |
| POST | `/deployments` | `createVercelDeployment` | Create Git-connected deployment. `target` defaults to `preview`; include project/repository/branch/ref fields supported by current API. | Normal or Production-sensitive | 201 | Concrete Preview request; production approval for Production target |
| GET | `/deployments/:deploymentIdOrUrl` | `getVercelDeployment` | Read normalized deployment state, target, URL, timing, and Git metadata. | Read-only | 200 | Inspection |
| PATCH | `/deployments/:deploymentId/cancel` | `cancelVercelDeployment` | Cancel an active deployment after current-state read. | Normal or Production-sensitive | 200 | Concrete request; production approval when production-targeted |
| DELETE | `/deployments/:deploymentId` | `deleteVercelDeployment` | Delete exact deployment after expected-state confirmation. | Destructive | 200 | Exact destructive confirmation and global enablement |
| GET | `/deployments/:deploymentId/events` | `getVercelDeploymentEvents` | Return bounded normalized deployment events. | Read-only | 200 | Inspection |
| GET | `/deployments/:deploymentId/files` | `listVercelDeploymentFiles` | Return bounded file metadata, never arbitrary file content unless separately approved. | Read-only | 200 | Inspection |
| GET | `/deployments/:deploymentId/logs` | `getVercelDeploymentLogs` | Return bounded, truncated, redacted logs for a validated window/cursor. | Read-only | 200 | Inspection; diagnostic sensitivity acknowledged |
| POST | `/deployments/:deploymentId/promote` | `promoteVercelDeployment` | Promote exact ready deployment to Production after current production read. | Production-sensitive | 200 | Explicit production approval naming project and deployment |
| POST | `/projects/:projectIdOrName/rollback` | `rollbackVercelProject` | Roll back to an explicitly selected prior deployment or approved upstream recovery target. | Production-sensitive | 200 | Explicit production approval and expected current production ID |

Normalized deployment states are `queued`, `building`, `ready`, `failed`, `canceled`, and `unknown`. Create returns initial state and URL; callers poll the read endpoint at a bounded interval and stop on terminal state.

Specific errors: target not approved `409`; deployment not ready `409`; stale current production `412`; unsupported upstream promotion/rollback contract `422`; log window too large `400`.

### 7.4 Environment-variable metadata and mutations

| Method | Route | Operation ID | Purpose and request | Class | Success | Approval |
| --- | --- | --- | --- | --- | ---: | --- |
| GET | `/projects/:projectIdOrName/environment-variables` | `listVercelEnvironmentVariables` | List metadata only; never decrypted values. | Read-only | 200 | Inspection |
| POST | `/projects/:projectIdOrName/environment-variables` | `createVercelEnvironmentVariable` | Create one variable with key, immediate value, type, targets, and optional branch targeting. | Normal or Production-sensitive | 201 | Concrete Preview/Development write; production approval for Production target |
| PATCH | `/projects/:projectIdOrName/environment-variables/:variableId` | `updateVercelEnvironmentVariable` | Update metadata and optionally replace immediate value without echoing it. | Normal or Production-sensitive | 200 | Concrete Preview/Development write; production approval for Production target |
| DELETE | `/projects/:projectIdOrName/environment-variables/:variableId` | `deleteVercelEnvironmentVariable` | Delete exact variable after metadata re-read and confirmation. | Destructive | 200 | Exact destructive confirmation and global enablement |

Specific errors: duplicate key/target conflict `409`; invalid target/type `400`; value in query `400`; attempted decrypted read `404` or `422` because no such route exists.

### 7.5 Project domains

| Method | Route | Operation ID | Purpose and request | Class | Success | Approval |
| --- | --- | --- | --- | --- | ---: | --- |
| GET | `/projects/:projectIdOrName/domains` | `listVercelProjectDomains` | List normalized project-domain metadata. | Read-only | 200 | Inspection |
| POST | `/projects/:projectIdOrName/domains` | `addVercelProjectDomain` | Add allowlisted domain without moving Production traffic by default. | Normal or Production-sensitive | 201 | Concrete add; production approval when traffic or production assignment changes |
| GET | `/projects/:projectIdOrName/domains/:domain` | `getVercelProjectDomain` | Read one project-domain configuration. | Read-only | 200 | Inspection |
| POST | `/projects/:projectIdOrName/domains/:domain/verify` | `verifyVercelProjectDomain` | Trigger supported verification flow. | Production-sensitive when production domain | 200 | Explicit approval naming domain and effect |
| PATCH | `/projects/:projectIdOrName/domains/:domain` | `updateVercelProjectDomain` | Update redirect/assignment fields from an explicit allowlist. | Production-sensitive | 200 | Explicit production approval |
| DELETE | `/projects/:projectIdOrName/domains/:domain` | `removeVercelProjectDomain` | Remove exact project-domain association. | Destructive | 200 | Exact destructive confirmation and global enablement |

Specific errors: domain not allowlisted `403`; already assigned/conflict `409`; verification prerequisite `409`; stale expected project/domain state `412`.

### 7.6 Account domains and DNS

Account-domain and DNS mutations remain disabled until their policy and test coverage have passed independent verification.

| Method | Route | Operation ID | Purpose and request | Class | Success | Approval |
| --- | --- | --- | --- | --- | ---: | --- |
| GET | `/domains` | `listVercelDomains` | List allowlisted account-domain metadata. | Read-only | 200 | Inspection |
| GET | `/domains/:domain` | `getVercelDomain` | Read account-domain metadata. | Read-only | 200 | Inspection |
| GET | `/domains/:domain/configuration` | `getVercelDomainConfiguration` | Read normalized configuration and verification requirements. | Read-only | 200 | Inspection |
| POST | `/domains` | `addVercelDomain` | Add allowlisted account domain only after mutation phase activation. | Production-sensitive | 201 | Explicit production approval |
| PATCH | `/domains/:domain` | `updateVercelDomain` | Patch explicitly supported account-domain settings. | Production-sensitive | 200 | Explicit production approval |
| DELETE | `/domains/:domain` | `removeVercelDomain` | Remove exact account domain. | Destructive | 200 | Exact destructive confirmation and global enablement |
| GET | `/domains/:domain/dns-records` | `listVercelDnsRecords` | List bounded DNS record metadata. | Read-only | 200 | Inspection |
| POST | `/domains/:domain/dns-records` | `createVercelDnsRecord` | Create one allowlisted, typed DNS record. | Production-sensitive | 201 | Explicit production approval |
| PATCH | `/domains/:domain/dns-records/:recordId` | `updateVercelDnsRecord` | Update one record after expected-state read. | Production-sensitive | 200 | Explicit production approval |
| DELETE | `/domains/:domain/dns-records/:recordId` | `deleteVercelDnsRecord` | Delete one exact DNS record. | Destructive | 200 | Exact destructive confirmation and global enablement |

Specific errors: unsupported record type `400`; domain/record not allowed `403`; duplicate record `409`; stale expected record `412`; account-domain mutation phase disabled `422`.

### 7.7 Aliases

| Method | Route | Operation ID | Purpose and request | Class | Success | Approval |
| --- | --- | --- | --- | --- | ---: | --- |
| GET | `/aliases` | `listVercelAliases` | List aliases with bounded deployment/project filters. | Read-only | 200 | Inspection |
| POST | `/aliases` | `createVercelAlias` | Assign an allowlisted alias to an exact deployment. | Normal or Production-sensitive | 201 | Concrete request; production approval when alias serves Production |
| GET | `/aliases/:aliasIdOrName` | `getVercelAlias` | Read one normalized alias. | Read-only | 200 | Inspection |
| DELETE | `/aliases/:aliasIdOrName` | `deleteVercelAlias` | Remove exact alias after current assignment read. | Destructive | 200 | Exact destructive confirmation and global enablement |

Specific errors: alias/domain not allowed `403`; alias conflict `409`; stale deployment/assignment `412`.

## 8. File-level implementation map

No file in this section is changed by this planning commit. These are proposed implementation responsibilities.

### 8.1 New source files

| File | Responsibility |
| --- | --- |
| `src/controllers/vercel.controller.js` | Thin operation handlers: read `req.validated`, call one service method, return shared resource or paged envelopes. |
| `src/middleware/requireVercelActionAuth.js` | Dedicated bearer authentication using fixed-width timing-safe comparison; fail closed; never retain token. |
| `src/middleware/requireVercelResourceAccess.js` | Enforce configured team/project/repository/domain scope after validation and before service execution. |
| `src/middleware/requireVercelApproval.js` | Enforce operation classification, production approval, destructive global flag, exact confirmation, and expected-state requirements. |
| `src/middleware/validateVercel.js` | Apply named query/body/param schemas and merge normalized values into `req.validated`. |
| `src/routes/v1/vercel.js` | Register only implemented routes, order middleware, and terminate unknown Vercel subpaths with a local 404. |
| `src/services/vercelClient.js` | Authenticated `fetch` wrapper, team scope, timeouts, JSON parsing, safe metadata, dependency injection, and no raw-body exposure. |
| `src/services/vercel.service.js` | Orchestrate policy, duplicate/current-state checks, client calls, polling metadata, and serialization. |
| `src/services/vercelPolicy.js` | Pure normalization, classification, allowlist, approval, confirmation, expected-state, log-redaction, and Preview-default rules. |
| `src/services/vercelErrors.js` | Translate network, timeout, malformed response, upstream status, rate-limit, auth, conflict, and precondition failures into safe `AppError` instances. |
| `src/serializers/vercel.serializer.js` | Explicit field allowlists for user, team, project, deployment, event/log, environment metadata, domains, DNS, aliases, and cursors. |
| `src/validation/vercel.schemas.js` | Operation-specific schemas with unknown-field rejection, bounds, enums, normalized identifiers, and approval/confirmation objects. |

### 8.2 New test and fixture files

| File | Responsibility |
| --- | --- |
| `tests/helpers/vercelFixtures.js` | Non-secret deterministic upstream fixtures, test config, auth header helper, IDs, cursors, errors, and status variants. |
| `tests/unit/vercelEnv.test.js` | Configuration parsing, partial/missing config, secret-safe failures, allowlist normalization, and destructive flag. |
| `tests/unit/vercelAuth.test.js` | Bearer parsing, constant-time comparison behavior, failure-closed config, and no credential leakage. |
| `tests/unit/vercelPolicy.test.js` | Operation classification, allowlists, Preview defaults, approval and confirmation matching, normalization, concurrency rules, and prohibited capabilities. |
| `tests/unit/vercelClient.test.js` | Headers, team scoping, URL construction, timeout, JSON handling, dependency injection, no caller-controlled upstream URL, and safe logs. |
| `tests/unit/vercelErrorTranslation.test.js` | `400`, `401`, `403`, `404`, `409`, `412`, `429`, `5xx`, timeout, network, and malformed-response translation. |
| `tests/unit/vercelSerializer.test.js` | Field allowlists, status normalization, cursor metadata, and exclusion of tokens, raw objects, secret values, and unsafe logs. |
| `tests/unit/vercelService.test.js` | Resource workflows, duplicate detection, state checks, Preview defaults, production/destructive denials, promotion/rollback verification, and no-upstream-after-denial. |
| `tests/integration/vercelRoutes.test.js` | Route registration, authentication, validation, classification, status codes, envelopes, correlation IDs, and service-boundary calls. |
| `tests/integration/vercelBodyLimit.test.js` | Namespace body-size enforcement, including safe handling of environment-value requests. |
| `tests/integration/vercelDatabaseIndependence.test.js` | Request-time Vercel access bypasses `requireDatabase`; context routes retain existing behavior. |
| `tests/integration/vercelProductionRouteRegistration.test.js` | Production-mode app exposes only the implemented and documented route set. |
| `tests/integration/vercelRateLimit.test.js` | Shared and lower production/destructive limits, safe `429`, and no upstream call after limit. |
| `tests/integration/vercelSecretRedaction.test.js` | Authorization, environment values, upstream payloads, and diagnostic logs are absent from responses and captured logs. |

Test files may be combined when that improves maintainability, but every responsibility must remain covered.

### 8.3 New documentation and validation files

| File | Responsibility |
| --- | --- |
| `docs/openapi/zoro-vercel-action.yaml` | Canonical Vercel Action contract containing only implemented endpoints and a Vercel-specific bearer scheme. |
| `scripts/validate-vercel-gateway-release.js` | Validate spec/plan/schema/route alignment, operation IDs, security, production URL, approval schemas, prohibited operations, and no decrypted-value endpoint. |
| `docs/VERCEL_GATEWAY_RELEASE_CHECKLIST.md` | Optional but recommended controlled verification, deployment, Builder installation, Preview mutation, cleanup, rollback, and evidence checklist. |

### 8.4 Existing files expected to change

| File | Evidence-supported change |
| --- | --- |
| `src/app.js` | Import and mount the Vercel router before `requireDatabase`; add bounded parser and Vercel middleware; export any Vercel body-limit constant used by tests. |
| `src/config/env.js` | Add validated Vercel configuration and exports while preserving current frozen-object and secret-safe behavior. |
| `src/utils/errors.js` | Add Vercel-specific `AppError` subclasses. |
| `.env.example` | Add empty Vercel configuration placeholders and safety comments. |
| `package.json` | Add `verify:vercel-gateway` and include it in aggregate `verify`; no dependency is required when using Node 24 global `fetch`. |
| `README.md` | Document authenticated namespace, capability classifications, Preview default, approval gates, blocked decrypted values, limits, and error codes after implementation. |
| `docs/DEPLOYMENT.md` | Document safe Heroku configuration, verification, rollout, smoke-test order, rollback, and credential rotation without values. |

### 8.5 Existing files that change only if evidence requires it

| File | Change condition |
| --- | --- |
| `src/middleware/errorHandler.js` | Only if framework-level Vercel errors cannot be translated safely inside `vercelErrors.js`. |
| `src/utils/responses.js` | Only if current `sendPagedCollection` cannot express Vercel cursor metadata without inventing totals. |
| `src/utils/logger.js` | Only if Vercel log/value redaction requires shared redaction behavior rather than a Vercel-specific sanitizer. |
| `src/middleware/security.js` | Only if production/destructive per-class rate limiters cannot be configured through the current factory. |
| `src/middleware/allowedMethods.js` | Only if a required, approved HTTP method is absent; current GET/POST/PATCH/DELETE coverage appears sufficient. |
| `src/server.js` | No change under this plan. Process-level MongoDB decoupling requires separate approval. |
| `package-lock.json` | No change when no dependency is added. Change only with a separately justified dependency decision. |
| `docs/openapi/zoro-action.yaml` | No Vercel operations added; it may later be split into dedicated Context and GitHub schemas through separate schema-governance work. |

## 9. Phased delivery plan

Each phase must use an isolated branch and focused pull request unless a later instruction explicitly authorizes another workflow. A later phase cannot begin merely because code exists; its dependency and exit evidence must be satisfied.

### Phase 0 — Repository revalidation and test harness

**Objective:** confirm current `main`, current Vercel REST contracts, repository conventions, baseline verification, and deterministic fixtures.

**Dependencies:** approved specification and implementation authority.

**Tasks:**

1. Re-read `VERCEL_GATEWAY_SPEC.md` and this plan from current `main`.
2. Record the current base SHA and check for equivalent or conflicting branches/PRs.
3. Revalidate every proposed upstream operation against current official Vercel REST documentation, including request paths, API versions, team scope, pagination, status codes, idempotency, promotion, rollback, logs, pause/unpause, and deletion semantics.
4. Resolve whether project pause/unpause is available through a stable supported endpoint.
5. Resolve whether deployment files/logs APIs expose data safe for the approved serializers.
6. Record current automated test count, warnings, and baseline command output.
7. Add deterministic fixtures and an injectable fake client interface; no live network calls.
8. Confirm the initial endpoint subset for the first Action schema and current Builder operation constraints.
9. Create an operation registry mapping route, operation ID, classification, required policy, service method, serializer, and OpenAPI entry.

**Verification:**

```bash
npm ci
npm run verify
```

Also inspect:

```bash
git diff --check
git status --short
```

**Exit criteria:**

- baseline passes or pre-existing failures are recorded and separated;
- official upstream contracts are captured in implementation notes/tests;
- unresolved API behavior is either removed from the phase or recorded as an approval blocker;
- no live Vercel credential is required for tests.

### Phase 1 — Vercel configuration and client

**Objective:** create safe, testable Vercel configuration and an isolated upstream HTTP client.

**Dependencies:** Phase 0.

**Tasks:**

1. Implement Vercel environment parsing, team scope, allowlists, bearer-key minimum, and strict destructive flag.
2. Add empty `.env.example` placeholders.
3. Implement `vercelClient` with:
   - fixed `https://api.vercel.com` origin;
   - internal bearer header;
   - internal team scope;
   - operation-specific paths only;
   - `AbortController` timeout;
   - JSON content headers only when needed;
   - safe response parsing and size bounds;
   - dependency injection for tests;
   - no raw body or secret logging.
4. Implement `vercelErrors` translation.
5. Add environment, client, and error unit tests.

**Verification:**

```bash
npm test -- vercelEnv vercelClient vercelErrorTranslation
npm run lint
npm run format:check
```

**Exit criteria:**

- invalid production configuration fails at startup without exposing values;
- caller cannot control upstream origin/path outside implemented methods;
- client timeout and all required error classes are deterministic;
- tests make no network calls.

### Phase 2 — Dedicated authentication and policy enforcement

**Objective:** protect the namespace and centralize resource and approval policy before any route is enabled.

**Dependencies:** Phase 1.

**Tasks:**

1. Implement `requireVercelActionAuth` using the current GitHub fixed-width timing-safe pattern.
2. Implement normalized project/repository/domain allowlists and team scope.
3. Implement operation registry/classification.
4. Implement Preview default.
5. Implement production approval validation and resource/operation matching.
6. Implement destructive global flag and confirmation matching.
7. Implement expected-state and duplicate-detection helpers.
8. Implement Vercel-specific log redaction and truncation helpers.
9. Prove every denial happens before an upstream call.

**Verification:**

```bash
npm test -- vercelAuth vercelPolicy
```

**Exit criteria:**

- authentication, allowlist, production, destructive, and prohibited-operation denials are deterministic;
- no token or environment value appears in errors or logs;
- classification cannot be supplied or downgraded by the caller.

### Phase 3 — Route skeleton, validation, serializers, and shared integration

**Objective:** establish the namespace without yet enabling unsupported mutation groups.

**Dependencies:** Phase 2.

**Tasks:**

1. Add operation-specific validation schemas and middleware.
2. Add serializers for every Phase 4 read resource.
3. Add thin controller and route modules.
4. Mount Vercel before the database-backed router.
5. Add namespace-local 404 termination.
6. Choose a bounded Vercel body limit appropriate to configuration mutations; direct file upload remains prohibited.
7. Add production route-registration, body-limit, database-independence, and middleware-order tests.
8. Confirm existing Context API and GitHub Gateway tests remain unchanged and passing.

**Verification:**

```bash
npm test -- vercelRoutes vercelBodyLimit vercelDatabaseIndependence vercelProductionRouteRegistration
npm test -- github
```

**Exit criteria:**

- every enabled Vercel route requires authentication;
- unknown Vercel subpaths return `404`, not database errors;
- Vercel requests bypass `requireDatabase` at request time;
- public context and GitHub behavior is not regressed.

### Phase 4 — Read-only identity, team, project, deployment, and resource inventory

**Objective:** deliver a safe inventory before any mutation.

**Dependencies:** Phase 3.

**Tasks:**

1. Implement user and team reads.
2. Implement project list/read and safe Git/build metadata.
3. Implement deployment list/read.
4. Implement environment-variable metadata list without values.
5. Implement project-domain, account-domain, DNS, and alias reads.
6. Normalize pagination/cursors without inventing totals.
7. Enforce team/project/domain allowlists for reads according to approved mode.
8. Add service, serializer, route, and error tests for each resource.

**Verification:**

```bash
npm test -- vercelService vercelSerializer vercelRoutes
npm run verify
```

**Exit criteria:**

- read responses contain only explicitly serialized fields;
- no environment value or token can be retrieved;
- pagination is bounded and traceable;
- existing gateway and context verification remains green.

### Phase 5 — Deployment diagnostics

**Objective:** expose bounded events, file metadata, and redacted logs for troubleshooting.

**Dependencies:** Phase 4 and confirmed upstream contracts.

**Tasks:**

1. Implement bounded deployment-event reads.
2. Implement deployment file metadata only; do not expose arbitrary content without separate approval.
3. Implement bounded log windows/cursors, truncation, and defense-in-depth redaction.
4. Preserve timestamp, level, source, deployment ID, and safe request metadata.
5. Add malicious and accidental secret-pattern fixtures.
6. Document that redaction is not perfect secret detection.

**Verification:**

```bash
npm test -- vercelService vercelSerializer vercelSecretRedaction vercelRoutes
```

**Exit criteria:**

- unbounded streams are impossible;
- known secrets, authorization headers, cookies, connection strings, and configured environment values are absent from responses and logs;
- oversized entries are truncated deterministically.

### Phase 6 — Preview deployment creation and lifecycle management

**Objective:** create and manage Git-connected Preview deployments before Production is exposed.

**Dependencies:** Phases 4–5; approved repository allowlist; current upstream contract confirmed.

**Tasks:**

1. Implement Git-connected Preview deployment creation.
2. Default omitted target to `preview` in policy, validation, service, and OpenAPI.
3. Validate repository, branch/ref, project, and team scope.
4. Detect duplicate or ambiguous project/deployment requests.
5. Return initial ID, URL, normalized state, and polling guidance.
6. Implement bounded status polling through the read endpoint, not a held request.
7. Implement Preview cancellation.
8. Defer deployment deletion to the destructive phase.
9. Test that Production target is rejected without valid approval and is not silently downgraded.

**Verification:**

```bash
npm test -- vercelPolicy vercelService vercelRoutes
npm run verify
```

**Exit criteria:**

- Preview is the only mutation target enabled by default;
- every repository is allowlisted;
- no direct upload path exists;
- automated tests prove Production cannot be reached through omitted, malformed, or extra fields.

### Phase 7 — Project creation, Git linkage, and bounded configuration

**Objective:** create and configure approved projects without silently changing Production behavior.

**Dependencies:** Phase 6.

**Tasks:**

1. Implement duplicate project detection by ID/name and configured team.
2. Create projects from explicitly supported fields.
3. Connect only allowlisted `owner/repo` values.
4. Update only a documented field allowlist.
5. Classify production branch and production build-setting changes as Production-sensitive.
6. Implement non-production pause/unpause only if current upstream support is confirmed.
7. Return normalized project and Git metadata.

**Verification:**

```bash
npm test -- vercelPolicy vercelService vercelRoutes
```

**Exit criteria:**

- ambiguous or duplicate projects are rejected;
- GitHub permissions are not changed;
- unsupported Vercel properties are rejected;
- production-affecting fields cannot pass through the normal-write path.

### Phase 8 — Environment-variable management without disclosure

**Objective:** create and update Development/Preview variables while proving values are never returned or retained.

**Dependencies:** Phase 7 and secret-redaction coverage.

**Tasks:**

1. Implement metadata listing.
2. Implement create/update for Development and Preview targets.
3. Accept values only in authenticated JSON request bodies.
4. Ensure request logs omit bodies and error translation discards raw upstream payloads.
5. Return metadata only.
6. Add duplicate key/target handling.
7. Keep Production target approval-gated and deletion destructive.
8. Add tests using generated transient values and assertions across response, logger, errors, snapshots, and fixtures.

**Verification:**

```bash
npm test -- vercelPolicy vercelService vercelSerializer vercelSecretRedaction vercelRoutes
```

**Exit criteria:**

- values are sent upstream only through the mocked client boundary in tests;
- values never appear in responses, logs, errors, fixtures, or snapshots;
- no decrypted-value route exists.

### Phase 9 — Domain, alias, and DNS management

**Objective:** add domain and alias capability incrementally, keeping DNS mutations disabled until independently verified.

**Dependencies:** Phase 8; domain allowlist; official upstream contracts; explicit phase approval for DNS mutations.

**Tasks:**

1. Implement project-domain reads and allowlisted non-traffic-moving adds.
2. Implement domain verification only after its production classification is confirmed.
3. Implement alias reads and non-production alias creation.
4. Implement account-domain and DNS reads.
5. Add strict domain normalization and record-type schemas.
6. Add current-assignment checks before alias/domain changes.
7. Keep account-domain and DNS mutations behind policy activation until tests and independent review pass.
8. Add disposable-domain test fixtures; no live DNS mutations in automated tests.

**Verification:**

```bash
npm test -- vercelPolicy vercelService vercelSerializer vercelRoutes
npm run verify
```

**Exit criteria:**

- domain and alias operations cannot move Production traffic through the normal-write path;
- DNS mutation endpoints remain disabled until separately activated;
- all domain/repository/project allowlists are enforced before upstream calls.

### Phase 10 — Production promotion, rollback, and destructive operations

**Objective:** enable the highest-risk capabilities only after lower phases are verified.

**Dependencies:** Phases 0–9 independently verified; explicit implementation authority for Production/destructive operations; confirmed current upstream APIs.

**Tasks:**

1. Implement Production deployment target, promotion, and rollback.
2. Read and record current production deployment before mutation.
3. Require approval matching project, deployment, operation, and intended effect.
4. Verify resulting current production state before returning success.
5. Implement Production project-setting and environment-variable changes.
6. Implement production domain, alias, and DNS mutations.
7. Implement exact-resource destructive operations one resource type at a time.
8. Require global destructive flag, allowlist, current-state read, exact confirmation, and precondition.
9. Never retry ambiguous destructive failures automatically.
10. Add lower rate limits and comprehensive denial/regression tests.

**Verification:**

```bash
npm test -- vercelAuth vercelPolicy vercelService vercelRoutes vercelRateLimit vercelSecretRedaction
npm run verify
```

**Exit criteria:**

- no Production or destructive operation executes without server-verified evidence;
- stale expected state returns `412` without mutation;
- promotion/rollback success is based on confirmed resulting state, not merely an accepted request;
- each destructive operation has focused independent review.

### Phase 11 — OpenAPI Action schema strategy

**Objective:** publish an Action contract that reflects only deployed, verified routes.

**Dependencies:** the endpoint subset intended for release is implemented and repository-verified.

**Tasks:**

1. Create `docs/openapi/zoro-vercel-action.yaml` with a Vercel-specific bearer scheme referring to `ZORO_VERCEL_API_KEY`.
2. Include only implemented endpoints.
3. Preserve Preview defaults and approval/confirmation objects in schemas and descriptions.
4. State that environment values must never be retrieved or repeated.
5. Use stable unique operation IDs.
6. Add normalized response/error schemas and production server URL.
7. Add `scripts/validate-vercel-gateway-release.js`.
8. Validate route/schema parity and prohibited-operation absence.
9. Revalidate current GPT Builder limits and parsing behavior.
10. If one full schema exceeds current Builder constraints, stop for approval before splitting the dedicated Vercel contract into multiple Builder-facing schemas.

**Verification:**

```bash
npm run verify:vercel-gateway
npm run verify
```

**Exit criteria:**

- schema and implemented routes match exactly;
- operation IDs are unique;
- all operations require the Vercel bearer scheme;
- no decrypted-value, account-admin, billing, token, certificate-private-key, or generic-proxy operation exists;
- Builder installation has not yet been claimed.

### Phase 12 — Release validation, deployment, and controlled Zoro smoke testing

**Objective:** deploy an exact verified revision, configure the Action manually, and prove safe behavior in increasing risk order.

**Dependencies:** all intended release phases pass clean verification; explicit deployment and Builder-update authority; required credentials configured securely.

**Tasks:**

1. Run clean verification from a fresh checkout.
2. Record exact commit SHA, command output, and CI status.
3. Confirm Heroku configuration keys exist without printing values.
4. Deploy the exact verified revision.
5. Record Heroku release and startup evidence.
6. Perform unauthenticated and authenticated read-only API smoke tests.
7. Install the verified schema and bearer credential in GPT Builder.
8. Start a fresh Zoro conversation.
9. Perform read-only Zoro smoke tests.
10. Perform one disposable Preview deployment and bounded diagnostics test.
11. Perform disposable project/configuration tests only within explicit authority.
12. Verify cleanup and retain resource IDs, deployment IDs, URLs, correlation IDs, release ID, and commit SHA.
13. Do not test Production or destructive operations without separate explicit authorization.

**Verification:** see Section 12.

**Exit criteria:**

- exact deployed revision is known;
- startup is healthy and secret-safe;
- read-only and disposable Preview flows are confirmed through primary evidence;
- disposable resources are cleaned up or recorded as blockers;
- no broader availability claim is made than the evidence supports.

## 10. Test strategy

### 10.1 Principles

- No automated test may make a live network call.
- `vercelClient` must accept injected `fetch`, clock, and timeout behavior.
- Fixtures must contain generated or obviously non-secret values only.
- Integration tests mock `vercel.service` at the same boundary used by `githubRoutes.test.js`.
- Service tests use an injected mocked Vercel client.
- Every auth, validation, allowlist, approval, confirmation, and rate-limit denial must assert no upstream call occurred.
- Existing Context API and GitHub Gateway suites are mandatory regression coverage.

### 10.2 Unit coverage

Required unit areas:

- environment parsing and secret-safe failure messages;
- bearer authentication and unconfigured fail-closed behavior;
- team/project/repository/domain allowlist normalization and matching;
- operation classification;
- Preview default;
- production approval matching;
- destructive confirmation and global flag;
- expected-state and duplicate-detection helpers;
- domain, alias, repository, branch, DNS, environment target/type, and pagination normalization;
- deployment status normalization;
- log redaction and truncation;
- serializers and omission of unknown fields;
- client URL/header/team scope/timeout behavior;
- upstream error translation;
- environment-variable secret non-return behavior.

### 10.3 Service and contract coverage

Use mocked Vercel responses for:

- personal and team-scoped reads;
- list/read/create/update/delete paths;
- upstream cursor pagination;
- project duplicate and ambiguous-name handling;
- Git repository allowlist denial;
- Preview deployment default and lifecycle;
- Production rejection without matching approval;
- destructive rejection when globally disabled;
- destructive rejection on resource mismatch;
- stale expected state;
- promotion/rollback current-state verification;
- environment metadata and secret non-disclosure;
- domain, alias, and DNS policy;
- upstream `400`, `401`, `403`, `404`, `409`, `412`, `429`, and `5xx`;
- timeout, network failure, invalid JSON, oversized body, and unexpected shape;
- uncertain mutation result requiring reconciliation rather than retry.

Contract fixtures should capture the minimal upstream fields consumed by serializers, not full raw Vercel payloads. Phase 0 must refresh fixtures against current official documentation without importing secret-bearing live responses.

### 10.4 Integration coverage

Required integration cases:

- every route rejects missing/invalid bearer credentials;
- existing context and health routes retain their current authentication behavior;
- Vercel routes remain request-time independent of MongoDB;
- body and query limits;
- method allowlisting and local 404 behavior;
- unknown fields and invalid enums;
- correlation ID response/header behavior;
- shared and lower-risk-class rate limits;
- no service call after failed auth, validation, allowlist, approval, confirmation, or rate limit;
- resource and paged response envelopes;
- error envelope and safe details;
- production route registration contains only implemented routes.

### 10.5 Security and regression coverage

Security tests must prove:

- `ZORO_VERCEL_API_KEY` and `VERCEL_TOKEN` never appear in responses or logs;
- environment-variable values never appear in responses, logs, errors, snapshots, fixtures, or serializer output;
- caller-controlled upstream URL, method, path, authorization header, or arbitrary Vercel properties are rejected;
- decrypted environment-variable endpoints do not exist;
- account, team-member, billing, marketplace, token, certificate-private-key, protection-bypass, storage-admin, and generic-proxy operations do not exist;
- Production cannot be reached by omitted, malformed, or mismatched approval;
- destructive actions cannot be reached when disabled or stale;
- deployment logs are bounded, redacted, and truncated;
- existing Context API and GitHub Gateway tests pass unchanged.

### 10.6 OpenAPI and release validation

`verify:vercel-gateway` should confirm:

- specification, plan, route, and schema files exist;
- production server URL is correct;
- operation IDs are unique;
- every schema operation maps to an implemented route;
- every exposed Vercel route appears in the schema;
- bearer authentication applies to every operation;
- Preview is the deployment default;
- production/destructive operations require approval/confirmation schemas;
- no decrypted environment-value operation exists;
- no prohibited administration or generic proxy exists;
- operation count satisfies the current release strategy;
- documentation does not claim an undeployed capability.

### 10.7 Proposed commands

Focused development commands:

```bash
npm test -- vercelEnv
npm test -- vercelAuth
npm test -- vercelPolicy
npm test -- vercelClient
npm test -- vercelErrorTranslation
npm test -- vercelSerializer
npm test -- vercelService
npm test -- vercelRoutes
npm test -- vercelBodyLimit vercelDatabaseIndependence vercelProductionRouteRegistration
npm test -- vercelRateLimit vercelSecretRedaction
```

Release commands:

```bash
npm ci
npm run verify:vercel-gateway
npm run verify
```

Repository hygiene:

```bash
git diff --check
git status --short
git diff --stat
```

Secret scans must search only tracked repository content and must never load or print real provider configuration.

## 11. OpenAPI and GPT Action strategy

### 11.1 Current fact

The maintained `docs/openapi/zoro-action.yaml` currently contains 27 operations: 15 context and 12 GitHub. The current GitHub release validator asserts exactly 27 unique operation IDs.

The complete proposed Vercel route surface in this plan contains approximately 44 operations. Combining all Context, GitHub, and Vercel operations into the current schema would create a large contract, couple unrelated credentials, and exceed the repository-documented operation budget.

### 11.2 Approved recommendation

Use a dedicated canonical schema:

```text
docs/openapi/zoro-vercel-action.yaml
```

Benefits:

- independent `ZORO_VERCEL_API_KEY` authentication boundary;
- clearer Preview/Production/destructive descriptions;
- smaller blast radius when the Vercel contract changes;
- independent release validation and schema versioning;
- no schema drift caused by editing the existing Context/GitHub schema for Vercel;
- easier Builder troubleshooting and rollback.

### 11.3 Builder operation-limit risk

**Open question:** current GPT Builder operation-count and schema-size constraints must be revalidated during Phase 0. The approved full route surface may still be too large for one Builder Action even when isolated.

Recommended release strategy:

1. keep one canonical repository contract and operation registry;
2. publish only implemented operations;
3. deliver read-only plus Preview operations first;
4. add later groups only after Builder validation;
5. if the complete implemented Vercel surface cannot fit one Action, stop for approval before generating multiple focused Builder schemas, such as inventory/deployments and configuration/domains;
6. never maintain independent hand-edited copies without deterministic validation or generation.

Splitting the Vercel Action is a future approval decision, not an implementation assumption.

### 11.4 Builder configuration

After deployment only:

1. verify the repository schema and exact deployed revision;
2. import the dedicated Vercel schema into a separate Action configuration;
3. configure API Key authentication with Bearer transport using the securely stored `ZORO_VERCEL_API_KEY`;
4. do not place the value in YAML, chat, screenshots, documentation, or reports;
5. save Zoro and start a fresh conversation;
6. run read-only operations before any mutation;
7. retain Builder acceptance and live-operation evidence separately from repository verification.

## 12. Deployment and rollout

### 12.1 Required Heroku configuration names

Without exposing values, verify the presence and validity of:

```text
VERCEL_TOKEN
VERCEL_TEAM_ID
VERCEL_TEAM_SLUG
ZORO_VERCEL_API_KEY
VERCEL_PROJECT_ALLOWLIST
VERCEL_DOMAIN_ALLOWLIST
VERCEL_REPOSITORY_ALLOWLIST
VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS
```

For the first rollout:

```text
VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS=false
```

Production and destructive operations should remain disabled at the route/policy level until their phases pass independent verification, even when credentials exist.

### 12.2 Clean verification evidence

Before deployment, record:

- clean checkout base and head SHA;
- `npm ci` exit state;
- `npm run verify` exit state and exact output location;
- CI checks and commit association;
- changed-file list;
- schema/route operation count;
- secret-scan result without values;
- independent review outcome;
- approved deployment authority.

### 12.3 Deployment evidence

Deploy only the exact verified revision. Record:

- commit SHA;
- Heroku release identifier;
- deployment timestamp;
- startup log evidence;
- process health;
- production server URL;
- confirmation that no secret values appeared in startup output.

A successful build alone does not establish a healthy runtime or available gateway.

### 12.4 Smoke-test order

Perform in this order:

1. missing bearer returns `401`;
2. invalid bearer returns `401` without upstream call;
3. authenticated user/team/project/deployment reads;
4. bounded environment-variable metadata read and proof no values are returned;
5. bounded deployment event/log diagnostics on a non-sensitive test deployment;
6. Preview deployment creation for an allowlisted disposable branch/project;
7. poll to terminal state;
8. inspect normalized result and redacted diagnostics;
9. disposable Development/Preview variable mutation using a transient non-production value;
10. disposable domain/alias mutation only after its phase is authorized;
11. clean up disposable resources;
12. verify cleanup directly through read endpoints and Vercel primary evidence.

Production promotion, rollback, DNS mutation, and deletion require separate explicit smoke-test authority.

### 12.5 Cleanup requirements

Retain a safe record of:

- project/deployment/domain/alias/variable IDs;
- branch and repository reference;
- deployment URL;
- correlation IDs;
- creation and cleanup timestamps;
- cleanup result;
- remaining resource or billing uncertainty.

Do not retain environment-variable values or provider tokens.

### 12.6 Rollback plan

#### Application rollback

1. disable or remove the Vercel routes through a focused revert;
2. deploy the previous exact verified Context API revision;
3. confirm health, context routes, and GitHub Gateway regression behavior;
4. preserve evidence of any Vercel mutations that occurred before rollback.

#### Action rollback

1. disable/remove the Vercel Action or restore the previous verified schema;
2. save Zoro;
3. start a fresh conversation;
4. confirm Vercel operations are unavailable.

#### Credential containment

On suspected exposure:

1. revoke/rotate `ZORO_VERCEL_API_KEY` through secure Heroku and Builder interfaces;
2. revoke/rotate `VERCEL_TOKEN` through Vercel and Heroku;
3. do not reproduce old or new values in reports;
4. temporarily disable the gateway or revoke provider access when immediate isolation is required;
5. independently verify the old credentials fail and the replacement works.

#### Resource recovery

- use recorded prior production deployment for approved rollback;
- restore project/domain/DNS configuration from verified evidence, not assumptions;
- do not use bulk or destructive recovery automation without explicit authority;
- record billing or downtime impact separately.

### 12.7 Evidence required before availability claims

Do not describe the gateway as verified or available until all applicable evidence exists:

- implemented route subset;
- committed and independently reviewed revision;
- clean automated verification;
- exact deployed revision and healthy startup;
- dedicated schema installed in GPT Builder;
- fresh-conversation read-only smoke tests;
- disposable Preview mutation and cleanup evidence;
- no secret disclosure;
- documented known limits;
- durable project-state update after verification.

## 13. Risks, dependencies, and open questions

### 13.1 Dependencies

- current official Vercel REST API contracts and versions;
- a Vercel token with the narrowest required account/team scope;
- confirmed team ownership and project/domain allowlists;
- GitHub repositories already accessible and approved for Git linkage;
- a clean Context API baseline and stable existing gateway tests;
- explicit implementation, merge, deployment, Builder, Production, DNS, and destructive-operation authority at the relevant phase;
- disposable test resources with acceptable billing impact;
- independent verification before durable completion claims.

### 13.2 Risk register

| Risk | Impact | Mitigation / gate |
| --- | --- | --- |
| Vercel API version or route drift | Incorrect requests, unsafe assumptions, failed release | Phase 0 official-documentation revalidation, isolated client adapter, contract fixtures, release validator |
| Token scope broader than needed | Large account blast radius | Narrow account/team token, allowlists, expiration/rotation, independent configuration review |
| Accidental Production deployment or traffic change | Outage or unintended release | Preview default, server-enforced classification and approval, lower rate limits, separate smoke authority |
| Destructive resource deletion | Data/config loss | Global false-by-default flag, exact confirmation, current-state read, preconditions, no bulk delete, no automatic retry |
| Billing impact | Unexpected build/domain usage cost | Disposable bounded tests, explicit resource list, cleanup evidence, no paid service selection without approval |
| Environment secret exposure | Credential compromise | No decrypted reads, no value return, body-safe logging, redacted errors, generated tests, credential rotation process |
| Deployment logs contain application secrets | Sensitive data leak | Bounded windows, redaction, truncation, no persistence, documented imperfect detection, diagnostic phase gate |
| DNS/domain mutation error | Production outage or domain loss | Domain allowlist, read first, explicit production approval, mutation disabled until independently verified, rollback evidence |
| Ambiguous project names | Wrong resource mutation | Prefer immutable IDs, reject ambiguity, exact confirmation for high-risk operations |
| Promotion/rollback semantics change | Incorrect production state claim | Current-state read, official API revalidation, resulting-state confirmation, no success from accepted request alone |
| Timeout after mutation | Unknown result and duplicate action | No automatic retry, reconcile by reading current state and idempotency evidence |
| Rate limits | Failed diagnostics or repeated polling | Bounded pagination/polling, safe `429`, retry metadata, no rapid loops |
| Builder operation/schema limits | Action cannot be installed or maintained | Dedicated schema, phased operation surface, validate current limits, approved split only if needed |
| Schema drift | Zoro calls nonexistent or mismatched routes | Canonical repository schema, operation registry, route/schema validator, exact deployed revision |
| Process-level MongoDB startup dependency | Vercel unavailable when database prevents startup | Document limitation; separate architecture approval required to decouple process startup |
| Project transfer or team restrictions | Unsupported operation or ownership conflict | Treat transfers as prohibited; confirm team scope; stop on ownership mismatch |

### 13.3 Open questions requiring implementation-time resolution

1. What exact Vercel REST API versions and paths apply to each operation at implementation time?
2. Does current Vercel API support project pause/unpause with stable semantics suitable for this gateway?
3. What are the precise promotion and rollback contracts, and how is resulting Production state confirmed?
4. Which deployment event/log APIs are available for the token/team scope, and what pagination/window constraints apply?
5. Does the deployment file endpoint expose content or metadata, and should the first release expose only metadata?
6. Which mutation endpoints support idempotency keys, ETags, expected versions, or equivalent preconditions?
7. Is personal-account mode required, team-scoped mode required, or must both be supported?
8. Should an explicit `VERCEL_GATEWAY_ENABLED` variable be added, or should enablement mirror current GitHub configuration behavior?
9. Should project reads be broader than writes when allowlists are configured?
10. What exact subdomain allowlist syntax, if any, is approved?
11. Which DNS record types and fields are safe in the first mutation release?
12. Are account-domain and DNS mutations needed in the first operational release, or should they remain read-only longer?
13. What current GPT Builder operation and schema-size limits apply to the dedicated Vercel Action?
14. If one Action cannot contain the approved implemented surface, is a generated multi-Action split approved?
15. What disposable Vercel team/project/domain resources can be used without cost or production impact?
16. Who independently verifies Production and destructive phases, and what exact evidence is required before activation?

## 14. Definition of done and state model

The Vercel Gateway must be reported through distinct states. No later state may be inferred from an earlier one.

| State | Required evidence | Must not imply |
| --- | --- | --- |
| **Planned** | Approved specification and implementation-ready plan exist. | Source code, tests, credentials, routes, deployment, or Action exist. |
| **Implemented** | Scoped source/tests/docs exist on an isolated branch and match approved operation subset. | Tests pass, commit exists, merge, deployment, or runtime behavior. |
| **Committed** | Exact commit SHA and changed-file list exist. | Independent verification, merge, deployment, or Action availability. |
| **Repository-verified** | Clean `npm ci`, focused tests, `npm run verify`, CI, diff review, secret review, and independent evidence pass for exact SHA. | Deployment or live provider behavior. |
| **Merged** | Verified commit is integrated into `main` with merge evidence and no unreviewed changes. | Heroku deployment or Builder configuration. |
| **Deployed** | Exact merged revision is in a recorded Heroku release with healthy startup evidence. | Action installed or end-to-end Zoro success. |
| **Configured in GPT Builder** | Dedicated verified schema and bearer authentication are saved; fresh conversation started. | Live operations work or provider mutations are correct. |
| **Smoke-tested** | Read-only tests and authorized disposable Preview mutation/cleanup succeed through Zoro and primary Vercel evidence. | Production or destructive behavior is verified. |
| **Production-verified** | Separately authorized production operation succeeds, resulting state is independently confirmed, and rollback evidence exists. | All destructive operations are safe. |
| **Independently verified** | An independent reviewer matches repository, CI, deployment, Builder, Vercel, security, and cleanup evidence to acceptance criteria. | Unimplemented future operation groups. |
| **Operationally available** | Approved operation subset is documented, deployed, configured, smoke-tested, monitored, supportable, and bounded by known limitations. | Unlimited Vercel account access or completion of prohibited capabilities. |

### 14.1 Completion criteria for the approved operation subset

The released subset is done only when:

- every exposed route is authenticated;
- team/project/repository/domain policies are enforced;
- Preview is the deployment default;
- Production and destructive operations enforce the approved server-side controls;
- no decrypted environment-variable value can be retrieved;
- no token, environment value, or unsafe log content appears in responses or logs;
- controllers remain thin and upstream calls stay inside `vercelClient`;
- serializers expose only documented fields;
- errors use stable safe codes and correlation IDs;
- all new and existing tests, lint, formatting, release validation, and CI pass for the exact revision;
- the exact verified revision is deployed and healthy;
- the dedicated Action schema is installed in GPT Builder;
- fresh-conversation read-only and disposable Preview smoke tests pass;
- disposable resources are cleaned up;
- production behavior is not claimed without separate evidence;
- durable project records are updated only after independent verification.

### 14.2 Completion report requirements

A final delivery report must include:

- originating authority and approved operation subset;
- base, implementation, merge, and deployed SHAs;
- changed files and dependencies;
- test files and exact command outcomes;
- CI/check evidence;
- Heroku release and startup evidence;
- Action schema path, version, operation count, and Builder evidence;
- smoke-test resource IDs, deployment URLs, correlation IDs, and cleanup status;
- verification performed and not performed;
- security review and secret-handling result;
- known limits, risks, assumptions, and open questions;
- Production/destructive capabilities explicitly enabled or still disabled;
- exact independent verifier and decision;
- next action.

## 15. Recommended next action

Create a governed implementation task for **Phase 0 only**: revalidate current Context API `main`, run a clean baseline, confirm current official Vercel contracts and Builder limits, establish deterministic fixtures and the operation registry, and return any specification conflicts or approval questions before runtime source changes begin.

Do not start Production, DNS mutation, destructive operation, deployment, or live GPT Builder work from this plan alone.
