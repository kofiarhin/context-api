'use strict';

const MIN_BEARER_KEY_LENGTH = 32;

/**
 * Parses a boolean switch, failing startup on anything ambiguous.
 *
 * `fallback` is what an omitted or blank variable means. It exists for
 * ZORO_FULL_OPERATOR_MODE, which defaults to enabled; every other switch in this
 * file stays opt-in and keeps the default `false`. A value that is neither
 * `true` nor `false` is always an error rather than a silent fallback, so a
 * typo like `ZORO_FULL_OPERATOR_MODE=no` cannot quietly select a mode.
 */
function parseBoolean(raw, field, fallback = false) {
  if (raw === undefined || raw === '') {
    return fallback;
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
    /**
     * Full Operator mode.
     *
     * Enabled unless explicitly disabled, so an unset variable is the operating
     * default rather than a silent downgrade. It removes only the *per-request*
     * Kofi approval step for write, merge, production-sensitive,
     * security-sensitive, billing, and access-admin work — the standing
     * authority is the deployment itself.
     *
     * It deliberately does not reach destructive operations, expected-state
     * checks, provider allowlists, feature switches, redaction, or Context API
     * self-protection. Those are enforced elsewhere and no request field on this
     * path can skip them.
     */
    fullOperatorMode: parseBoolean(source.ZORO_FULL_OPERATOR_MODE, 'ZORO_FULL_OPERATOR_MODE', true),
    destructiveOperationsEnabled: parseBoolean(
      source.ZORO_ENGINEERING_DESTRUCTIVE_OPERATIONS_ENABLED,
      'ZORO_ENGINEERING_DESTRUCTIVE_OPERATIONS_ENABLED'
    ),
  });
}

module.exports = {
  MIN_BEARER_KEY_LENGTH,
  parseBoolean,
  parseAllowlist,
  getZoroEngineeringConfig,
};
