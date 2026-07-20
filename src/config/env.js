'use strict';

require('dotenv').config();

const VALID_NODE_ENVS = ['development', 'test', 'production'];
const VALID_LOG_LEVELS = ['error', 'warn', 'info', 'debug'];

const DEFAULTS = {
  LOG_LEVEL: 'info',
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 100,
};

function parseInteger(raw, field, { min, max }, problems) {
  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${field} must be an integer between ${min} and ${max}.`);
    return null;
  }

  return value;
}

function parseOrigins(raw) {
  if (!raw) {
    return [];
  }

  return String(raw)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Validates a raw environment source and returns a frozen configuration object.
 *
 * Throws a single error listing every problem. Error messages deliberately name
 * the offending variable without echoing its value, so a malformed connection
 * string never reaches logs or crash output.
 */
function loadEnv(source = process.env) {
  const problems = [];

  const nodeEnv = source.NODE_ENV;
  if (!nodeEnv) {
    problems.push('NODE_ENV is required.');
  } else if (!VALID_NODE_ENVS.includes(nodeEnv)) {
    problems.push(`NODE_ENV must be one of: ${VALID_NODE_ENVS.join(', ')}.`);
  }

  let port = null;
  if (source.PORT === undefined || source.PORT === '') {
    problems.push('PORT is required.');
  } else {
    port = parseInteger(source.PORT, 'PORT', { min: 1, max: 65535 }, problems);
  }

  const mongodbUri = source.MONGODB_URI;
  if (!mongodbUri) {
    problems.push('MONGODB_URI is required.');
  } else if (!/^mongodb(\+srv)?:\/\//.test(mongodbUri)) {
    problems.push('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
  }

  const logLevel = source.LOG_LEVEL || DEFAULTS.LOG_LEVEL;
  if (!VALID_LOG_LEVELS.includes(logLevel)) {
    problems.push(`LOG_LEVEL must be one of: ${VALID_LOG_LEVELS.join(', ')}.`);
  }

  let rateLimitWindowMs = DEFAULTS.RATE_LIMIT_WINDOW_MS;
  if (source.RATE_LIMIT_WINDOW_MS !== undefined && source.RATE_LIMIT_WINDOW_MS !== '') {
    rateLimitWindowMs = parseInteger(
      source.RATE_LIMIT_WINDOW_MS,
      'RATE_LIMIT_WINDOW_MS',
      { min: 1000, max: 3600000 },
      problems
    );
  }

  let rateLimitMax = DEFAULTS.RATE_LIMIT_MAX;
  if (source.RATE_LIMIT_MAX !== undefined && source.RATE_LIMIT_MAX !== '') {
    rateLimitMax = parseInteger(
      source.RATE_LIMIT_MAX,
      'RATE_LIMIT_MAX',
      { min: 1, max: 1000000 },
      problems
    );
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
  }

  return Object.freeze({
    nodeEnv,
    port,
    mongodbUri,
    logLevel,
    corsOrigins: Object.freeze(parseOrigins(source.CORS_ORIGINS)),
    rateLimitWindowMs,
    rateLimitMax,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
  });
}

let cached = null;

function getEnv() {
  if (!cached) {
    cached = loadEnv();
  }

  return cached;
}

function resetEnv() {
  cached = null;
}

module.exports = { loadEnv, getEnv, resetEnv, VALID_NODE_ENVS, VALID_LOG_LEVELS };
