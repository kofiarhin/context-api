# Context API — Product Requirements Document

**Version:** 0.1  
**Status:** Draft / MVP approved for validation  
**Owner:** Kofi  
**Last updated:** 2026-07-19

## 1. Product Overview

Context API is a lightweight persistent-context service for ChatGPT projects, Architect, coding agents, and future applications.

It externalizes durable user and project context from large static instruction sets into structured API resources. A client requests only the context required for the current task and receives a JSON response suitable for prompt injection or application use.

The API is the source of truth for structured personal preferences, coding conventions, project context, Ideas Hub structure, task context, instruction sets, glossary entries, and durable learnings.

## 2. Problem Statement

Long-lived AI projects accumulate profile information, engineering conventions, workflow rules, project knowledge, terminology, and learned preferences inside static instructions or repeated prompts.

This creates several problems:

- Instructions become large and difficult to maintain.
- The same context is duplicated across projects and tools.
- Updates must be repeated in multiple locations.
- Clients load irrelevant context and waste tokens.
- Context has no consistent schema or API contract.
- Durable knowledge is difficult to version, query, or reuse.

## 3. Product Goal

Build a centralized API that stores structured context and allows approved clients to retrieve only the context needed for a task.

Typical flow:

1. A client determines what context it needs.
2. The client calls one or more Context API endpoints.
3. The API reads the relevant records from the database.
4. The API returns normalized JSON.
5. The client injects or applies that context during its workflow.

## 4. MVP Objectives

The MVP must:

- Store context in clearly separated domains.
- Expose read endpoints for each domain.
- Return predictable JSON responses.
- Support retrieving a collection or a single record where applicable.
- Keep the initial implementation simple enough to validate the architecture quickly.
- Document that authentication is intentionally deferred.
- Avoid storing secrets, access tokens, passwords, or private keys.

## 5. Non-Goals for MVP

The MVP will not include:

- Authentication or authorization
- Multi-user accounts
- Role-based access control
- A context-management dashboard
- Semantic or vector search
- Automatic AI learning ingestion
- Webhooks or event synchronization
- Full audit history
- Encryption managed at the application layer
- Advanced versioning or rollback
- Public production readiness

## 6. Target Consumers

Initial consumers include:

- ChatGPT project workflows
- Architect instruction workflows
- Coding agents
- Local development tools
- The Ideas Hub
- Future personal productivity applications

## 7. Context Domains

### 7.1 Profile

Stores durable information about the user and preferred interaction style.

Example fields:

- display name
- professional roles
- preferred technology stack
- response preferences
- testing preferences
- default architecture preferences
- content and communication preferences

### 7.2 Coding Conventions

Stores reusable engineering rules and standards.

Example categories:

- frontend conventions
- backend conventions
- TypeScript and JavaScript conventions
- folder structures
- naming conventions
- testing conventions
- state-management rules
- API design conventions
- environment-variable conventions
- dependency preferences

Conventions should be independently addressable so a client can request only the relevant language, framework, layer, or project scope.

### 7.3 Projects

Stores structured project-level context.

Example fields:

- project ID and slug
- name and summary
- lifecycle state
- repository URL
- live URL
- technology stack
- current focus
- milestones
- architecture summary
- related context references

The Ideas Hub remains the durable narrative source for project knowledge unless a later decision changes that responsibility. Context API may expose indexed or normalized project context without silently replacing Ideas Hub governance.

### 7.4 Tasks

Stores task context that clients may retrieve and act upon.

Example fields:

- task ID
- title and description
- project reference
- status
- priority
- acceptance criteria
- dependencies
- source reference
- created and updated timestamps

Initial task support is read-oriented. The MVP does not attempt to become a complete project-management system.

### 7.5 Instruction Sets

Stores reusable instruction fragments and workflow rules.

Examples:

- discovery workflow
- specification workflow
- implementation workflow
- verification workflow
- code-review workflow
- documentation workflow
- repository update workflow

Instruction sets should be modular, versionable, and retrievable by key so clients do not need to load every instruction for every task.

### 7.6 Ideas Hub Metadata

