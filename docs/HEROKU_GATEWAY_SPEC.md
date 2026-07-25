# Context API — Full Heroku Gateway Technical Specification

**Version:** 1.0  
**Status:** Approved for full implementation  
**Owner:** Kofi  
**Target implementation branch:** separate feature branch created from current `main`  
**Documentation branch:** `main`  
**Last updated:** 2026-07-24  
**Authority:** Kofi's explicit instruction to specify and fully implement the Heroku Gateway

## 1. Purpose

Extend Context API with a comprehensive, authenticated Heroku Platform API gateway so Zoro can inspect, operate, deploy, scale, configure, diagnose, and administer approved Heroku resources through normalized Context API endpoints.

The desired request path is:

```text
Kofi
  -> Zoro
  -> Bearer-authenticated Context API Heroku Gateway
  -> Heroku Platform API v3
  -> normalized, redacted response with correlation and upstream request evidence
```

This feature is a complete implementation, not a read-only prototype or phased subset. Every endpoint classified as `required` in this specification must be implemented, tested, documented, represented in the maintained Heroku OpenAPI schema, release-validated, deployed, smoke-tested, and reported with evidence before the feature is described as complete.

## 2. Current System Context

Context API currently uses:

- Node.js 24 and CommonJS;
- Express 5 application factory and route modules;
- MongoDB and Mongoose for context-domain persistence;
- provider-specific gateways for GitHub and Vercel;
- dedicated Bearer authentication per provider;
- explicit environment validation;
- provider policy middleware and resource allowlisting;
- validation middleware, thin controllers, service/client separation, serializers, centralized errors, safe logging, rate limiting, and correlation IDs;
- Jest and Supertest tests;
- provider-specific release validation included in `npm run verify`;
- deployment on Heroku.

The Heroku Gateway must follow these conventions and preserve all existing Context API, GitHub Gateway, and Vercel Gateway behavior.

## 3. Authoritative Upstream Contract

The gateway targets Heroku Platform API v3:

```text
Base URL: https://api.heroku.com
Accept: application/vnd.heroku+json; version=3
Authorization: Bearer <HEROKU_API_TOKEN>
Content-Type: application/json
User-Agent: context-api-heroku-gateway/<version>
```

Implementation must use the current official Heroku Platform API reference and machine-readable schema as upstream authority. During implementation, Zoro must revalidate exact paths, request fields, response fields, stability levels, entitlements, and deprecated resources against the current official schema.

Heroku resource IDs should be preferred over names where ambiguity matters. Human-readable names may be accepted when the upstream API supports them.

## 4. Goals

1. Add a separately authenticated Heroku surface beneath `/api/v1/heroku`.
2. Support comprehensive Heroku account, application, runtime, deployment, configuration, networking, add-on, pipeline, review-app, webhook, team, and eligible Private Space operations.
3. Preserve upstream authorization: Context API must never elevate beyond the Heroku token's actual permissions.
4. Normalize upstream responses and errors without exposing tokens, secrets, private keys, raw config values, or unsafe upstream payloads.
5. Apply app, team, pipeline, space, domain, plan, dyno-size, and operation policy controls.
6. Require explicit approval evidence for destructive, production-sensitive, billing-sensitive, identity/access, and self-management operations.
7. Use ETag/`If-Match` optimistic concurrency for mutable resources wherever Heroku supports it.
8. Return Heroku `Request-Id`, ETag, rate-limit information, and asynchronous operation state as safe metadata.
9. Provide deterministic automated tests with no live Heroku calls.
10. Provide a separate GPT Action schema because the existing combined Action operation budget is already constrained.
11. Fully deploy and smoke-test the gateway using disposable or approved resources before completion.

## 5. Non-Goals and Prohibited Operations

The following are prohibited even under “full access” unless a later explicit specification changes the policy:

- returning the raw `HEROKU_API_TOKEN` or `ZORO_HEROKU_API_KEY`;
- returning unredacted config-var values;
- creating, listing, updating, or deleting OAuth clients, grants, authorizations, or tokens;
- exposing account API keys, passwords, SSH private keys, or credential artifacts;
- disabling the gateway's own authentication;
- removing or overwriting required gateway credentials;
- scaling the Context API app to zero;
- deleting the Context API app;
- deleting the last running Context API web dyno;
- unrestricted execution of arbitrary one-off shell commands;
- silently purchasing, upgrading, or provisioning paid resources;
- silently transferring app, team, pipeline, or space ownership;
- bypassing Heroku account, team, billing, app, pipeline, or Private Space permissions;
- claiming completion without deployment and controlled live verification.

Arbitrary one-off dyno commands are excluded from the public GPT Action. A future narrowly approved command allowlist may expose specific maintenance commands.

## 6. High-Level Architecture

