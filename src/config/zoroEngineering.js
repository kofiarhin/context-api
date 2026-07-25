'use strict';

const MIN_BEARER_KEY_LENGTH = 32;

function parseBoolean(raw, field) {
  if (raw === undefined || raw === '') {
    return false;
  }

  if (raw === true || raw === 'true') {
    return true;
  }

  if (raw === false || raw === 'false') {
    return false;
  }

  throw new Error(`Invalid environment configuration:\n- ${field} must be true or false.`);
}

function parseAllowlist(raw) {
  if (!raw) {
    return null;
  }

  const values = String(raw)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return values.length > 0 ? new Set(values) : null;
}

function getZoroEngineeringConfig(source = process.env) {
  const rawKey = source.ZORO_ENGINEERING_API_KEY;
  let apiKey = null;

  if (rawKey !== undefined && rawKey !== '') {
    apiKey = String(rawKey);

    if (apiKey.length < MIN_BEARER_KEY_LENGTH) {
      throw new Error(
        `Invalid environment configuration:\n- ZORO_ENGINEERING_API_KEY must be at least ${MIN_BEARER_KEY_LENGTH} characters.`
      );
    }
  }

  const repositoryAllowlist = parseAllowlist(
    source.ZORO_ENGINEERING_REPOSITORY_ALLOWLIST || source.GITHUB_REPOSITORY_ALLOWLIST
  );

  return Object.freeze({
    apiKey,
    repositoryAllowlist,
    destructiveOperationsEnabled: parseBoolean(
      source.ZORO_ENGINEERING_DESTRUCTIVE_OPERATIONS_ENABLED,
      'ZORO_ENGINEERING_DESTRUCTIVE_OPERATIONS_ENABLED'
    ),
  });
}

module.exports = {
  MIN_BEARER_KEY_LENGTH,
  parseAllowlist,
  getZoroEngineeringConfig,
};
