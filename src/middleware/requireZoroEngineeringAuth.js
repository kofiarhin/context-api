'use strict';

const crypto = require('node:crypto');

const { getZoroEngineeringConfig } = require('../config/zoroEngineering');
const { AuthenticationRequiredError } = require('../utils/errors');

const BEARER = /^Bearer +(.+)$/i;

function secretsMatch(supplied, expected) {
  const suppliedDigest = crypto.createHash('sha256').update(supplied, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();

  return crypto.timingSafeEqual(suppliedDigest, expectedDigest);
}

function requireZoroEngineeringAuth(options = {}) {
  const config = options.config || getZoroEngineeringConfig(options.source || process.env);

  return function zoroEngineeringAuth(req, res, next) {
    if (!config.apiKey) {
      next(new AuthenticationRequiredError());
      return;
    }

    const header = req.get('authorization');
    const match = header ? BEARER.exec(header.trim()) : null;
    const token = match ? match[1].trim() : '';

    if (!token || !secretsMatch(token, config.apiKey)) {
      next(new AuthenticationRequiredError());
      return;
    }

    req.zoroEngineeringPolicy = {
      repositoryAllowlist: config.repositoryAllowlist,
      destructiveOperationsEnabled: config.destructiveOperationsEnabled,
    };
    next();
  };
}

module.exports = requireZoroEngineeringAuth;
module.exports.secretsMatch = secretsMatch;
module.exports.BEARER = BEARER;
