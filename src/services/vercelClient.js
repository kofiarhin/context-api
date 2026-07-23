'use strict';

const { getVercelConfig } = require('../config/vercel');
const { translateVercelError } = require('./vercelErrors');

const API_ORIGIN = 'https://api.vercel.com';
const DEFAULT_TIMEOUT_MS = 15000;

function appendSearch(url, query = {}) {
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
}

function createVercelClient(baseEnv = {}, options = {}) {
  const env = getVercelConfig(baseEnv, options.source || process.env);
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  async function request(method, path, { query, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const url = new URL(path, API_ORIGIN);
    appendSearch(url, { teamId: env.vercelTeamId, ...query });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${env.vercelToken}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }
      }

      if (!response.ok) throw translateVercelError(response.status, payload);
      return payload;
    } catch (error) {
      if (error && error.isOperational) throw error;
      if (error && error.name === 'AbortError') throw translateVercelError(504, null);
      throw translateVercelError(502, null);
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({ request });
}

module.exports = { createVercelClient, API_ORIGIN, DEFAULT_TIMEOUT_MS };
