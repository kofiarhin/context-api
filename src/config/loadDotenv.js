'use strict';

/**
 * Loads a local `.env` file into `process.env` for runtime entrypoints.
 *
 * This is deliberately separate from `config/env.js`: `loadEnv()` must remain a
 * pure parser of the source it is given so that tests can construct an explicit,
 * controlled environment and never inherit a developer's local provider
 * credentials. The runtime entrypoints (the HTTP server, the seed runner) call
 * this once, before reading configuration; the test suite never calls it.
 */
let loaded = false;

function loadDotenv() {
  if (!loaded) {
    require('dotenv').config();
    loaded = true;
  }
}

module.exports = { loadDotenv };
