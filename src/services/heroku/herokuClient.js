'use strict';

const { getHerokuConfig } = require('../../config/heroku');
const { AppError } = require('../../utils/errors');
const { translateHerokuError } = require('./herokuErrors');

const BASE_URL = 'https://api.heroku.com';
const ACCEPT = 'application/vnd.heroku+json; version=3';
const MAX_LOG_BYTES = 256 * 1024;

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

function operationalError(code, message, statusCode) {
  return new AppError(code, message, statusCode);
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

  // Defence in depth: a body on a GET or HEAD makes fetch throw synchronously,
  // which surfaces as HEROKU_UNAVAILABLE and hides the real cause. The service
  // already omits it, so reaching this guard means a caller built the request
  // directly.
  const sendsBody = method !== 'GET' && method !== 'HEAD' && options.body !== undefined;

  let response;
  try {
    response = await (options.fetchImpl || fetch)(
      `${BASE_URL}${path}${buildQuery(options.query)}`,
      {
        method,
        headers,
        body: sendsBody ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      }
    );
  } catch (error) {
    if (error.name === 'AbortError') {
      throw operationalError('HEROKU_TIMEOUT', 'Heroku request timed out.', 504);
    }
    throw operationalError('HEROKU_UNAVAILABLE', 'Heroku is currently unavailable.', 502);
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
  const remaining = response.headers.get('ratelimit-remaining');

  return {
    data,
    meta: {
      herokuRequestId: requestId || undefined,
      etag: response.headers.get('etag') || undefined,
      rateLimitRemaining: remaining === null ? undefined : Number(remaining),
      contentRange: response.headers.get('content-range') || undefined,
      asynchronous: response.status === 202,
    },
    status: response.status,
  };
}

async function fetchLogText(urlValue, options = {}) {
  const config = getHerokuConfig(options.baseEnv || {}, options.source || process.env);
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw operationalError('HEROKU_INVALID_LOG_URL', 'Heroku returned an invalid log URL.', 502);
  }
  if (
    url.protocol !== 'https:' ||
    !(url.hostname === 'heroku.com' || url.hostname.endsWith('.heroku.com'))
  ) {
    throw operationalError('HEROKU_INVALID_LOG_URL', 'Heroku returned an untrusted log URL.', 502);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.herokuLogFetchTimeoutMs);
  timeout.unref();
  try {
    const response = await (options.fetchImpl || fetch)(url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { 'User-Agent': 'context-api-heroku-gateway/1.0' },
    });
    if (!response.ok) {
      throw operationalError(
        'HEROKU_LOG_UNAVAILABLE',
        'Heroku logs are currently unavailable.',
        502
      );
    }
    const text = await response.text();
    const truncated = Buffer.byteLength(text, 'utf8') > MAX_LOG_BYTES;
    return {
      text: truncated ? Buffer.from(text).subarray(0, MAX_LOG_BYTES).toString('utf8') : text,
      truncated,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw operationalError('HEROKU_TIMEOUT', 'Heroku log retrieval timed out.', 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  request,
  fetchLogText,
  buildQuery,
  operationalError,
  BASE_URL,
  ACCEPT,
  MAX_LOG_BYTES,
};
