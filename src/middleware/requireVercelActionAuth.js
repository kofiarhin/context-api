'use strict';

const crypto = require('crypto');
const { getVercelConfig } = require('../config/vercel');
const { AuthenticationRequiredError } = require('../utils/errors');

const BEARER = /^Bearer +(\S+)$/i;

function secretsMatch(supplied, expected) {
  const suppliedDigest = crypto.createHash('sha256').update(supplied, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(suppliedDigest, expectedDigest);
}

function requireVercelActionAuth(baseEnv = {}, options = {}) {
  const source = options.source || process.env;
  let vercelConfig = null;

  try {
    vercelConfig = getVercelConfig(baseEnv, source);
  } catch {
    vercelConfig = null;
  }

  const expectedKeys = [
    vercelConfig && vercelConfig.zoroVercelApiKey,
    baseEnv.zoroGithubApiKey,
    source.ZORO_GITHUB_API_KEY,
  ].filter((value, index, values) => value && values.indexOf(value) === index);

  return function vercelActionAuth(req, res, next) {
    if (!vercelConfig || !vercelConfig.vercelToken || expectedKeys.length === 0) {
      next(new AuthenticationRequiredError());
      return;
    }

    const header = req.get('authorization');
    const match = header ? BEARER.exec(header.trim()) : null;
    const token = match ? match[1] : '';
    const accepted = token && expectedKeys.some((expected) => secretsMatch(token, expected));

    if (!accepted) {
      next(new AuthenticationRequiredError());
      return;
    }

    next();
  };
}

module.exports = requireVercelActionAuth;
module.exports.secretsMatch = secretsMatch;
