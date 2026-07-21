# Context API — Implementation Plan

> **Historical document.** This plan captures the original read-only MVP scope and is retained as a
> record of that phase. It no longer describes the API. The approved scope is now a public,
> unauthenticated CRUD MVP supporting GET, POST, PATCH, and soft-delete DELETE, with PUT returning
> 405. References to "read-only" endpoints below are historical. See [`../README.md`](../README.md)
> for the current contract and [`DEPLOYMENT.md`](DEPLOYMENT.md) for supported methods.

**Version:** 0.1  
**Status:** Superseded by the public CRUD MVP  
**Source documents:** `docs/PRD.md`, `docs/SPEC.md`  
**Target branch:** `main`  
**Last updated:** 2026-07-19

## 1. Delivery Strategy

Implement the MVP in small, testable vertical slices while preserving the read-only, unauthenticated scope defined by the PRD.

The repository currently contains product documentation but no established application structure. The first implementation phase therefore establishes the project baseline and conventions before domain work begins.

Guiding rules:

- keep every change focused and reviewable
- write tests alongside each feature
- avoid adding write endpoints or authentication
- use stable domain identifiers rather than database IDs in public routes
- keep business logic in services
- use deterministic seed data
- update documentation whenever an API contract changes

## 2. Definition of Done

A work item is complete only when:

- implementation matches the PRD and technical specification
- relevant tests are added and passing
- linting and formatting pass
- error and edge cases are handled
- API responses use the standard envelope
- internal database fields are not exposed
- documentation is updated when behavior changes
- no secrets or sensitive data are committed

## 3. Phase Overview

| Phase | Outcome |
| --- | --- |
| 0 | Repository and tooling foundation |
| 1 | Application, configuration, database, and health endpoint |
| 2 | Shared API infrastructure and validation |
| 3 | Domain models and deterministic seeds |
| 4 | Core read endpoints |
| 5 | Remaining read endpoints and conflict rules |
| 6 | Security hardening, observability, and resilience |
| 7 | Sample client, payload validation, and MVP closure |

## 4. Phase 0 — Repository Foundation

### Objective

Create a consistent Node.js backend baseline that all later phases can build upon.

### Tasks

1. Initialize `package.json`.
2. Define supported Node.js version in `engines` and optionally `.nvmrc`.
3. Install runtime dependencies:
   - Express
   - Mongoose
   - focused validation library
   - environment loader
   - security headers middleware
   - CORS middleware
   - rate limiter
4. Install development dependencies:
   - Jest
   - Supertest
   - ESLint
   - Prettier
   - test database tooling if required
5. Add scripts:
   - `start`
   - `dev`
   - `test`
   - `test:watch`
   - `test:coverage`
   - `lint`
   - `lint:fix`
   - `format`
   - `format:check`
   - `seed`
6. Add baseline files:
   - `.gitignore`
   - `.env.example`
   - ESLint configuration
   - Prettier configuration
   - Jest configuration
7. Create source and test directories following `docs/SPEC.md`.
8. Add a minimal README with setup, scripts, and the unauthenticated security warning.

### Tests and validation

- package scripts execute successfully
- linting runs against an empty or minimal source tree
- Jest starts and reports a passing baseline test
- `.env` is ignored

### Exit criteria

- a new contributor can install dependencies and run tests from documented commands
- no runtime feature is implemented beyond the minimum bootstrap required for validation

## 5. Phase 1 — Application and Database Foundation

### Objective

Build the executable Express application, validated configuration, MongoDB connection lifecycle, and health endpoint.

### Tasks

1. Create `src/app.js` as an Express application factory.
2. Create `src/server.js` for startup and shutdown orchestration.
3. Implement environment validation in `src/config/env.js`.
4. Implement Mongoose connection handling in `src/config/database.js`.
5. Configure:
   - JSON body limits
   - secure headers
   - explicit CORS behavior
   - disabled `x-powered-by`
