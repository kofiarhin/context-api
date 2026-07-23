'use strict';

const { MIN_BEARER_KEY_LENGTH } = require('./env');

function split(raw) {
  if (!raw) return [];
  return [...new Set(String(raw).split(',').map((item) => item.trim()).filter(Boolean))];
}

function parseBoolean(raw) {
  return String(raw || '').toLowerCase() === 'true';
}

function getVercelConfig(baseEnv = {}, source = process.env) {
  const token = source.VERCEL_TOKEN || baseEnv.vercelToken || null;
  const key = source.ZORO_VERCEL_API_KEY || baseEnv.zoroVercelApiKey || null;
  const teamId = source.VERCEL_TEAM_ID || baseEnv.vercelTeamId || null;
  const configured = Boolean(token || key || teamId);
  const problems = [];

  if (configured) {
    if (!token) problems.push('VERCEL_TOKEN is required.');
    if (!key) problems.push('ZORO_VERCEL_API_KEY is required.');
    if (key && key.length < MIN_BEARER_KEY_LENGTH) {
      problems.push(`ZORO_VERCEL_API_KEY must be at least ${MIN_BEARER_KEY_LENGTH} characters.`);
    }
  }

  if (problems.length) {
    throw new Error(`Invalid Vercel gateway configuration:\n- ${problems.join('\n- ')}`);
  }

  return Object.freeze({
    ...baseEnv,
    vercelToken: token,
    vercelTeamId: teamId,
    vercelTeamSlug: source.VERCEL_TEAM_SLUG || baseEnv.vercelTeamSlug || null,
    zoroVercelApiKey: key,
    vercelProjectAllowlist: split(source.VERCEL_PROJECT_ALLOWLIST || baseEnv.vercelProjectAllowlist),
    vercelDomainAllowlist: split(source.VERCEL_DOMAIN_ALLOWLIST || baseEnv.vercelDomainAllowlist),
    vercelRepositoryAllowlist: split(source.VERCEL_REPOSITORY_ALLOWLIST || baseEnv.vercelRepositoryAllowlist),
    vercelAllowDestructiveOperations: parseBoolean(
      source.VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS ?? baseEnv.vercelAllowDestructiveOperations
    ),
  });
}

module.exports = { getVercelConfig, split, parseBoolean };
