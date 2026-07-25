'use strict';

const { redactText } = require('../vercelRedaction');

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 100;

/**
 * Field names whose *values* are never persisted, regardless of content.
 *
 * This is a key-name allowlist inversion rather than a value heuristic: an agent
 * that posts `{ "authorization": "Bearer ..." }` must not depend on the value
 * pattern matching for the secret to be dropped.
 */
const SENSITIVE_KEY =
  /(authorization|token|secret|password|passphrase|private[_-]?key|credential|api[_-]?key|cookie|session|signature|connection[_-]?string|config[_-]?vars?|env[_-]?vars?|encrypted)/i;

/**
 * Hosts and URL shapes that are short-lived provider handles.
 *
 * These leak access, not just information: a Heroku logplex session URL or a
 * pre-signed S3 slug URL is a bearer credential in disguise, and it would still
 * be live for anyone who later read the log. Any URL carrying a signature or
 * token query parameter is treated the same way.
 */
const TEMPORARY_URL =
  /https?:\/\/[^\s"']*(?:logplex|logs-api|\.s3[.-][^\s"']*amazonaws\.com|storage\.googleapis\.com|blob\.core\.windows\.net|vercel-user-uploads|codeload\.github\.com)[^\s"']*/gi;
const SIGNED_URL =
  /https?:\/\/[^\s"']*[?&](?:x-amz-signature|x-amz-credential|signature|sig|token|access_token|key|expires)=[^\s"'&]+[^\s"']*/gi;

function scrubString(value) {
  const text = redactText(value);

  return text.replace(TEMPORARY_URL, REDACTED).replace(SIGNED_URL, REDACTED);
}

/**
 * Recursively redacts a value destined for the append-only DevOps log.
 *
 * Depth, array length, and key count are bounded so a hostile payload cannot
 * turn one log write into unbounded work or an unbounded document.
 */
function redactValue(value, depth = 0) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return scrubString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((entry) => redactValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const output = {};

    for (const [key, entry] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(entry, depth + 1);
    }

    return output;
  }

  // Functions, symbols, and bigints have no meaning in a log payload.
  return REDACTED;
}

/**
 * Redacts a structured detail payload before it is persisted.
 */
function redactDetails(details) {
  if (details === undefined || details === null) {
    return null;
  }

  if (typeof details !== 'object' || Array.isArray(details)) {
    return { value: redactValue(details) };
  }

  return redactValue(details);
}

module.exports = {
  redactValue,
  redactDetails,
  scrubString,
  REDACTED,
  SENSITIVE_KEY,
  TEMPORARY_URL,
  SIGNED_URL,
  MAX_DEPTH,
};
