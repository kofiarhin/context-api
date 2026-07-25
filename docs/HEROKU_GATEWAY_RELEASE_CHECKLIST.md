# Heroku Gateway Release Checklist

Use this checklist for the implementation defined by [`HEROKU_GATEWAY_SPEC.md`](HEROKU_GATEWAY_SPEC.md).

## Repository verification

- [ ] Confirm the feature branch is based on the intended `main` revision.
- [ ] Confirm no secrets, populated tokens, private keys, certificate keys, webhook secrets, config values, or temporary Heroku URLs are committed.
- [ ] Run `npm ci` from a clean checkout.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run format:check`.
- [ ] Run `npm run verify:github-gateway`.
- [ ] Run `npm run verify:vercel-gateway`.
- [ ] Run `npm run verify:heroku-gateway`.
- [ ] Run `npm run verify:context-read`.
- [ ] Run `npm run verify`.
- [ ] Generate capability schemas with `npm run generate:heroku-actions` when importing direct-route schemas.
- [ ] Confirm every generated Builder schema contains no more than 30 operations.
- [ ] Confirm all operation IDs are unique.

## Security controls

- [ ] Missing, malformed, and incorrect gateway Bearer keys return `401`.
- [ ] Heroku API tokens never appear in responses or logs.
- [ ] Config-var reads return metadata with redacted values.
- [ ] Non-allowlisted apps, teams, pipelines, and spaces fail closed or are filtered from collection responses.
- [ ] Production-sensitive operations require Kofi approval evidence.
- [ ] Destructive operations require both the feature switch and approval evidence.
- [ ] Billing-sensitive operations require both the feature switch and approval evidence.
- [ ] Access-administration operations require both the feature switch and approval evidence.
- [ ] Private Space operations require entitlement, feature switch, allowlist, and approval evidence.
- [ ] Context API self-app deletion and transfer are blocked.
- [ ] Context API self-app web formation cannot be scaled to zero.
- [ ] Required self-app config variables cannot be removed or cleared.
- [ ] Temporary source and log-session URLs are not logged or retained in durable reports.
- [ ] Certificate private keys and webhook secrets are write-only.

## Route and contract verification

- [ ] Every route in `src/services/heroku/herokuRoutes.js` is mounted under `/api/v1/heroku`.
- [ ] The operation dispatcher is available at `/api/v1/heroku/operations/{operationId}`.
- [ ] The committed dispatcher schema validates.
- [ ] Account, region, stack, and rate-limit reads are covered.
- [ ] App lifecycle operations are covered.
- [ ] App features, buildpacks, and stack operations are covered.
- [ ] Config-var metadata and mutations are covered.
- [ ] Dyno and formation operations are covered.
- [ ] Source, build, slug, release, rollback, and log operations are covered.
- [ ] Domain and SNI operations are covered.
- [ ] Add-on and attachment operations are covered.
- [ ] Collaborator operations are covered.
- [ ] Pipeline, coupling, promotion, pipeline config, and pipeline stack operations are covered.
- [ ] Review-app and review-app configuration operations are covered.
- [ ] App and pipeline webhook operations are covered.
- [ ] Team, member, invitation, usage, and invoice operations are covered.
- [ ] Conditional Private Space and VPN operations are covered.

## Pull request and independent review

- [ ] PR references work key `context-api:full-heroku-gateway`.
- [ ] PR lists the exact base and head revisions.
- [ ] PR contains an endpoint completion matrix.
- [ ] PR records verification actually performed and verification not performed.
- [ ] Independent review checks self-protection, approval classification, redaction, retries, route mapping, error translation, and regressions.
- [ ] All actionable review findings are resolved on the feature branch.
- [ ] Merge authority is explicit before merge.

## Deployment

- [ ] Set required Heroku config names without exposing values.
- [ ] Deploy the exact verified merge revision.
- [ ] Record the deployed commit SHA and Heroku release version.
- [ ] Confirm startup, MongoDB connectivity, and `/health`.
- [ ] Confirm existing Context API, GitHub, and Vercel operations remain healthy.
- [ ] Confirm unauthorized Heroku requests return `401` in production.
- [ ] Import the dispatcher or generated capability Action schemas using Bearer authentication.
- [ ] Validate Action parsing in a fresh Zoro conversation.

## Controlled smoke tests

- [ ] Read account and rate-limit metadata.
- [ ] List approved apps and confirm allowlist filtering.
- [ ] Read approved app, formation, dyno, build, release, domain, add-on, pipeline, webhook, team, and eligible space information.
- [ ] Confirm config values are redacted.
- [ ] Confirm non-allowlisted resource access fails.
- [ ] Confirm self-app deletion, transfer, scale-to-zero, and required-config removal fail.
- [ ] Confirm a sensitive mutation without approval fails.
- [ ] Perform an approved reversible mutation against a disposable resource.
- [ ] Confirm stale ETag or expected-state conflicts fail safely.
- [ ] Confirm bounded log retrieval does not expose the temporary log URL.
- [ ] Confirm billing and access-administration switches fail closed when disabled.
- [ ] Clean up every disposable app, review app, domain, add-on, webhook, coupling, or other created resource.
- [ ] Independently verify cleanup.

## Completion evidence

- [ ] Branch, commits, PR, merge commit, deployed commit, and Heroku release are recorded.
- [ ] Test and validator output is retained.
- [ ] Builder schema configuration is recorded without secrets.
- [ ] Live request IDs and operation results are retained safely.
- [ ] Entitlement-dependent operations not live-tested are explicitly listed.
- [ ] Remaining risks and limitations are documented.
- [ ] Ideas Hub project state is updated only after independent verification.