Stores structured information describing how the Ideas Hub is organized and governed.

Example content:

- canonical files and their responsibilities
- repository layout
- project record structure
- lifecycle definitions
- workflow definitions
- source-of-truth rules
- record relationships
- update-routing rules

This domain allows a client to understand the Ideas Hub without embedding its full architecture in static project instructions.

### 7.7 Glossary

Stores indexed terminology used across projects and workflows.

Example fields:

- term
- normalized key
- definition
- aliases
- scope
- related terms
- source reference

Examples include Architect, Ideas Hub, Discovery, Shared Understanding, Ready Task, Verification, Run, and Workflow.

### 7.8 Learnings

Stores durable, reviewed learnings that are useful across future interactions.

Examples:

- stable user preferences
- successful workflow patterns
- architecture decisions
- recurring mistakes to avoid
- durable lessons from completed work

Temporary observations, sensitive personal data, raw chat history, and unverified assumptions must not be promoted automatically into durable learnings.

## 8. Proposed API

All endpoints are initially versioned under `/api/v1`.

### Health

- `GET /health`

Returns service status and basic environment metadata that does not expose secrets.

### Profile

- `GET /api/v1/profile`

### Coding conventions

- `GET /api/v1/coding-conventions`
- `GET /api/v1/coding-conventions/:key`

Suggested filters:

- `scope`
- `technology`
- `layer`
- `project`

### Projects

- `GET /api/v1/projects`
- `GET /api/v1/projects/:projectId`

Suggested filters:

- `status`
- `technology`
- `updatedAfter`

### Tasks

- `GET /api/v1/tasks`
- `GET /api/v1/tasks/:taskId`

Suggested filters:

- `projectId`
- `status`
- `priority`

### Instruction sets

- `GET /api/v1/instruction-sets`
- `GET /api/v1/instruction-sets/:key`

### Ideas Hub

- `GET /api/v1/ideas-hub`
- `GET /api/v1/ideas-hub/:section`

### Glossary

- `GET /api/v1/glossary`
- `GET /api/v1/glossary/:term`

Suggested filters:

- `query`
- `scope`

### Learnings

- `GET /api/v1/learnings`
- `GET /api/v1/learnings/:learningId`

Suggested filters:

- `category`
- `projectId`
- `status`

## 9. Response Contract

Successful collection response:

```json
{
  "data": [],
  "meta": {
    "count": 0,
    "version": "v1"
  }
}
```

Successful single-resource response:

```json
{
  "data": {},
  "meta": {
    "version": "v1"
  }
}
```