```text
Zoro Custom GPT
  |
  | Authorization: Bearer <ZORO_HEROKU_API_KEY>
  v
Context API
  |- existing context routes
  |- /api/v1/github/*
  |- /api/v1/vercel/*
  `- /api/v1/heroku/*
       |- route-specific JSON parser
       |- Heroku bearer authentication
       |- request validation
       |- resource allowlist and policy enforcement
       |- approval-evidence enforcement
       |- thin controller
       |- Heroku service
       |- normalized serializer and error translator
       `- Heroku client
            |
            | Authorization: Bearer <HEROKU_API_TOKEN>
            v
        Heroku Platform API v3
```

The gateway routes must bypass request-time MongoDB availability like existing provider gateways. The current process still connects to MongoDB before binding; changing process-level startup coupling is outside this feature unless implementation discovers it is required for safe self-management.

## 7. Environment Configuration

### 7.1 Required production variables

```env
HEROKU_API_TOKEN=
ZORO_HEROKU_API_KEY=
HEROKU_RESOURCE_ACCESS=allowlist
HEROKU_APP_ALLOWLIST=
HEROKU_TEAM_ALLOWLIST=
HEROKU_PIPELINE_ALLOWLIST=
HEROKU_SPACE_ALLOWLIST=
HEROKU_DOMAIN_SUFFIX_ALLOWLIST=
HEROKU_ADDON_PLAN_ALLOWLIST=
HEROKU_DYNO_SIZE_ALLOWLIST=
HEROKU_SELF_APP=
HEROKU_MUTATIONS_ENABLED=true
HEROKU_DESTRUCTIVE_OPERATIONS_ENABLED=true
HEROKU_BILLING_OPERATIONS_ENABLED=false
HEROKU_ACCESS_ADMIN_OPERATIONS_ENABLED=false
HEROKU_PRIVATE_SPACE_OPERATIONS_ENABLED=false
HEROKU_MAX_DYNO_QUANTITY=10
HEROKU_REQUEST_TIMEOUT_MS=15000
HEROKU_LOG_FETCH_TIMEOUT_MS=10000
```

### 7.2 Validation rules

- `HEROKU_API_TOKEN` is required in production and must never appear in logs or validation errors.
- `ZORO_HEROKU_API_KEY` must contain at least 32 characters and be compared using timing-safe equality.
- `HEROKU_RESOURCE_ACCESS` must be `allowlist` or `all`; production defaults to `allowlist` and must not silently become `all`.
- Comma-separated allowlists are trimmed, deduplicated, and compared case-insensitively where Heroku identifiers are case-insensitive.
- Mutation, destructive, billing, access-administration, and Private Space switches must parse as explicit booleans.
- Maximum dyno quantity must be a bounded positive integer.
- Timeouts must be bounded positive integers.
- `HEROKU_SELF_APP` is required and identifies the Context API Heroku app for self-protection policy.
- Production startup fails closed when required values are missing or malformed.
- Non-production may leave the gateway unconfigured only when none of the Heroku variables are provided.

### 7.3 Returned configuration

The frozen environment object may expose validated fields such as:

```js
{
  herokuApiToken,
  zoroHerokuApiKey,
  herokuResourceAccess,
  herokuAppAllowlist,
  herokuTeamAllowlist,
  herokuPipelineAllowlist,
  herokuSpaceAllowlist,
  herokuDomainSuffixAllowlist,
  herokuAddonPlanAllowlist,
  herokuDynoSizeAllowlist,
  herokuSelfApp,
  herokuMutationsEnabled,
  herokuDestructiveOperationsEnabled,
  herokuBillingOperationsEnabled,
  herokuAccessAdminOperationsEnabled,
  herokuPrivateSpaceOperationsEnabled,
  herokuMaxDynoQuantity,
  herokuRequestTimeoutMs,
  herokuLogFetchTimeoutMs,
}
```

Secrets remain server-side only.

## 8. Authentication and Authorization

### 8.1 Zoro-to-Context API authentication

Every `/api/v1/heroku/*` endpoint requires:

```http
Authorization: Bearer <ZORO_HEROKU_API_KEY>
```

Middleware must reject missing, malformed, unsupported, empty, or incorrect credentials with `401`, avoid attaching secrets to the request, and never log authorization headers.

### 8.2 Context API-to-Heroku authentication

The server authenticates to Heroku with `HEROKU_API_TOKEN`. OAuth is preferred when this evolves into a multi-user third-party service; the approved single-owner implementation may use a direct Bearer token.

### 8.3 Resource authorization

Before forwarding an operation, policy must verify applicable allowlists for:

- app;
- team;
- pipeline;
- Private Space;
- domain suffix;
- add-on plan;
- dyno size.

An allowlist match does not grant upstream permission. Heroku remains authoritative and may return `401`, `402`, `403`, `404`, `409`, `412`, `422`, or `429`.

### 8.4 Operation classifications

- `read`: no Heroku mutation.
- `normal-write`: reversible or low-impact mutation.
- `production-sensitive`: can alter live traffic, release, runtime capacity, or production configuration.
- `destructive`: deletes or irreversibly removes a resource.
- `billing-sensitive`: may create or increase charges.
- `access-admin`: changes collaborators, members, invitations, or permissions.
- `private-space-admin`: changes enterprise network or isolated runtime infrastructure.
- `prohibited`: never exposed.

### 8.5 Approval evidence

Production-sensitive, destructive, billing-sensitive, access-admin, and Private Space mutations require an approval object:

```json
{
  "approval": {
    "approvedBy": "Kofi",
    "authority": "explicit-user-instruction",
    "workKey": "context-api:heroku-gateway-example",
    "reason": "Concise reason for this operation",
    "expectedResourceId": "optional UUID",
    "expectedEtag": "optional ETag",
    "expectedCurrentRelease": "optional release UUID or version"
  }
}
```

The gateway validates presence and shape but does not invent or self-approve authority. Approval data is logged safely without secrets.

## 9. Self-Protection Policy

For the app identified by `HEROKU_SELF_APP`, the gateway must:

- block app deletion and transfer;
- block scaling the `web` formation to zero;
- block stopping all dynos;
- block deletion of the last running web dyno;
- block deletion or nulling of `HEROKU_API_TOKEN`, `ZORO_HEROKU_API_KEY`, `MONGODB_URI`, `PORT`, or other configured required variables;
- block config changes that disable Heroku gateway authentication or mutations in a way that prevents recovery;
- require explicit approval and expected-current-state evidence for restart, scale, release, rollback, stack, buildpack, domain, add-on, and config mutations;
- prevent dyno quantity above the configured maximum;
- preserve at least one healthy web process during rolling operations when the API supports it.

## 10. API Conventions

### 10.1 Base path

```text
/api/v1/heroku
```

### 10.2 Success envelope

```json
{
  "data": {},
  "meta": {
    "herokuRequestId": "upstream-request-id",
    "etag": "upstream-etag",
    "rateLimitRemaining": 4499,
    "asynchronous": false
  },
  "correlationId": "context-api-correlation-id"
}
```

Collections may include normalized pagination/range metadata.

### 10.3 Error envelope

```json
{
  "error": {
    "code": "HEROKU_CONFLICT",
    "message": "The Heroku operation conflicts with the current resource state.",
    "details": []
  },
  "correlationId": "context-api-correlation-id"
}
```

Raw upstream messages must be sanitized. Safe upstream request IDs may be retained.

### 10.4 Concurrency

Mutable routes accept `expectedEtag` or `If-Match`. Where Heroku supports conditional requests, the gateway forwards `If-Match`. A stale resource produces normalized `412 HEROKU_PRECONDITION_FAILED`.

### 10.5 Pagination

The gateway accepts bounded `limit`, `startingRange`, `endingRange`, and `order` inputs where the upstream collection supports Heroku Range pagination. It returns normalized range metadata and never loops through all pages without an explicit bounded request.

### 10.6 Idempotency and retries

- Reads may retry bounded transient `429`, `500`, and `503` responses using `Retry-After` when present.
- Mutations are not automatically retried unless the operation is proven idempotent and carries an idempotency key or expected state.
- Destructive operations are never automatically retried.
- Network timeouts return a normalized gateway-timeout error with no false success claim.

## 11. Complete Endpoint Catalogue

All routes below are required unless marked `conditional` or `prohibited`.

### 11.1 Account, regions, stacks, and rate limits

| Method | Route                  | Operation ID          | Classification |
| ------ | ---------------------- | --------------------- | -------------- |
| GET    | `/account`             | `getHerokuAccount`    | read           |
| PATCH  | `/account`             | `updateHerokuAccount` | access-admin   |
| GET    | `/account/rate-limits` | `getHerokuRateLimits` | read           |
| GET    | `/regions`             | `listHerokuRegions`   | read           |
| GET    | `/regions/:region`     | `getHerokuRegion`     | read           |
| GET    | `/stacks`              | `listHerokuStacks`    | read           |
| GET    | `/stacks/:stack`       | `getHerokuStack`      | read           |

Account updates must use an explicit field allowlist and must not expose or rotate credentials.

### 11.2 Apps

| Method | Route                 | Operation ID        | Classification       |
| ------ | --------------------- | ------------------- | -------------------- |
| GET    | `/apps`               | `listHerokuApps`    | read                 |
| POST   | `/apps`               | `createHerokuApp`   | billing-sensitive    |
| GET    | `/apps/:app`          | `getHerokuApp`      | read                 |
| PATCH  | `/apps/:app`          | `updateHerokuApp`   | production-sensitive |
| DELETE | `/apps/:app`          | `deleteHerokuApp`   | destructive          |
| POST   | `/apps/:app/transfer` | `transferHerokuApp` | access-admin         |

App deletion and transfer are blocked for `HEROKU_SELF_APP`.

### 11.3 App features, buildpacks, and stack

| Method | Route                             | Operation ID             | Classification       |
| ------ | --------------------------------- | ------------------------ | -------------------- |
| GET    | `/apps/:app/features`             | `listHerokuAppFeatures`  | read                 |
| GET    | `/apps/:app/features/:feature`    | `getHerokuAppFeature`    | read                 |
| PATCH  | `/apps/:app/features/:feature`    | `updateHerokuAppFeature` | production-sensitive |
| GET    | `/apps/:app/buildpacks`           | `listHerokuBuildpacks`   | read                 |
| POST   | `/apps/:app/buildpacks`           | `createHerokuBuildpack`  | production-sensitive |
| PATCH  | `/apps/:app/buildpacks/:position` | `updateHerokuBuildpack`  | production-sensitive |
| DELETE | `/apps/:app/buildpacks/:position` | `deleteHerokuBuildpack`  | destructive          |
| GET    | `/apps/:app/stack`                | `getHerokuAppStack`      | read                 |
| PATCH  | `/apps/:app/stack`                | `updateHerokuAppStack`   | production-sensitive |

### 11.4 Config vars

| Method | Route                         | Operation ID                  | Classification       |
| ------ | ----------------------------- | ----------------------------- | -------------------- |
| GET    | `/apps/:app/config-vars`      | `listHerokuConfigVarMetadata` | read                 |
| PATCH  | `/apps/:app/config-vars`      | `updateHerokuConfigVars`      | production-sensitive |
| DELETE | `/apps/:app/config-vars/:key` | `deleteHerokuConfigVar`       | destructive          |

Read responses return key names, configured state, value classification, and optional non-secret safe values only. Raw values are prohibited. The implementation must maintain a sensitive-name detector and an explicit safe-value allowlist.

### 11.5 Dynos and formation

| Method | Route                        | Operation ID                 | Classification       |
| ------ | ---------------------------- | ---------------------------- | -------------------- |
| GET    | `/apps/:app/dynos`           | `listHerokuDynos`            | read                 |
| GET    | `/apps/:app/dynos/:dyno`     | `getHerokuDyno`              | read                 |
| DELETE | `/apps/:app/dynos/:dyno`     | `stopHerokuDyno`             | production-sensitive |
| DELETE | `/apps/:app/dynos`           | `restartAllHerokuDynos`      | production-sensitive |
| GET    | `/apps/:app/formation`       | `listHerokuFormation`        | read                 |
| GET    | `/apps/:app/formation/:type` | `getHerokuFormation`         | read                 |
| PATCH  | `/apps/:app/formation`       | `batchUpdateHerokuFormation` | production-sensitive |
| PATCH  | `/apps/:app/formation/:type` | `updateHerokuFormation`      | production-sensitive |

Creating arbitrary one-off dynos is prohibited from the GPT Action. Scaling must enforce size allowlist, quantity maximum, expected current state, self-app minimum, and approval evidence.

### 11.6 Builds, sources, slugs, releases, and rollback

| Method | Route                                   | Operation ID            | Classification       |
| ------ | --------------------------------------- | ----------------------- | -------------------- |
| POST   | `/sources`                              | `createHerokuSource`    | normal-write         |
| GET    | `/apps/:app/builds`                     | `listHerokuBuilds`      | read                 |
| POST   | `/apps/:app/builds`                     | `createHerokuBuild`     | production-sensitive |
| GET    | `/apps/:app/builds/:build`              | `getHerokuBuild`        | read                 |
| GET    | `/apps/:app/slugs`                      | `listHerokuSlugs`       | read                 |
| GET    | `/apps/:app/slugs/:slug`                | `getHerokuSlug`         | read                 |
| POST   | `/apps/:app/slugs`                      | `createHerokuSlug`      | production-sensitive |
| GET    | `/apps/:app/releases`                   | `listHerokuReleases`    | read                 |
| GET    | `/apps/:app/releases/:release`          | `getHerokuRelease`      | read                 |
| POST   | `/apps/:app/releases`                   | `createHerokuRelease`   | production-sensitive |
| POST   | `/apps/:app/releases/:release/rollback` | `rollbackHerokuRelease` | production-sensitive |

Source upload/download URLs must be treated as short-lived sensitive URLs, returned only when required, never logged, and omitted from durable reports.

### 11.7 Logs

| Method | Route                     | Operation ID             | Classification |
| ------ | ------------------------- | ------------------------ | -------------- |
| POST   | `/apps/:app/log-sessions` | `createHerokuLogSession` | read           |
| POST   | `/apps/:app/logs/query`   | `queryHerokuLogs`        | read           |

`queryHerokuLogs` creates a non-tail log session and fetches bounded output server-side. It must enforce line, source, dyno, timeout, and response-size limits. Tail streaming is not exposed to the GPT Action.

### 11.8 Domains and SNI endpoints

| Method | Route                                | Operation ID              | Classification       |
| ------ | ------------------------------------ | ------------------------- | -------------------- |
| GET    | `/apps/:app/domains`                 | `listHerokuDomains`       | read                 |
| POST   | `/apps/:app/domains`                 | `createHerokuDomain`      | production-sensitive |
| GET    | `/apps/:app/domains/:domain`         | `getHerokuDomain`         | read                 |
| PATCH  | `/apps/:app/domains/:domain`         | `updateHerokuDomain`      | production-sensitive |
| DELETE | `/apps/:app/domains/:domain`         | `deleteHerokuDomain`      | destructive          |
| GET    | `/apps/:app/sni-endpoints`           | `listHerokuSniEndpoints`  | read                 |
| GET    | `/apps/:app/sni-endpoints/:endpoint` | `getHerokuSniEndpoint`    | read                 |
| POST   | `/apps/:app/sni-endpoints`           | `createHerokuSniEndpoint` | production-sensitive |
| PATCH  | `/apps/:app/sni-endpoints/:endpoint` | `updateHerokuSniEndpoint` | production-sensitive |
| DELETE | `/apps/:app/sni-endpoints/:endpoint` | `deleteHerokuSniEndpoint` | destructive          |

Certificate private keys are accepted only in request bodies, never echoed, logged, serialized, or persisted by Context API. Domain suffix allowlisting is mandatory.

### 11.9 Add-ons and attachments

| Method | Route                                      | Operation ID                  | Classification       |
| ------ | ------------------------------------------ | ----------------------------- | -------------------- |
| GET    | `/apps/:app/addons`                        | `listHerokuAddons`            | read                 |
| POST   | `/apps/:app/addons`                        | `createHerokuAddon`           | billing-sensitive    |
| GET    | `/apps/:app/addons/:addon`                 | `getHerokuAddon`              | read                 |
| PATCH  | `/apps/:app/addons/:addon`                 | `updateHerokuAddon`           | billing-sensitive    |
| DELETE | `/apps/:app/addons/:addon`                 | `deleteHerokuAddon`           | destructive          |
| GET    | `/apps/:app/addon-attachments`             | `listHerokuAddonAttachments`  | read                 |
| POST   | `/apps/:app/addon-attachments`             | `createHerokuAddonAttachment` | production-sensitive |
| GET    | `/apps/:app/addon-attachments/:attachment` | `getHerokuAddonAttachment`    | read                 |
| PATCH  | `/apps/:app/addon-attachments/:attachment` | `updateHerokuAddonAttachment` | production-sensitive |
| DELETE | `/apps/:app/addon-attachments/:attachment` | `deleteHerokuAddonAttachment` | destructive          |

Plans must match `HEROKU_ADDON_PLAN_ALLOWLIST`. Billing operations must fail closed unless explicitly enabled and approved.

### 11.10 Collaborators and app permissions

| Method | Route                                    | Operation ID               | Classification |
| ------ | ---------------------------------------- | -------------------------- | -------------- |
| GET    | `/apps/:app/collaborators`               | `listHerokuCollaborators`  | read           |
| POST   | `/apps/:app/collaborators`               | `createHerokuCollaborator` | access-admin   |
| GET    | `/apps/:app/collaborators/:collaborator` | `getHerokuCollaborator`    | read           |
| PATCH  | `/apps/:app/collaborators/:collaborator` | `updateHerokuCollaborator` | access-admin   |
| DELETE | `/apps/:app/collaborators/:collaborator` | `deleteHerokuCollaborator` | access-admin   |

Access-admin operations must be disabled unless explicitly enabled and approved.

### 11.11 Pipelines and promotions

| Method | Route                                     | Operation ID                         | Classification       |
| ------ | ----------------------------------------- | ------------------------------------ | -------------------- |
| GET    | `/pipelines`                              | `listHerokuPipelines`                | read                 |
| POST   | `/pipelines`                              | `createHerokuPipeline`               | normal-write         |
| GET    | `/pipelines/:pipeline`                    | `getHerokuPipeline`                  | read                 |
| PATCH  | `/pipelines/:pipeline`                    | `updateHerokuPipeline`               | production-sensitive |
| DELETE | `/pipelines/:pipeline`                    | `deleteHerokuPipeline`               | destructive          |
| GET    | `/pipelines/:pipeline/apps`               | `listHerokuPipelineApps`             | read                 |
| POST   | `/pipelines/:pipeline/apps`               | `createHerokuPipelineCoupling`       | production-sensitive |
| DELETE | `/pipelines/:pipeline/apps/:coupling`     | `deleteHerokuPipelineCoupling`       | destructive          |
| POST   | `/pipelines/:pipeline/promotions`         | `createHerokuPipelinePromotion`      | production-sensitive |
| GET    | `/pipeline-promotions/:promotion`         | `getHerokuPipelinePromotion`         | read                 |
| GET    | `/pipeline-promotions/:promotion/targets` | `listHerokuPipelinePromotionTargets` | read                 |

Production promotion requires expected source release and target app evidence.

### 11.12 Pipeline config vars

| Method | Route                                            | Operation ID                          | Classification       |
| ------ | ------------------------------------------------ | ------------------------------------- | -------------------- |
| GET    | `/pipelines/:pipeline/stages/:stage/config-vars` | `listHerokuPipelineConfigVarMetadata` | read                 |
| PATCH  | `/pipelines/:pipeline/stages/:stage/config-vars` | `updateHerokuPipelineConfigVars`      | production-sensitive |

The same config-var redaction and self-protection rules apply.

### 11.13 Review apps

| Method | Route                                    | Operation ID                  | Classification       |
| ------ | ---------------------------------------- | ----------------------------- | -------------------- |
| GET    | `/pipelines/:pipeline/review-apps`       | `listHerokuReviewApps`        | read                 |
| POST   | `/pipelines/:pipeline/review-apps`       | `createHerokuReviewApp`       | billing-sensitive    |
| GET    | `/review-apps/:reviewApp`                | `getHerokuReviewApp`          | read                 |
| DELETE | `/review-apps/:reviewApp`                | `deleteHerokuReviewApp`       | destructive          |
| GET    | `/pipelines/:pipeline/review-app-config` | `getHerokuReviewAppConfig`    | read                 |
| PATCH  | `/pipelines/:pipeline/review-app-config` | `updateHerokuReviewAppConfig` | production-sensitive |

Review-app creation must be bounded to approved pipelines and repositories and include cleanup expectations.

### 11.14 App and pipeline webhooks

| Method | Route                                     | Operation ID                     | Classification       |
| ------ | ----------------------------------------- | -------------------------------- | -------------------- |
| GET    | `/apps/:app/webhooks`                     | `listHerokuAppWebhooks`          | read                 |
| POST   | `/apps/:app/webhooks`                     | `createHerokuAppWebhook`         | production-sensitive |
| GET    | `/apps/:app/webhooks/:webhook`            | `getHerokuAppWebhook`            | read                 |
| DELETE | `/apps/:app/webhooks/:webhook`            | `deleteHerokuAppWebhook`         | destructive          |
| GET    | `/apps/:app/webhook-deliveries`           | `listHerokuAppWebhookDeliveries` | read                 |
| GET    | `/apps/:app/webhook-deliveries/:delivery` | `getHerokuAppWebhookDelivery`    | read                 |
| GET    | `/pipelines/:pipeline/webhooks`           | `listHerokuPipelineWebhooks`     | read                 |
| POST   | `/pipelines/:pipeline/webhooks`           | `createHerokuPipelineWebhook`    | production-sensitive |
| DELETE | `/pipelines/:pipeline/webhooks/:webhook`  | `deleteHerokuPipelineWebhook`    | destructive          |

Webhook secrets are write-only and never returned. Callback URLs must use HTTPS and pass configured host policy.

### 11.15 Teams

| Method | Route                                  | Operation ID                 | Classification    |
| ------ | -------------------------------------- | ---------------------------- | ----------------- |
| GET    | `/teams`                               | `listHerokuTeams`            | read              |
| POST   | `/teams`                               | `createHerokuTeam`           | billing-sensitive |
| GET    | `/teams/:team`                         | `getHerokuTeam`              | read              |
| PATCH  | `/teams/:team`                         | `updateHerokuTeam`           | access-admin      |
| DELETE | `/teams/:team`                         | `deleteHerokuTeam`           | destructive       |
| GET    | `/teams/:team/apps`                    | `listHerokuTeamApps`         | read              |
| GET    | `/teams/:team/members`                 | `listHerokuTeamMembers`      | read              |
| POST   | `/teams/:team/members`                 | `createHerokuTeamMember`     | access-admin      |
| PATCH  | `/teams/:team/members/:member`         | `updateHerokuTeamMember`     | access-admin      |
| DELETE | `/teams/:team/members/:member`         | `deleteHerokuTeamMember`     | access-admin      |
| GET    | `/teams/:team/invitations`             | `listHerokuTeamInvitations`  | read              |
| POST   | `/teams/:team/invitations`             | `createHerokuTeamInvitation` | access-admin      |
| DELETE | `/teams/:team/invitations/:invitation` | `deleteHerokuTeamInvitation` | access-admin      |
| GET    | `/teams/:team/usage/daily`             | `getHerokuTeamDailyUsage`    | read              |
| GET    | `/teams/:team/usage/monthly`           | `getHerokuTeamMonthlyUsage`  | read              |
| GET    | `/teams/:team/invoices`                | `listHerokuTeamInvoices`     | read              |

Invoice responses must exclude payment-method details and other unnecessary sensitive information.

### 11.16 Private Spaces — conditional

These routes are required when the token/account has the entitlement and `HEROKU_PRIVATE_SPACE_OPERATIONS_ENABLED=true`. Otherwise they must return a clear feature-disabled or entitlement error.

| Method | Route                                 | Operation ID                     | Classification      |
| ------ | ------------------------------------- | -------------------------------- | ------------------- |
| GET    | `/spaces`                             | `listHerokuSpaces`               | read                |
| POST   | `/spaces`                             | `createHerokuSpace`              | private-space-admin |
| GET    | `/spaces/:space`                      | `getHerokuSpace`                 | read                |
| PATCH  | `/spaces/:space`                      | `updateHerokuSpace`              | private-space-admin |
| DELETE | `/spaces/:space`                      | `deleteHerokuSpace`              | destructive         |
| GET    | `/spaces/:space/apps`                 | `listHerokuSpaceApps`            | read                |
| GET    | `/spaces/:space/access`               | `listHerokuSpaceAccess`          | read                |
| POST   | `/spaces/:space/access`               | `createHerokuSpaceAccess`        | private-space-admin |
| DELETE | `/spaces/:space/access/:member`       | `deleteHerokuSpaceAccess`        | private-space-admin |
| GET    | `/spaces/:space/topology`             | `getHerokuSpaceTopology`         | read                |
| GET    | `/spaces/:space/nat`                  | `getHerokuSpaceNat`              | read                |
| GET    | `/spaces/:space/vpn-connections`      | `listHerokuSpaceVpnConnections`  | read                |
| POST   | `/spaces/:space/vpn-connections`      | `createHerokuSpaceVpnConnection` | private-space-admin |
| GET    | `/spaces/:space/vpn-connections/:vpn` | `getHerokuSpaceVpnConnection`    | read                |
| DELETE | `/spaces/:space/vpn-connections/:vpn` | `deleteHerokuSpaceVpnConnection` | destructive         |

Exact upstream resource availability and paths must be revalidated against the current Platform API schema during implementation.

## 12. Validation Requirements

Validation modules must define bounded schemas for:

- Heroku UUIDs and names;
- app, team, pipeline, release, build, slug, dyno, formation, domain, endpoint, add-on, collaborator, webhook, review-app, and space identifiers;
- Range pagination values;
- email addresses used for collaborator/member operations;
- HTTPS URLs;
- domain suffix allowlisting;
- config-var key syntax and value size;
- sensitive key detection;
- dyno quantity and size;
- build source URLs and version metadata;
- release and rollback expected state;
- certificate body size without echoing values;
- approval evidence;
- ETag values;
- webhook event lists;
- add-on plan identifiers;
- Private Space networking inputs.

Unexpected fields must be rejected on mutation routes.

## 13. Serialization and Secret Handling

Serializers must return stable, minimal, documented representations rather than raw Heroku responses.

Mandatory redactions include:

- API and OAuth tokens;
- config-var values unless explicitly classified safe;
- database URLs and credentials;
- certificate private keys;
- webhook secrets;
- temporary source upload/download URLs in logs and durable reports;
- billing payment details;
- raw collaborator or account fields not required by the contract.

Safe config metadata example:

```json
{
  "key": "MONGODB_URI",
  "configured": true,
  "sensitive": true,
  "value": "[REDACTED]"
}
```

## 14. Error Translation

Normalize at least:

| Upstream condition              | Context API code             | Status                          |
| ------------------------------- | ---------------------------- | ------------------------------- |
| Missing/invalid Zoro key        | `AUTHENTICATION_REQUIRED`    | 401                             |
| Invalid/expired Heroku token    | `HEROKU_UNAUTHORIZED`        | 502 or 401 by documented policy |
| Policy/allowlist denial         | `HEROKU_RESOURCE_FORBIDDEN`  | 403                             |
| Billing verification needed     | `HEROKU_PAYMENT_REQUIRED`    | 402                             |
| Resource missing                | `HEROKU_NOT_FOUND`           | 404                             |
| State conflict                  | `HEROKU_CONFLICT`            | 409                             |
| Stale ETag                      | `HEROKU_PRECONDITION_FAILED` | 412                             |
| Invalid upstream parameters     | `HEROKU_INVALID_REQUEST`     | 422                             |
| Upstream rate limit             | `HEROKU_RATE_LIMITED`        | 429                             |
| Gateway timeout                 | `HEROKU_TIMEOUT`             | 504                             |
| Heroku unavailable              | `HEROKU_UNAVAILABLE`         | 502/503                         |
| Feature/entitlement unavailable | `HEROKU_FEATURE_UNAVAILABLE` | 403/501                         |

Do not pass through HTML or unsanitized text from upstream errors.

## 15. Rate Limits and Caching

Heroku currently uses an account-level token pool with rate-limit information in response headers and a dedicated rate-limit endpoint. The gateway must:

- expose remaining quota safely in response metadata;
- avoid unbounded polling;
- support conditional GET with ETag/`If-None-Match` internally where useful;
- apply Context API rate limiting separately from Heroku's upstream quota;
- use a distributed rate-limit store before horizontally scaling Context API to multiple dynos;
- reject bulk operations that can exceed bounded request budgets;
- honor `Retry-After` where provided.

## 16. Logging and Audit Evidence

Structured logs may include:

- correlation ID;
- operation ID;
- classification;
- app/team/pipeline/space identifier;
- safe approval identifiers;
- upstream Heroku request ID;
- status and duration;
- rate-limit remaining;
- whether an operation was blocked by policy.

Logs must not include authorization headers, tokens, config values, certificate material, webhook secrets, source URLs, raw command input, or complete upstream bodies.

## 17. OpenAPI and GPT Action Strategy

The Heroku Gateway must use a dedicated maintained schema:

```text
docs/openapi/zoro-heroku-action.yaml
```

Reasons:

- the existing combined Action already has a constrained operation count;
- the full Heroku surface exceeds one GPT Action's practical operation budget;
- authentication and approval policy are provider-specific;
- smaller domain schemas are easier to validate and maintain.

Because the complete endpoint catalogue is larger than a single Builder Action can safely expose, the repository must maintain:

1. a complete canonical OpenAPI document for all gateway routes; and
2. Builder-compatible capability-group schemas generated deterministically from the canonical schema, each using the same host and Heroku Bearer credential.

Suggested generated groups:

- `zoro-heroku-runtime-action.yaml` — apps, dynos, formation, releases, logs;
- `zoro-heroku-deploy-action.yaml` — builds, sources, slugs, pipelines, promotions, review apps;
- `zoro-heroku-config-action.yaml` — config metadata/mutations, domains, SNI, add-ons;
- `zoro-heroku-admin-action.yaml` — collaborators, teams, webhooks, conditional Private Spaces.

Generation must preserve unique operation IDs, flatten Builder-incompatible constructs, validate operation counts, and detect drift.

## 18. Required Source Structure

Expected new files include:

```text
src/controllers/heroku.controller.js
src/middleware/requireHerokuActionAuth.js
src/middleware/requireHerokuResourceAccess.js
src/middleware/requireHerokuApproval.js
src/middleware/validateHeroku.js
src/routes/v1/heroku.js
src/services/herokuClient.js
src/services/heroku.service.js
src/services/herokuPolicy.js
src/services/herokuErrors.js
src/serializers/heroku.serializer.js
src/validation/heroku.schemas.js
scripts/validate-heroku-gateway-release.js
scripts/generate-heroku-action-schemas.js
docs/openapi/zoro-heroku-action.yaml
```

Implementation may split service, serializer, policy, validation, and route files by resource domain to keep files maintainable.

Expected existing-file updates include:

```text
.env.example
package.json
package-lock.json (only if a dependency is added)
src/app.js
src/config/env.js
src/middleware/errorHandler.js
src/utils/errors.js
README.md
docs/DEPLOYMENT.md
```

Only evidence-supported shared files should change.

## 19. Test Requirements

### 19.1 Unit coverage

- environment parsing and secret-safe errors;
- timing-safe Bearer authentication;
- allowlist normalization and matching;
- operation classification and approval gates;
- self-app protection;
- config-var redaction;
- serializer field allowlists;
- ETag forwarding;
- retry and timeout policy;
- Range pagination handling;
- dyno scaling limits;
- add-on plan limits;
- domain suffix limits;
- error translation;
- OpenAPI schema grouping.

### 19.2 Service coverage

Mock all Heroku HTTP responses. Cover every endpoint's method, path, headers, request body, serialization, and error translation. Automated tests must never call live Heroku.

### 19.3 Integration coverage

- route registration;
- route-specific body limit;
- database-request independence;
- authentication failures;
- policy and approval failures;
- all success status classes;
- asynchronous `202` operations;
- `402`, `409`, `412`, `422`, `429`, `500`, and `503` handling;
- no secret leakage in responses or logs;
- existing Context API, GitHub, and Vercel regression behavior.

### 19.4 Contract and release coverage

The release validator must confirm:

- every required endpoint is mounted;
- every route is authenticated;
- dangerous routes have policy and approval middleware;
- config reads are redacted;
- self-app deletion and scale-to-zero are blocked;
- source URLs and secret material do not enter logs;
- canonical and generated OpenAPI schemas validate;
- operation IDs are unique;
- Builder group operation counts are within limits;
- production server URLs and Bearer security are correct;
- `npm run verify` includes Heroku validation.

### 19.5 Controlled production smoke test

After deployment:

1. Confirm `/health` and existing provider routes remain healthy.
2. Confirm unauthorized Heroku calls return `401`.
3. Confirm account, rate-limit, app, formation, dyno, build, release, domain, add-on, pipeline, and team reads for approved resources.
4. Confirm config reads are redacted.
5. Confirm a policy-denied app fails closed.
6. Confirm self-app deletion and scale-to-zero are blocked.
7. Use a disposable approved app or review app to test create/update/delete, build/release, scaling, config mutation, domain or add-on behavior where safe and available.
8. Test production-sensitive approval enforcement before an approved operation.
9. Clean up all disposable resources and retain evidence.
10. Record exact deployed commit, Heroku release, request IDs, operation results, cleanup, untested entitlement-dependent operations, and remaining risks.

## 20. Deployment Requirements

- Implement on a separate branch from current `main`.
- Use focused commits and open a pull request.
- Run clean `npm ci` and complete `npm run verify`.
- Do not merge until verification passes and merge authority is explicit.
- Deploy the exact verified merge revision.
- Record Heroku release version, commit SHA, startup evidence, and smoke-test evidence.
- Configure secrets only in Heroku config; never write values to the repository.
- Install the generated Builder-compatible Action schemas using Bearer authentication.
- Verify each Action in a fresh Zoro conversation.
- Roll back to the prior verified release on startup failure, regression, unsafe policy behavior, or secret exposure.

## 21. Acceptance Criteria

The feature is accepted only when all of the following are true:

1. Every required and eligible conditional endpoint in this specification is implemented or explicitly documented as unavailable because the authenticated account lacks the upstream entitlement.
2. All Heroku routes require the dedicated Context API Bearer key.
3. Upstream authentication works without exposing the Heroku token.
4. Resource allowlists and operation switches fail closed.
5. Production-sensitive, destructive, billing, access-admin, and Private Space mutations require approval evidence.
6. Self-app deletion, scale-to-zero, last-web-dyno termination, and required-secret removal are blocked.
7. Config-var values remain redacted.
8. ETag concurrency is supported where available.
9. Heroku request IDs and rate-limit metadata are retained safely.
10. Every required unit, service, integration, contract, security, and regression test passes.
11. Existing Context API, GitHub Gateway, and Vercel Gateway tests pass.
12. Canonical and generated OpenAPI schemas validate and remain within Builder limits.
13. `npm ci` and `npm run verify` pass from a clean checkout.
14. A focused pull request is opened and independently reviewed.
15. The exact verified revision is merged only with explicit authority.
16. The exact merge revision is deployed successfully.
17. Controlled live reads and approved disposable mutations pass.
18. Disposable resources are cleaned up.
19. Zoro reports branch, commits, pull request, verification, deployment, live Action configuration, smoke tests, cleanup, risks, and unresolved entitlement-dependent checks.
20. Durable Context API project state is updated only after independent verification.

## 22. Risks and Required Mitigations

- **Self-management outage:** enforce self-protection before exposing mutations.
- **Secret disclosure:** redact config values and strip sensitive URLs/fields from logs and responses.
- **Billing impact:** require plan allowlists, feature switch, explicit approval, and report expected cost class.
- **Destructive operations:** require expected state, ETag where supported, explicit approval, and no automatic retry.
- **API drift:** validate against current Platform API schema and pin contract tests.
- **Rate limiting:** expose quota, bound pagination, and avoid polling.
- **Horizontal scaling:** replace process-local rate-limit storage with a distributed store before multiple web dynos.
- **MongoDB startup coupling:** document that provider routes remain process-level dependent on startup MongoDB connectivity until separately redesigned.
- **Builder operation limits:** maintain canonical schema plus deterministic capability-group schemas.
- **Entitlement variance:** fail clearly for Team, Enterprise, and Private Space resources unavailable to the account.
- **Long-running operations:** model `202` states and poll only with bounded caller-driven status checks.
- **Certificate/key handling:** accept only over TLS, never log, never echo, and use strict body limits.

## 23. Completion Semantics

Use these states accurately:

- `specified`: this document exists and is approved.
- `implemented`: source and tests exist on a feature branch.
- `committed`: implementation commits are pushed.
- `pull-request-opened`: reviewable PR exists.
- `verified`: clean automated and independent checks pass.
- `merged`: approved verified PR is merged.
- `deployed`: exact merge revision is running.
- `action-configured`: generated schemas are installed with Bearer authentication.
- `smoke-tested`: controlled live reads and mutations pass with cleanup.
- `completed`: all acceptance criteria and durable reporting are satisfied.

No earlier state may be described as full completion.
