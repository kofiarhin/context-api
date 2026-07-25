'use strict';

/**
 * The complete, explicit inventory of provider-gateway environment variables the
 * Context API currently understands, grouped by gateway.
 *
 * Test isolation scrubs exactly these names from `process.env` (see
 * `tests/setupEnv.js`) so a developer's ambient shell or local `.env` cannot
 * leak provider credentials into the `getEnv()` singleton and make unrelated
 * integration tests non-deterministic.
 *
 * This is a deliberately CLOSED allowlist, not a `GITHUB_`/`VERCEL_`/`HEROKU_`/
 * `ZORO_` prefix match. A prefix match would silently delete future unrelated
 * variables — an arbitrary `ZORO_UNRELATED_TEST_SETTING`, for example — and hide
 * configuration the application legitimately needs. Every entry below is read by
 * a config loader (`src/config/env.js`, `src/config/vercel.js`,
 * `src/config/heroku.js`) or a gateway middleware. When a config loader gains a
 * new provider variable, add it here; the drift regression test in
 * `tests/unit/providerEnvScrub.test.js` fails if the two ever diverge.
 */

// src/config/env.js (GITHUB_VARIABLES) plus the optional repository-access
// allowlist read in src/middleware/requireGithubRepositoryAccess.js.
const GITHUB_ENV_VARS = [
  'GITHUB_APP_ID', // self-app installation id (numeric)
  'GITHUB_INSTALLATION_ID', // self-app installation id (numeric)
  'GITHUB_PRIVATE_KEY_BASE64', // self-app private key (PEM, Base64)
  'GITHUB_REPOSITORY_ACCESS', // resource-access mode
  'GITHUB_REPOSITORY_ALLOWLIST', // owner/repo allowlist
  'ZORO_GITHUB_API_KEY', // gateway Bearer key
];

// src/config/vercel.js (getVercelConfig).
const VERCEL_ENV_VARS = [
  'VERCEL_TOKEN', // provider credential
  'ZORO_VERCEL_API_KEY', // gateway Bearer key
  'VERCEL_TEAM_ID', // scope selector
  'VERCEL_TEAM_SLUG', // scope selector
  'VERCEL_PROJECT_ALLOWLIST', // allowlist
  'VERCEL_DOMAIN_ALLOWLIST', // allowlist
  'VERCEL_REPOSITORY_ALLOWLIST', // allowlist
  'VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS', // feature switch
];

// src/config/heroku.js (getHerokuConfig).
const HEROKU_ENV_VARS = [
  'HEROKU_API_TOKEN', // provider credential
  'ZORO_HEROKU_API_KEY', // gateway Bearer key
  'HEROKU_SELF_APP', // self-app configuration
  'HEROKU_RESOURCE_ACCESS', // resource-access mode
  'HEROKU_APP_ALLOWLIST', // allowlist
  'HEROKU_TEAM_ALLOWLIST', // allowlist
  'HEROKU_PIPELINE_ALLOWLIST', // allowlist
  'HEROKU_SPACE_ALLOWLIST', // allowlist
  'HEROKU_DOMAIN_SUFFIX_ALLOWLIST', // allowlist
  'HEROKU_ADDON_PLAN_ALLOWLIST', // allowlist
  'HEROKU_DYNO_SIZE_ALLOWLIST', // allowlist
  'HEROKU_MUTATIONS_ENABLED', // feature switch
  'HEROKU_DESTRUCTIVE_OPERATIONS_ENABLED', // feature switch
  'HEROKU_BILLING_OPERATIONS_ENABLED', // feature switch
  'HEROKU_ACCESS_ADMIN_OPERATIONS_ENABLED', // feature switch
  'HEROKU_PRIVATE_SPACE_OPERATIONS_ENABLED', // feature switch
  'HEROKU_MAX_DYNO_QUANTITY', // numeric guardrail
  'HEROKU_REQUEST_TIMEOUT_MS', // timeout control
  'HEROKU_LOG_FETCH_TIMEOUT_MS', // timeout control
];

// src/config/engineering.js (getEngineeringConfig). The unified Zoro dispatcher
// owns exactly one secret and holds no provider credentials of its own.
const ENGINEERING_ENV_VARS = [
  'ZORO_ENGINEERING_API_KEY', // unified dispatcher Bearer key
];

const PROVIDER_ENV_VARS = Object.freeze([
  ...GITHUB_ENV_VARS,
  ...VERCEL_ENV_VARS,
  ...HEROKU_ENV_VARS,
  ...ENGINEERING_ENV_VARS,
]);

/**
 * Deletes only the known provider-gateway variables from the supplied
 * environment object. Unknown variables — including unrelated `ZORO_*` names —
 * are left untouched. Deleting a missing key is a harmless no-op, so this is
 * safe to run against a partially populated environment.
 */
function scrubProviderEnv(env = process.env) {
  for (const key of PROVIDER_ENV_VARS) {
    delete env[key];
  }

  return env;
}

module.exports = {
  PROVIDER_ENV_VARS,
  GITHUB_ENV_VARS,
  VERCEL_ENV_VARS,
  HEROKU_ENV_VARS,
  ENGINEERING_ENV_VARS,
  scrubProviderEnv,
};
