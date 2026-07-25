'use strict';

/**
 * Scrubs ambient provider-gateway credentials from `process.env` before any test
 * runs.
 *
 * The Context API no longer loads a developer's `.env` during tests, but an
 * exported shell variable still lands in `process.env`, and code paths that read
 * the `getEnv()` singleton (for example the health controller) would inherit it.
 * Removing every provider variable here — once per test process, before the
 * first test or configuration read — keeps ordinary integration tests
 * deterministic regardless of the ambient developer environment. Provider-
 * specific tests re-supply controlled values through explicit overrides or
 * dedicated env sources, never through `process.env`.
 */
const PROVIDER_PREFIXES = /^(GITHUB_|VERCEL_|HEROKU_|ZORO_)/;

for (const key of Object.keys(process.env)) {
  if (PROVIDER_PREFIXES.test(key)) {
    delete process.env[key];
  }
}

// Drop any configuration cached from a pre-scrub read so getEnv() rebuilds from
// the cleaned environment.
require('../src/config/env').resetEnv();
