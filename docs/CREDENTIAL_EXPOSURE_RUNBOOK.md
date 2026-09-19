# Credential Exposure Response Runbook

**Last updated:** 2026-07-25

## Purpose

This runbook defines the required response when a Context API secret, provider token, private key, database credential, or Zoro Action key is printed, logged, screenshotted, pasted into chat, or otherwise exposed outside its intended secure store.

## Core rule

Treat every exposed credential as compromised.

Deleting terminal output, chat history, screenshots, or logs is not sufficient. Rotate or revoke the credential, update every authorized consumer, and verify the replacement without printing either the old or new value.

## Incident recorded on 2026-07-25

A Heroku release-inspection command printed production config values in cleartext during deployment verification. The exposed classes included provider credentials, a database URI, a GitHub App private key, and Zoro gateway credentials.

Kofi confirmed the affected credentials were rotated. No credential values are stored in this repository or Ideas Hub.

## Immediate response

1. Stop copying or sharing the output.
2. Record only the credential names/classes and exposure context, never the values.
3. Rotate upstream credentials first where the provider controls revocation.
4. Update the Heroku config variables from a secure local source.
5. Update Custom GPT Action authentication values where applicable.
6. Verify health and authenticated read-only operations.
7. Revoke/delete the old provider credential after replacement verification when the provider supports overlap.
8. Review logs and screenshots for additional exposure without reproducing values.

## Rotation scope

Rotate all affected classes, including as applicable:

- GitHub App private keys;
- MongoDB database-user passwords and connection strings;
- Vercel access tokens;
- Heroku API tokens;
- `ZORO_ENGINEERING_API_KEY`;
- `ZORO_GITHUB_API_KEY`;
- `ZORO_VERCEL_API_KEY`;
- `ZORO_HEROKU_API_KEY`;
- any other secret printed in the same output.

## Safe command practices

### Never use for routine verification

Avoid commands or flags that may dump a full config-var table or release environment, including release-inspection forms that expose config values.

Do not run:

```text
heroku config
heroku config:get <SECRET_NAME>
```

for secret-bearing variables during verification, and do not paste secret values inline into shell commands.

### Prefer metadata-only commands

Use:

```bash
heroku releases --app <app-name>
heroku ps --app <app-name>
heroku logs --tail --app <app-name>
```

Use logs only when needed and inspect them for accidental secret output.

### Set secrets without echoing them

Read values silently into shell memory or load them from a secure local secret manager. Avoid command history, `set -x`, debug tracing, clipboard persistence, and screenshots.

Example pattern:

```bash
read -rsp "New value: " SECRET_VALUE
echo
heroku config:set "SECRET_NAME=$SECRET_VALUE" --app <app-name>
unset SECRET_VALUE
```

Do not include real secret names and values in shared scripts, documentation, pull requests, issues, or chat transcripts.

## Verification without disclosure

After rotation:

1. check `/health`;
2. confirm the Heroku web dyno is up;
3. test unauthenticated gateway requests return `401`;
4. test one authenticated read-only request per gateway;
5. verify Custom GPT Actions in a fresh conversation;
6. compare hashes only when necessary and ensure hash output itself is appropriate for the threat model;
7. never print or return decrypted environment-variable values.

## Documentation and logging

Durable records may include:

- incident date;
- affected credential classes;
- source command or workflow category;
- rotation completion status;
- verification performed;
- remaining uncertainty.

Durable records must not include:

- secret values;
- private key material;
- database passwords or full connection strings;
- authorization headers;
- token hashes when they could aid correlation unnecessarily;
- screenshots containing credentials.

## Prevention checklist

- Verification prompts must explicitly prohibit config-value output.
- Agent runbooks must distinguish metadata inspection from secret retrieval.
- CLI commands should be reviewed for hidden config expansion before execution.
- Production verification should use narrow commands and normalized API responses.
- Tests should assert redaction for errors, logs, request bodies, and provider responses.
- Credential rotation should be rehearsed before the next incident.
