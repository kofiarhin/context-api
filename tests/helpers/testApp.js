'use strict';

const createApp = require('../../src/app');
const { baseTestEnv } = require('./testEnv');

/**
 * Builds an app bound to a controlled test environment.
 *
 * The base environment contains only core, non-provider values, so a
 * developer's local `.env` provider credentials never leak into a test. Config
 * overrides (first argument) tune non-provider behavior such as CORS or rate
 * limits, or opt a provider-specific test into explicit gateway config. Provider
 * env sources (second argument) are passed straight to the Vercel and Heroku
 * auth middleware; they default to empty objects so the ambient `process.env` is
 * never consulted unless a test asks for it.
 */
function buildTestApp(overrides = {}, options = {}) {
  const env = { ...baseTestEnv(), ...overrides };

  return createApp({
    env,
    vercelEnvSource: options.vercelEnvSource || {},
    herokuEnvSource: options.herokuEnvSource || {},
    engineeringEnvSource: options.engineeringEnvSource || {},
  });
}

module.exports = { buildTestApp };
