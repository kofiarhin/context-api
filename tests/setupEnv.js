'use strict';

/**
 * Scrubs ambient provider-gateway credentials from `process.env` before any test
 * runs.
 *
 * The Context API no longer loads a developer's `.env` during tests, but an
 * exported shell variable still lands in `process.env`, and code paths that read
 * the `getEnv()` singleton (for example the health controller) would inherit it.
 * Removing the known provider variables here — once per test process, before the
 * first test or configuration read — keeps ordinary integration tests
 * deterministic regardless of the ambient developer environment. Provider-
 * specific tests re-supply controlled values through explicit overrides or
 * dedicated env sources, never through `process.env`.
 *
 * The scrub is a closed allowlist (`tests/helpers/providerEnvVars.js`), not a
 * `GITHUB_`/`VERCEL_`/`HEROKU_`/`ZORO_` prefix match, so it cannot silently
 * delete unrelated variables the application may legitimately read.
 */
const { scrubProviderEnv } = require('./helpers/providerEnvVars');

scrubProviderEnv(process.env);

// Drop any configuration cached from a pre-scrub read so getEnv() rebuilds from
// the cleaned environment.
require('../src/config/env').resetEnv();