Error response:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found."
  }
}
```

## 10. Proposed Data Model

Suggested MongoDB collections:

- `profiles`
- `coding_conventions`
- `projects`
- `tasks`
- `instruction_sets`
- `ideas_hub_context`
- `glossary_entries`
- `learnings`

Shared document fields where applicable:

- `_id`
- `key` or `slug`
- `title`
- `description` or `content`
- `scope`
- `tags`
- `source`
- `status`
- `version`
- `createdAt`
- `updatedAt`

Records should use stable machine-readable keys and human-readable labels. References should use IDs or stable slugs rather than duplicated free-text names.

## 11. Functional Requirements

### FR-1: Domain retrieval

The API must return context grouped by its defined domain.

### FR-2: Targeted retrieval

Clients must be able to retrieve a single record or filtered subset without downloading the entire context database.

### FR-3: Predictable responses

All endpoints must use a consistent success and error envelope.

### FR-4: Input validation

Route parameters and query parameters must be validated even though authentication is deferred.

### FR-5: Safe serialization

Responses must not include database internals or environment secrets.

### FR-6: Health monitoring

The service must expose a health endpoint that confirms application and database availability.

### FR-7: Seed data

The repository must support repeatable seed data for local MVP validation.

### FR-8: Source traceability

Context records should support a source reference so clients can distinguish user-approved knowledge, Ideas Hub-derived knowledge, and system-generated records.

## 12. Non-Functional Requirements

- Node.js and Express backend
- MongoDB persistence
- Environment variables for deployment configuration
- JSON-only API responses for MVP
- Clear separation between routes, controllers, services, models, and validation
- Jest tests for backend behavior
- Deterministic seed process
- Useful request and error logging without sensitive values
- API versioning from the first public route

## 13. Security Position for MVP

Authentication is deliberately excluded from the proof-of-concept implementation.

The initial deployment may rely on an undisclosed URL and restricted usage while validating the idea. This is security by obscurity and is not sufficient for a public or production service.

MVP safeguards still required:

- Never commit or store secrets in context records.
- Use environment variables for database URLs and deployment settings.
- Validate all request parameters.
- Limit response fields.
- Add basic rate limiting when exposed to the internet.
- Configure CORS deliberately rather than allowing every origin by default.
- Avoid write endpoints until authentication and authorization are implemented.
- Treat all stored MVP data as potentially publicly readable.

Before storing private or sensitive context, the API must add proper authentication and authorization.

## 14. Future Security Requirements

A production-ready version should support:

- Bearer token or API-key authentication
- Per-client credentials
- Hashed credential storage
- Credential rotation and revocation
- Role- and scope-based authorization
- Separate read and write permissions
- Rate limiting and abuse controls
- Audit logs
- Request correlation IDs
- Secret-manager integration
- Encryption in transit and at rest
- Optional request signing for trusted service-to-service calls

## 15. Edge Cases

The implementation must account for:

- Missing context records
- Duplicate keys or glossary aliases
- Conflicting conventions across global and project scopes
- Stale or superseded learnings
- Deleted or renamed projects
- Circular references between context records
- Large context payloads
- Invalid filters
- Unknown API versions
- Database unavailability
- Partial seed failures
- A client requesting private data before authentication exists
- Instruction-set changes that could break older clients
- Ideas Hub and Context API records becoming inconsistent

Precedence rules for conflicting context should be explicit. A sensible future default is project-specific context over global context, with higher version and approved status considered before draft records.

## 16. Observability

The MVP should log:

- request method and route
- response status
- duration
- correlation ID
- database connection failures
- validation failures

Logs must not include full context payloads, secrets, tokens, or private database connection strings.

## 17. Testing Requirements

The backend test suite should cover:

- health endpoint behavior
- successful collection retrieval
- successful single-resource retrieval
- missing-resource errors
- invalid query and route parameters
- database/service failures
- response-envelope consistency
- filtering behavior
- seed-data integrity

Jest is the default backend test framework.

## 18. MVP Acceptance Criteria

The MVP is complete when:

- The service can be installed and run locally.
- MongoDB stores the defined context domains.
- Seed data can populate representative records.
- Every MVP read endpoint returns the documented response envelope.
- Filtering works for the primary use cases.
- Validation and error handling are covered by tests.
- No secrets are committed or returned.
- A sample client can request coding conventions, project context, instruction sets, glossary entries, and Ideas Hub metadata independently.
- The repository documents the temporary unauthenticated security posture.
- Authentication remains clearly identified as required before private or production use.

## 19. Success Metrics

The architecture is validated when:

- A client retrieves only the context required for a task.
- Updating a database record changes future responses without editing static project instructions.
- The same context can be reused by more than one client.
- Context payload size is meaningfully smaller than loading all instructions every time.
- Context domains remain understandable and maintainable as records are added.

## 20. Delivery Phases

### Phase 1 — Foundation

- Express application structure
- MongoDB connection
- health endpoint
- error handling
- validation foundation
- test setup

### Phase 2 — Read API

- schemas and seed data
- profile endpoint
- coding conventions endpoints
- projects endpoints
- instruction sets endpoints
- Ideas Hub endpoints
- glossary endpoints
- learnings endpoints
- task endpoints

### Phase 3 — Validation

- sample client integration
- payload-size comparison
- missing and conflicting context tests
- deployment test
- MVP findings and architecture decision

### Phase 4 — Security and Writes

Deferred until the MVP proves useful:

- authentication
- authorization
- write endpoints
- audit history
- context-management UI
- controlled learning ingestion
