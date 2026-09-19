# Context API Documentation

**Last updated:** 2026-07-25

## Gateway and deployment guidance

- [Vercel Gateway Specification](VERCEL_GATEWAY_SPEC.md)
- [Vercel Gateway Implementation Plan](VERCEL_GATEWAY_IMPLEMENTATION_PLAN.md)
- [Vercel Preview Deployment Runbook](VERCEL_PREVIEW_RUNBOOK.md)
- [Deployment and Live Verification](DEPLOYMENT.md)
- [Credential Exposure Response Runbook](CREDENTIAL_EXPOSURE_RUNBOOK.md)
- [GitHub Gateway Specification](GITHUB_GATEWAY_SPEC.md)

## Product and architecture

- [Product Requirements](PRD.md)
- [Technical Specification](SPEC.md)
- [Implementation Plan](PLAN.md)
- [Codebase Audit](CODEBASE_AUDIT.md)
- [Context Read Model](CONTEXT_READ_MODEL.md)

## OpenAPI contracts

Maintained schemas are stored under [`openapi/`](openapi/).

## Current verified direction

- Zoro uses one governed engineering Action for Context API, GitHub, Vercel, Heroku, and operational evidence workflows.
- Vercel Preview requests remain distinct from Production authority.
- Preview intent is translated to an upstream deployment request without a literal `target: preview` field.
- Preview must use a named non-production branch and the gateway verifies Vercel’s returned target.
- Production, promotion, environment mutation, domain/alias changes, and destructive operations remain separately gated.
- Provider credentials and gateway keys stay server-side and must never appear in logs, terminal output, screenshots, API responses, documentation, or operational records.
- Suspected exposure requires rotation and verification; concealment alone is not remediation.
