'use strict';

const crypto = require('crypto');
const { getHerokuConfig } = require('../config/heroku');
const { AuthenticationRequiredError } = require('../utils/errors');

const BEARER = /^Bearer ([^\s]+)$/i;

function secretsMatch(supplied, expected) {
  const left = crypto.createHash('sha256').update(supplied, 'utf8').digest();
  const right = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
}

function requireHerokuActionAuth(baseEnv = {}, options = {}) {
  let expected = null;
  try {
    expected = getHerokuConfig(baseEnv, options.source || process.env).zoroHerokuApiKey;
  } catch {
    expected = null;
  }

  return function herokuActionAuth(req, res, next) {
    const header = req.get('authorization');
    const match = header ? BEARER.exec(header.trim()) : null;
    const token = match ? match[1] : '';
    if (!expected || !token || !secretsMatch(token, expected)) {
      next(new AuthenticationRequiredError());
      return;
    }
    next();
  };
}

module.exports = requireHerokuActionAuth;
module.exports.secretsMatch = secretsMatch;
