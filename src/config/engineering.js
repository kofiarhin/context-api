'use strict';

const { MIN_BEARER_KEY_LENGTH } = require('./env');

/**
 * Configuration for the unified Zoro engineering dispatcher.
 *
 * This gateway deliberately owns exactly one secret: `ZORO_ENGINEERING_API_KEY`,
 * the bearer key an external agent presents to
 * `POST /api/v1/zoro/operations/:operationId`. It does **not** carry provider
 * credentials. GitHub App keys, the Vercel token, and the Heroku API token stay
 * behind their own config loaders (`config/env.js`, `config/vercel.js`,
 * `config/heroku.js`) and are read only by the provider services the dispatcher
 * delegates to, so the unified route can never expose or substitute them.
 *
 * Like the Vercel and Heroku loaders, the gateway is optional outside
 * production: supplying no key leaves it unconfigured and the route fails closed
 * with 401. Supplying a key validates it immediately, so a truncated paste
 * surfaces at startup rather than as a silent authentication failure.
 */
function getEngineeringConfig(baseEnv = {}, source = process.env) {
  const key = source.ZORO_ENGINEERING_API_KEY || baseEnv.zoroEngineeringApiKey || null;
  const problems = [];

  if (key && String(key).length < MIN_BEARER_KEY_LENGTH) {
    // The variable is named but its value is never echoed, so a rejected secret
    // cannot reach a crash log or an error response.
    problems.push(`ZORO_ENGINEERING_API_KEY must be at least ${MIN_BEARER_KEY_LENGTH} characters.`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid engineering gateway configuration:\n- ${problems.join('\n- ')}`);
  }

  return Object.freeze({
    ...baseEnv,
    zoroEngineeringApiKey: key,
    engineeringConfigured: Boolean(key),
  });
}

module.exports = { getEngineeringConfig };
