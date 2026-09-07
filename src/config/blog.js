'use strict';

const { MIN_BEARER_KEY_LENGTH } = require('./env');

function getBlogReadConfig(baseEnv = {}, source = process.env) {
  const key = source.DEVKOFI_API_KEY || baseEnv.devkofiApiKey || null;

  if (key && String(key).length < MIN_BEARER_KEY_LENGTH) {
    throw new Error(
      `DEVKOFI_API_KEY must be at least ${MIN_BEARER_KEY_LENGTH} characters.`
    );
  }

  return Object.freeze({
    ...baseEnv,
    devkofiApiKey: key,
    blogReadConfigured: Boolean(key),
  });
}

module.exports = { getBlogReadConfig };
