'use strict';

const crypto = require('crypto');

const { getEngineeringConfig } = require('../config/engineering');
const { AuthenticationRequiredError } = require('../utils/errors');

const BEARER = /^Bearer +(\S+)$/i;

/**
 * Compares two secrets in constant time.
 *
 * Both sides are hashed first so `timingSafeEqual` always receives equal-length
 * buffers; comparing the raw strings would throw on a length mismatch and leak
 * the expected key length through the error path.
 */
function secretsMatch(supplied, expected) {
  const suppliedDigest = crypto.createHash('sha256').update(supplied, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();

  return crypto.timingSafeEqual(suppliedDigest, expectedDigest);
}

/**
 * Guards the unified engineering dispatcher with `ZORO_ENGINEERING_API_KEY`.
 *
 * Unlike `requireVercelActionAuth`, this middleware accepts exactly one key and
 * does not fall back to another gateway's bearer secret. The unified route can
 * reach GitHub, Vercel, Heroku, and the context database in a single call, so
 * honouring a narrower provider key here would silently widen that key's blast
 * radius.
 *
 * It fails closed: an unconfigured key rejects every request rather than
 * defaulting to open access. The supplied token is never logged, attached to
 * `req`, or echoed back.
 */
function requireEngineeringActionAuth(baseEnv = {}, options = {}) {
  const source = options.source || process.env;
  let config = null;

  try {
    config = getEngineeringConfig(baseEnv, source);
  } catch {
    // A malformed key is treated exactly like a missing one: fail closed.
    config = null;
  }

  const expectedKey = config && config.zoroEngineeringApiKey;

  return function engineeringActionAuth(req, res, next) {
    if (!expectedKey) {
      next(new AuthenticationRequiredError());
      return;
    }

    const header = req.get('authorization');
    const match = header ? BEARER.exec(header.trim()) : null;
    const token = match ? match[1] : '';

    if (!token || !secretsMatch(token, expectedKey)) {
      next(new AuthenticationRequiredError());
      return;
    }

    next();
  };
}

module.exports = requireEngineeringActionAuth;
module.exports.secretsMatch = secretsMatch;