6. Add graceful shutdown for `SIGINT` and `SIGTERM`.
7. Implement `GET /health`.
8. Add runtime database-state tracking.
9. Add a simple centralized error middleware placeholder that will be expanded in Phase 2.

### Health behavior

- application and database healthy: `200`
- application running but database unavailable: `503`
- response includes only safe environment metadata

### Tests

- application factory can be imported without opening a network port
- health returns `200` for connected database state
- health returns `503` for disconnected state
- startup fails safely when required environment values are absent
- shutdown closes HTTP and database connections

### Exit criteria

- service starts locally
- database connection is established before traffic is accepted
- health endpoint accurately reflects database state

## 6. Phase 2 — Shared API Infrastructure

### Objective

Establish conventions used by every domain endpoint before implementing individual domains.

### Tasks

1. Add `/api/v1` router.
2. Implement response helpers for:
   - collection responses
   - single-resource responses
   - error responses
3. Add correlation ID middleware.
4. Add request logging with method, route, status, duration, and correlation ID.
5. Implement centralized error classes:
   - validation error
   - resource not found
   - database unavailable
   - internal error
6. Implement centralized error translation middleware.
7. Add route-not-found handling.
8. Add shared pagination validation.
9. Add shared filter parsing utilities.
10. Add query allowlisting so unknown query parameters are rejected.
11. Add serializer conventions to remove `_id`, `__v`, and internal fields where appropriate.

### Tests

- collection and single response envelopes are consistent
- error envelope contains expected code, message, and correlation ID
- unknown routes return deterministic `404`
- unknown query parameters return `400`
- page and page-size boundaries are enforced
- stack traces and raw database errors are not returned

### Exit criteria

- every later endpoint can reuse shared validation, responses, and errors
- no domain-specific logic is introduced into shared middleware

## 7. Phase 3 — Models and Seed System

### Objective

Define all MongoDB domain models and a repeatable seed workflow before exposing most read endpoints.

### Recommended implementation order

1. Profile
2. Project
3. Coding Convention
4. Instruction Set
5. Ideas Hub Context
6. Glossary Entry
7. Learning
8. Task

This order establishes referenced project records before dependent conventions, learnings, and tasks.

### Shared model tasks

1. Add timestamps to every mutable schema.
2. Define stable keys and unique indexes.
3. Define common source metadata.
4. Define status and scope enums where applicable.
5. Add indexes for all documented filters.
6. Configure schema serialization to exclude internal fields.
7. Avoid unrestricted mixed objects unless the domain requires them and validation remains explicit.

### Seed system tasks

1. Create structured seed files per domain.
2. Validate all seed records before database writes.
3. Validate cross-domain references.
4. Validate unique glossary aliases.
5. Upsert by stable keys or IDs.
6. Report inserted, updated, unchanged, and failed records.
7. Exit non-zero on any validation or write failure.
8. Keep reset/drop behavior in a separate explicit command, not the default seed command.

### Representative seed requirements

Include:

- one active profile
- global and project-scoped coding conventions
- the Context API project and at least one additional project
- instruction sets for discovery, specification, implementation, and verification
- Ideas Hub governance sections
- glossary entries with aliases and relationships
- active, draft, and superseded learnings
- tasks across different projects, statuses, and priorities

### Tests

- model required fields and enums
- unique indexes and duplicate-key handling
- stable seed identifiers
- seed rerun idempotency
- cross-reference validation
- glossary alias collision detection
- all required domains populated

### Exit criteria

- `npm run seed` can be run repeatedly without duplication
- all schemas and indexes align with `docs/SPEC.md`

## 8. Phase 4 — Core Read Endpoints

### Objective

Deliver the highest-value client retrieval paths first.

### Slice 4.1 — Profile

Implement:

- `GET /api/v1/profile`

Acceptance criteria:

- returns the active primary profile
- returns `404` when unavailable
- excludes internal fields

### Slice 4.2 — Projects

Implement:

- `GET /api/v1/projects`
- `GET /api/v1/projects/:projectId`

Filters:

- `status`
- `technology`
- `updatedAfter`
- pagination

Acceptance criteria:

- exact stable project ID lookup
- valid ISO date filtering
- deterministic sorting
- empty collections return `200`

### Slice 4.3 — Coding Conventions

Implement:

- `GET /api/v1/coding-conventions`
- `GET /api/v1/coding-conventions/:key`

Filters:

- `scope`
- `technology`
- `layer`
- `project`
- `status`
- pagination

Acceptance criteria:

- filters can be combined
- exact key lookup
- project and global records remain distinguishable
- no silent conflict resolution in collection responses

### Slice 4.4 — Instruction Sets

Implement:

- `GET /api/v1/instruction-sets`
- `GET /api/v1/instruction-sets/:key`

Filters:

- `status`
- `workflowStage`
- `client`
- pagination

Acceptance criteria:

- key lookup returns the highest active or approved version
- version-selection behavior is tested and documented

### Tests for every slice

- successful collection retrieval
- successful single-resource retrieval
- empty collection
- missing resource
- invalid identifier
- valid and invalid filters
- database failure translation
- response envelope and serialization

### Exit criteria

- a sample HTTP client can retrieve profile, project, conventions, and instruction sets independently

## 9. Phase 5 — Remaining Domains

### Slice 5.1 — Ideas Hub Context

Implement:

- `GET /api/v1/ideas-hub`
- `GET /api/v1/ideas-hub/:section`

Ensure source-of-truth and update-routing information remains explicit.

### Slice 5.2 — Glossary

Implement:

- `GET /api/v1/glossary`
- `GET /api/v1/glossary/:term`

Behavior:

- normalize requested term
- match normalized key before alias
- support case-insensitive `query`
- support `scope`

Edge cases:

- duplicate aliases must not exist in active data
- ambiguous matches return a deterministic error rather than an arbitrary entry

### Slice 5.3 — Learnings

Implement:

- `GET /api/v1/learnings`
- `GET /api/v1/learnings/:learningId`

Filters:

- `category`
- `projectId`
- `status`
- pagination

Ensure draft assumptions are not represented as approved durable learnings.

### Slice 5.4 — Tasks

Implement:

- `GET /api/v1/tasks`
- `GET /api/v1/tasks/:taskId`

Filters:

- `projectId`
- `status`
- `priority`
- pagination

Keep the feature read-only and avoid project-management workflow expansion.

### Conflict and precedence service

Implement and test reusable precedence logic for consumers that need one effective record:

1. project scope before global scope
2. active or approved before draft
3. higher explicit priority
4. higher version
5. latest update timestamp

Do not apply precedence to ordinary collection endpoints unless the endpoint contract explicitly requests a resolved view.

### Exit criteria

- all PRD domain endpoints are implemented
- every documented filter has integration coverage

## 10. Phase 6 — Hardening and Resilience

### Objective

Complete the safeguards required for an internet-accessible but unauthenticated MVP.

### Tasks

1. Configure CORS from an environment allowlist.
2. Add basic rate limiting.
3. Confirm request and query size limits.
4. Confirm unsupported methods return deterministic responses.
5. Add safe database error mapping.
6. Add runtime database disconnection handling.
7. Ensure logs redact sensitive headers and configuration.
8. Add index verification during startup or deployment validation.
9. Add test coverage for malformed JSON.
10. Add test coverage for partial seed failures.
11. Document that private data must not be stored before authentication exists.

### Security review checklist

- no write routes
- no committed credentials
- no permissive wildcard CORS by default
- no response stack traces
- no raw MongoDB documents
- no connection strings in logs or health responses
- no full context payload logging
- no assumption that an undisclosed URL is secure

### Exit criteria

- security posture matches the PRD
- failure modes produce useful, non-sensitive errors

## 11. Phase 7 — MVP Validation

### Objective

Prove that the architecture reduces duplicated prompt context and supports multiple clients.

