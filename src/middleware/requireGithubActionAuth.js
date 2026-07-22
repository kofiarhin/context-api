'use strict';

const crypto = require('crypto');

const { AuthenticationRequiredError } = require('../utils/errors');

const BEARER = /^Bearer +(.+)$/i;

/**
 * Compares two secrets without leaking their relative length through timing.
 *
 * `timingSafeEqual` throws on unequal-length buffers, so both sides are hashed
 * to a fixed width first. The digests are compared rather than the raw values,
 * which keeps the comparison constant time for any supplied token.
 */
function secretsMatch(supplied, expected) {
  const suppliedDigest = crypto.createHash('sha256').update(supplied, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();

  return crypto.timingSafeEqual(suppliedDigest, expectedDigest);
}

/**
 * Guards every GitHub gateway route with a dedicated bearer API key.
 *
 * This is intentionally separate from the public context routes: the Context
 * API MVP is unauthenticated by design, while the GitHub surface can write to
 * real repositories and therefore must not be reachable without the key.
 *
 * The header value is never logged, never attached to `req`, and never echoed
 * back, so a mistyped token cannot leak through logs or error bodies.
 */
function requireGithubActionAuth(env) {
  const expected = env.zoroGithubApiKey;

  return function githubActionAuth(req, res, next) {
    // An unconfigured gateway denies every request rather than failing open.
    if (!expected) {
      next(new AuthenticationRequiredError());
      return;
    }

    const header = req.get('authorization');

    if (!header) {
      next(new AuthenticationRequiredError());
      return;
    }

    const match = BEARER.exec(header.trim());

    if (!match) {
      next(new AuthenticationRequiredError());
      return;
    }

    const token = match[1].trim();

    if (!token || !secretsMatch(token, expected)) {
      next(new AuthenticationRequiredError());
      return;
    }

    next();
  };
}

module.exports = requireGithubActionAuth;
