'use strict';

const SECRET_KEY =
  /(^|_)(authorization|token|secret|password|private_key|pre_shared_key|api_key|credential|credentials|payment_method|card|bank_account)($|_)/i;
const SENSITIVE_URL_KEY = /(logplex_url|signed_url|download_url|upload_url|put_url|get_url)/i;
const SOURCE_URL_OPERATIONS = new Set();
const REDACTED = '[REDACTED]';

function sanitizeValue(value, options = {}, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, options, seen));
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return REDACTED;
  seen.add(value);

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      output[key] = REDACTED;
      continue;
    }
    if (SENSITIVE_URL_KEY.test(key) && !options.allowSourceUrls) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = sanitizeValue(item, options, seen);
  }
  return output;
}

function serialize(operationId, data) {
  if (typeof data === 'string') return data;
  return sanitizeValue(data, {
    allowSourceUrls: SOURCE_URL_OPERATIONS.has(operationId),
  });
}

module.exports = {
  serialize,
  sanitizeValue,
  SECRET_KEY,
  SENSITIVE_URL_KEY,
  SOURCE_URL_OPERATIONS,
  REDACTED,
};