# Vercel Preview Deployment Runbook

**Last updated:** 2026-07-25

## Purpose

This runbook defines the verified Context API behavior for safe Vercel Preview deployments initiated through Zoro.

## Verified operating model

The caller may request:

```json
{
  "target": "preview"
}
```

Context API treats that as Preview intent, but the upstream Vercel create-deployment request must omit the `target` field. Vercel represents a Preview deployment by the absence of `target: "production"`; forwarding a literal `target: "preview"` is unsupported.

Production remains explicit:

```json
{
  "target": "production",
  "approval": {
    "confirmed": true,
    "scope": "production",
    "reason": "Explicit user-approved production deployment"
  }
}
```

## Preview safety rules

Before creating a deployment, the gateway must:

1. require a named Git branch/ref for Git-connected Preview deployments;
2. resolve the project production branch from configured policy or Vercel project metadata;
3. normalize optional `refs/heads/` prefixes and supported branch fields;
4. reject the request when the requested branch is the production branch;
5. remove the public Preview target and approval fields from the upstream payload;
6. preserve repository, project, and authority policy checks.

After Vercel creates the deployment, the gateway must inspect the raw result before serialization.

If Preview was requested but Vercel reports Production through `target`, `environment`, or an equivalent production flag, the gateway must:

- return a governed conflict/forbidden error;
- include safe identifiers such as deployment ID, requested target, returned target, and Git ref;
- stop additional deployment writes;
- not silently cancel, delete, promote, alias, or roll back the deployment.

## Verified milestone

On 2026-07-25, the live gateway created a genuine Preview deployment for:

- Repository: `kofiarhin/memory-game`
- Project: `memory-game`
- Branch: `preview/memory-game-full-flow-test`
- Source commit: `5de3ce417c83f7ffa56e3ea09d6e1f148d2c95bf`
- Deployment ID: `dpl_4QmFJW3EAHnd3iL1sHgMuJeYHcBT`
- Requested target: `preview`
- Returned target: `preview`
- Final state: `READY`
- Reported Production alias impact: none

The Preview-handling fix was running in Context API Heroku release `v34` from commit `ef0b4e0` on branch `fix/vercel-preview-deployment-target` when this verification succeeded.

Repository/default-branch reconciliation must be checked separately; a successful deployment does not prove GitHub `main` matches the deployed Heroku commit.

## Recommended verification sequence

1. Read the GitHub branch and source SHA.
2. Read the Vercel project and production branch.
3. Confirm the requested branch is not the production branch.
4. Create exactly one Preview deployment.
5. Compare requested and returned targets immediately.
6. Poll until `READY`, failed, or canceled.
7. Retrieve build events/logs on failure.
8. Verify the Preview URL on success.
9. Confirm Production aliases/domains did not move.
10. Record only verified identifiers and sanitized evidence.

## Stop conditions

Stop before or immediately after the relevant write when:

- no Git branch/ref is supplied;
- the requested branch is the production branch;
- project or repository policy rejects the resource;
- required authority is missing;
- Vercel returns Production for a Preview request;
- the returned source branch or commit differs from the verified input;
- a required environment variable is missing and changing it was not authorized.

## Non-goals

This flow does not authorize:

- Production deployment or promotion;
- Production alias/domain changes;
- environment-variable mutation;
- rollback or deletion;
- merging the source branch;
- destructive Vercel operations.

Those actions remain separately approval- and confirmation-gated.
