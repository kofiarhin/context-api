# Heroku Gateway Implementation Notes

**Branch:** `feat/full-heroku-gateway`  
**Work key:** `context-api:full-heroku-gateway`  
**Upstream reference reviewed:** Heroku Platform API, current reference dated 2026-07-01

## Purpose

Record implementation-level corrections made while reconciling the approved gateway specification with the current official Heroku Platform API contract.

## Confirmed route corrections

- A single dyno is restarted with `DELETE /apps/{app}/dynos/{dyno}`.
- A single dyno is stopped with `POST /apps/{app}/dynos/{dyno}/actions/stop`.
- All dynos are restarted with `DELETE /apps/{app}/dynos`.
- Dynos for a formation type are restarted with `DELETE /apps/{app}/formations/{type}`.
- Dynos for a formation type are stopped with `POST /apps/{app}/formations/{type}/actions/stop`.
- Formation reads and scaling updates continue to use `/apps/{app}/formation` and `/apps/{app}/formation/{type}`.
- App stack changes are performed through `PATCH /apps/{app}` using `build_stack`; the gateway retains `/apps/{app}/stack` as its normalized route.
- Available app stacks are read from `/apps/{app}/available-stacks`.
- Available app dyno sizes are read from `/apps/{app}/available-dyno-sizes`.
- App transfers are created at `/account/app-transfers` and subsequently read, updated, or deleted by transfer ID.
- Pipeline promotion targets are read from `/pipeline-promotions/{promotion}/promotion-targets`.
- Review App Configuration supports GET, POST, PATCH, and DELETE at `/pipelines/{pipeline}/review-app-config`.
- App webhooks support update, delivery inspection, and webhook-event discovery.
- Private Spaces VPN connections support update in addition to create, read, list, and delete.

## Unsupported specification item

The current official Platform API reference does not document a Pipeline Webhook resource. The implementation therefore does not expose invented `/pipelines/{pipeline}/webhooks` upstream operations. App webhooks remain fully represented.

This is treated as upstream-contract reconciliation, not silent scope reduction. Pipeline webhook support can be added later if Heroku publishes an authoritative endpoint.

## GPT Action strategy

The repository exposes:

```text
POST /api/v1/heroku/operations/{operationId}
```

This dispatcher keeps the GPT Action operation count small while routing only registered operation IDs through the same validation, allowlist, approval, self-protection, redaction, and error-translation controls used by direct REST routes.

The generator can additionally produce direct-route capability schemas split into groups of at most 30 operations.

## Verification limitation

Repository files were implemented and reviewed through GitHub readback. A clean checkout could not be obtained in the current execution environment because external GitHub DNS resolution was unavailable. Consequently, `npm ci`, Jest, ESLint, Prettier, release validators, and generated direct-route schema files have not yet been executed locally. They remain mandatory before merge.
