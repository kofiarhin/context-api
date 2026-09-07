'use strict';

const crypto = require('crypto');

const { getBlogReadConfig } = require('../config/blog');
const { AuthenticationRequiredError } = require('../utils/errors');

const BEARER = /^Bearer +(\S+)$/i;

function secretsMatch(supplied, expected) {
  const suppliedDigest = crypto.createHash('sha256').update(supplied, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(suppliedDigest, expectedDigest);
}

function requireBlogReadAuth(baseEnv = {}, options = {}) {
  const source = options.source || process.env;
  let config = null;

  try {
    config = getBlogReadConfig(baseEnv, source);
  } catch {
    config = null;
  }

  const expectedKey = config && config.devkofiApiKey;

  return function blogReadAuth(req, res, next) {
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

module.exports = requireBlogReadAuth;
