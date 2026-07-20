'use strict';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const REDACTED = '[REDACTED]';

/**
 * Keys that must never reach a log sink. Matching is case-insensitive and
 * substring based so `MONGODB_URI`, `mongodbUri`, and `uri` are all covered.
 */
const SENSITIVE_KEY_PATTERNS = [
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'credential',
  'connectionstring',
  'mongodb_uri',
  'mongodburi',
  'uri',
];

function isSensitiveKey(key) {
  const normalized = String(key).toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function redact(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, depth + 1));
  }

  return Object.entries(value).reduce((accumulator, [key, entry]) => {
    accumulator[key] = isSensitiveKey(key) ? REDACTED : redact(entry, depth + 1);
    return accumulator;
  }, {});
}

function currentLevel() {
  const configured = String(process.env.LOG_LEVEL || '').toLowerCase();
  if (configured in LEVELS) {
    return LEVELS[configured];
  }
  // Tests stay silent unless LOG_LEVEL is set explicitly.
  return process.env.NODE_ENV === 'test' ? -1 : LEVELS.info;
}

function write(level, message, context = {}) {
  if (LEVELS[level] > currentLevel()) {
    return;
  }

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...redact(context),
  };

  const serialized = JSON.stringify(entry);

  if (level === 'error') {
    process.stderr.write(`${serialized}\n`);
    return;
  }

  process.stdout.write(`${serialized}\n`);
}

module.exports = {
  error: (message, context) => write('error', message, context),
  warn: (message, context) => write('warn', message, context),
  info: (message, context) => write('info', message, context),
  debug: (message, context) => write('debug', message, context),
  redact,
  isSensitiveKey,
};