### Tasks

1. Add a sample client script.
2. Demonstrate separate retrieval of:
   - coding conventions
   - project context
   - instruction sets
   - glossary entries
   - Ideas Hub metadata
3. Add payload-size comparison:
   - full static instructions
   - targeted API responses
4. Validate that updating a database record changes future retrieval without editing client instructions.
5. Test missing, conflicting, stale, archived, and superseded records.
6. Test deployment configuration in a non-production environment.
7. Record MVP findings in documentation.
8. Decide whether to proceed to authentication and write APIs.

### Suggested validation measurements

- response byte size per domain
- total bytes for a representative task
- reduction compared with full instruction loading
- local and deployed response latency
- number of reusable clients
- number of duplicated instruction blocks removed

### Exit criteria

All acceptance criteria in `docs/PRD.md` and `docs/SPEC.md` are satisfied, or remaining gaps are documented with an explicit decision.

## 12. Recommended Commit Sequence

Use small commits aligned with coherent outcomes:

1. `chore: initialize Node.js project and tooling`
2. `feat: add application and database bootstrap`
3. `feat: add health endpoint`
4. `feat: add shared API middleware and response contracts`
5. `feat: add context domain models`
6. `feat: add deterministic seed workflow`
7. `feat: add profile and project read endpoints`
8. `feat: add coding convention read endpoints`
9. `feat: add instruction set read endpoints`
10. `feat: add Ideas Hub and glossary read endpoints`
11. `feat: add learning and task read endpoints`
12. `feat: add security and observability safeguards`
13. `docs: add sample client and MVP validation results`

Each feature commit should include its tests where practical.

## 13. Test Matrix

| Area | Unit | Integration |
| --- | --- | --- |
| Environment validation | Yes | Startup test |
| Database lifecycle | Yes | Yes |
| Health | Limited | Yes |
| Validation | Yes | Yes |
| Response helpers | Yes | Yes |
| Error translation | Yes | Yes |
| Models and indexes | Yes | Yes |
| Seed process | Yes | Yes |
| Domain services | Yes | Through endpoints |
| Serializers | Yes | Yes |
| Filters and pagination | Yes | Yes |
| Conflict precedence | Yes | Targeted integration |
| Logging and correlation IDs | Yes | Yes |
| Rate limiting and CORS | Configuration tests | Yes |

## 14. Risks and Mitigations

### Risk: scope expands into a context-management platform

Mitigation: preserve read-only endpoints and defer UI, writes, authentication, and ingestion.

### Risk: schemas become generic unstructured documents

Mitigation: define explicit fields per domain and limit mixed objects.

### Risk: Ideas Hub and Context API diverge

Mitigation: preserve source references, document authority, and avoid silent synchronization.

### Risk: project and global conventions conflict

Mitigation: keep scope visible and implement deterministic optional precedence logic.

### Risk: seed data becomes production data management

Mitigation: keep seeds representative, deterministic, and development-oriented.

### Risk: public unauthenticated deployment exposes private context

Mitigation: store only non-sensitive data and clearly block private-data use until authentication exists.

### Risk: API responses grow too large

Mitigation: domain-specific routes, pagination, bounded query sizes, and no all-context endpoint.

## 15. Deferred Backlog

Do not implement these until the MVP is validated and requirements are approved:

- authentication
- authorization and client scopes
- write APIs
- audit history
- context-management UI
- semantic search
- vector database
- automatic learning extraction
- webhooks
- event synchronization
- secret-manager integration
- request signing
- rollback and advanced record versioning

## 16. Immediate Next Work

The next implementation task should be Phase 0 and Phase 1 foundation work:

1. initialize the Node.js project and tooling
2. add environment validation
3. add Express application and server bootstrap
4. add MongoDB connection lifecycle
5. implement and test `/health`
6. document local setup and the unauthenticated security posture

Do not begin domain endpoints until the shared application foundation and health behavior are passing tests.
