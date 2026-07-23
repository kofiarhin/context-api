'use strict';

const crypto = require('crypto');
const { getVercelConfig } = require('../config/vercel');
const { AuthenticationRequiredError } = require('../utils/errors');

const BEARER = /^Bearer +(.+)$/i;

function secretsMatch(supplied, expected) {
  const suppliedDigest = crypto.createHash('sha256').update(supplied, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(suppliedDigest, expectedDigest);
}

function requireVercelActionAuth(baseEnv = {}, options = {}) {
  let expected = null;

  try {
    expected = getVercelConfig(baseEnv, options.source || process.env).zoroVercelApiKey;
  } catch {
    expected = null;
  }

  return function vercelActionAuth(req, res, next) {
    if (!expected) {
      next(new AuthenticationRequiredError());
      return;
    }

    const header = req.get('authorization');
    const match = header ? BEARER.exec(header.trim()) : null;
    const token = match ? match[1].trim() : '';

    if (!token || !secretsMatch(token, expected)) {
      next(new AuthenticationRequiredError());
      return;
    }

    next();
  };
}

module.exports = requireVercelActionAuth;
module.exports.secretsMatch = secretsMatch;
