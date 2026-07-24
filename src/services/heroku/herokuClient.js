'use strict';

const { getHerokuConfig } = require('../../config/heroku');
const { translateHerokuError } = require('./herokuErrors');

const BASE_URL = 'https://api.heroku.com';
const ACCEPT = 'application/vnd.heroku+json; version=3';

function buildQuery(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else params.set(key, String(value));
  }
  const output = params.toString();
  return output ? `?${output}` : '';
}

async function request(method, path, options = {}) {
  const config = getHerokuConfig(options.baseEnv || {}, options.source || process.env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.herokuRequestTimeoutMs);
  timeout.unref();

  const headers = {
    Accept: ACCEPT,
    Authorization: `Bearer ${config.herokuApiToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'context-api-heroku-gateway/1.0',
    ...(options.headers || {}),
  };
  if (options.expectedEtag) headers['If-Match'] = options.expectedEtag;
  if (options.range) headers.Range = options.range;

  let response;
  try {
    response = await (options.fetchImpl || fetch)(`${BASE_URL}${path}${buildQuery(options.query)}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Heroku request timed out.');
      timeoutError.code = 'HEROKU_TIMEOUT';
      timeoutError.statusCode = 504;
      timeoutError.isOperational = true;
      throw timeoutError;
    }
    const unavailable = new Error('Heroku is currently unavailable.');
    unavailable.code = 'HEROKU_UNAVAILABLE';
    unavailable.statusCode = 502;
    unavailable.isOperational = true;
    throw unavailable;
  } finally {
    clearTimeout(timeout);
  }

  const requestId = response.headers.get('request-id');
  if (!response.ok) throw translateHerokuError(response.status, requestId);

  const text = response.status === 204 ? '' : await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return {
    data,
    meta: {
      herokuRequestId: requestId || undefined,
      etag: response.headers.get('etag') || undefined,
      rateLimitRemaining: Number(response.headers.get('ratelimit-remaining')) || undefined,
      contentRange: response.headers.get('content-range') || undefined,
      asynchronous: response.status === 202,
    },
    status: response.status,
  };
}

module.exports = { request, buildQuery, BASE_URL, ACCEPT };
