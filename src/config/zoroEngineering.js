'use strict';

const MIN_BEARER_KEY_LENGTH = 32;

function parseBoolean(raw, field, fallback = false) {
  if (raw === undefined || raw === '') return fallback;
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  throw new Error(`Invalid environment configuration:\n- ${field} must be true or false.`);
}

function parseAllowlist(raw) {
  if (!raw) return null;
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

  const githubUserAccessToken = source.GITHUB_USER_ACCESS_TOKEN
    ? String(source.GITHUB_USER_ACCESS_TOKEN)
    : null;
  const githubAllowedOwner = String(source.GITHUB_ALLOWED_OWNER || 'kofiarhin')
    .trim()
    .toLowerCase();

  return Object.freeze({
    apiKey,
    repositoryAllowlist,
    fullOperatorMode: parseBoolean(
      source.ZORO_FULL_OPERATOR_MODE,
      'ZORO_FULL_OPERATOR_MODE',
      true
    ),
    destructiveOperationsEnabled: parseBoolean(
      source.ZORO_ENGINEERING_DESTRUCTIVE_OPERATIONS_ENABLED,
      'ZORO_ENGINEERING_DESTRUCTIVE_OPERATIONS_ENABLED'
    ),
    githubUserAccessToken,
    githubAllowedOwner,
    githubRepositoryCreationEnabled: parseBoolean(
      source.GITHUB_REPOSITORY_CREATION_ENABLED,
      'GITHUB_REPOSITORY_CREATION_ENABLED'
    ),
  });
}

module.exports = {
  MIN_BEARER_KEY_LENGTH,
  parseBoolean,
  parseAllowlist,
  getZoroEngineeringConfig,
};
