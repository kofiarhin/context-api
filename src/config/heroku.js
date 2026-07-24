'use strict';

const { MIN_BEARER_KEY_LENGTH } = require('./env');

function split(raw) {
  if (!raw) return [];
  return [...new Set(String(raw).split(',').map((value) => value.trim()).filter(Boolean))];
}

function parseBoolean(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  throw new Error('Boolean configuration values must be true or false.');
}

function parseInteger(raw, fallback, field, min, max) {
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function getHerokuConfig(baseEnv = {}, source = process.env) {
  const token = source.HEROKU_API_TOKEN || baseEnv.herokuApiToken || null;
  const key = source.ZORO_HEROKU_API_KEY || baseEnv.zoroHerokuApiKey || null;
  const selfApp = source.HEROKU_SELF_APP || baseEnv.herokuSelfApp || null;
  const configured = Boolean(token || key || selfApp);
  const problems = [];

  if (configured) {
    if (!token) problems.push('HEROKU_API_TOKEN is required.');
    if (!key) problems.push('ZORO_HEROKU_API_KEY is required.');
    if (!selfApp) problems.push('HEROKU_SELF_APP is required.');
    if (key && key.length < MIN_BEARER_KEY_LENGTH) {
      problems.push(`ZORO_HEROKU_API_KEY must be at least ${MIN_BEARER_KEY_LENGTH} characters.`);
    }
  }

  if (problems.length) throw new Error(`Invalid Heroku gateway configuration:\n- ${problems.join('\n- ')}`);

  return Object.freeze({
    ...baseEnv,
    herokuApiToken: token,
    zoroHerokuApiKey: key,
    herokuSelfApp: selfApp,
    herokuResourceAccess: source.HEROKU_RESOURCE_ACCESS || baseEnv.herokuResourceAccess || 'allowlist',
    herokuAppAllowlist: split(source.HEROKU_APP_ALLOWLIST || baseEnv.herokuAppAllowlist),
    herokuTeamAllowlist: split(source.HEROKU_TEAM_ALLOWLIST || baseEnv.herokuTeamAllowlist),
    herokuPipelineAllowlist: split(source.HEROKU_PIPELINE_ALLOWLIST || baseEnv.herokuPipelineAllowlist),
    herokuSpaceAllowlist: split(source.HEROKU_SPACE_ALLOWLIST || baseEnv.herokuSpaceAllowlist),
    herokuDomainSuffixAllowlist: split(source.HEROKU_DOMAIN_SUFFIX_ALLOWLIST || baseEnv.herokuDomainSuffixAllowlist),
    herokuAddonPlanAllowlist: split(source.HEROKU_ADDON_PLAN_ALLOWLIST || baseEnv.herokuAddonPlanAllowlist),
    herokuDynoSizeAllowlist: split(source.HEROKU_DYNO_SIZE_ALLOWLIST || baseEnv.herokuDynoSizeAllowlist),
    herokuMutationsEnabled: parseBoolean(source.HEROKU_MUTATIONS_ENABLED ?? baseEnv.herokuMutationsEnabled),
    herokuDestructiveOperationsEnabled: parseBoolean(source.HEROKU_DESTRUCTIVE_OPERATIONS_ENABLED ?? baseEnv.herokuDestructiveOperationsEnabled),
    herokuBillingOperationsEnabled: parseBoolean(source.HEROKU_BILLING_OPERATIONS_ENABLED ?? baseEnv.herokuBillingOperationsEnabled),
    herokuAccessAdminOperationsEnabled: parseBoolean(source.HEROKU_ACCESS_ADMIN_OPERATIONS_ENABLED ?? baseEnv.herokuAccessAdminOperationsEnabled),
    herokuPrivateSpaceOperationsEnabled: parseBoolean(source.HEROKU_PRIVATE_SPACE_OPERATIONS_ENABLED ?? baseEnv.herokuPrivateSpaceOperationsEnabled),
    herokuMaxDynoQuantity: parseInteger(source.HEROKU_MAX_DYNO_QUANTITY ?? baseEnv.herokuMaxDynoQuantity, 10, 'HEROKU_MAX_DYNO_QUANTITY', 1, 100),
    herokuRequestTimeoutMs: parseInteger(source.HEROKU_REQUEST_TIMEOUT_MS ?? baseEnv.herokuRequestTimeoutMs, 15000, 'HEROKU_REQUEST_TIMEOUT_MS', 1000, 60000),
    herokuLogFetchTimeoutMs: parseInteger(source.HEROKU_LOG_FETCH_TIMEOUT_MS ?? baseEnv.herokuLogFetchTimeoutMs, 10000, 'HEROKU_LOG_FETCH_TIMEOUT_MS', 1000, 30000),
  });
}

module.exports = { getHerokuConfig, split, parseBoolean, parseInteger };
