'use strict';

const crypto = require('node:crypto');

const API_VERSION = 'v1';

/**
 * Builds collection metadata for either the legacy offset contract or the new
 * cursor contract. Totals are included only when the service actually counted
 * the collection.
 */
function buildPaginationMeta(pagination) {
  const mode = pagination.mode || 'offset';

  if (mode === 'cursor') {
    const meta = {
      limit: pagination.limit,
      hasNextPage: Boolean(pagination.hasNextPage),
      nextCursor: pagination.nextCursor || null,
    };

    if (Number.isInteger(pagination.total)) {
      meta.total = pagination.total;
    }

    return meta;
  }

  const meta = {
    page: pagination.page,
    pageSize: pagination.pageSize,
  };

  if (Number.isInteger(pagination.total)) {
    meta.total = pagination.total;
    meta.totalPages =
      pagination.pageSize > 0 ? Math.ceil(pagination.total / pagination.pageSize) : 0;
  }

  return meta;
}

function buildEtag(body) {
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(body))
    .digest('base64url');

  return `W/"${digest}"`;
}

function requestMatchesEtag(req, etag) {
  const supplied = req && req.headers ? req.headers['if-none-match'] : null;

  if (!supplied) {
    return false;
  }

  return String(supplied)
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === etag);
}

function sendJson(res, statusCode, body) {
  const method = res.req && res.req.method;
  const isReadRequest = method === 'GET' || method === 'HEAD';

  if (!isReadRequest) {
    return res.status(statusCode).json(body);
  }

  const etag = buildEtag(body);

  if (typeof res.setHeader === 'function') {
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, must-revalidate');
  }

  if (statusCode === 200 && requestMatchesEtag(res.req, etag)) {
    return res.status(304).end();
  }

  return res.status(statusCode).json(body);
}

function sendCollection(res, data, pagination = null) {
  const meta = { count: data.length };

  if (pagination) {
    Object.assign(meta, buildPaginationMeta(pagination));
  }

  meta.version = API_VERSION;

  return sendJson(res, 200, { data, meta });
}

/**
 * Emits a collection whose pagination metadata comes from an upstream service.
 *
 * The GitHub gateway cannot use `sendCollection`: GitHub reports pagination as
 * a cursor-style `hasNextPage` and never returns a total count, so the
 * total/totalPages shape would have to be invented.
 */
function sendPagedCollection(res, data, meta, statusCode = 200) {
  return sendJson(res, statusCode, {
    data,
    meta: {
      count: Array.isArray(data) ? data.length : 1,
      ...meta,
      version: API_VERSION,
    },
  });
}

function sendResource(res, data, statusCode = 200) {
  return sendJson(res, statusCode, {
    data,
    meta: { version: API_VERSION },
  });
}

function buildErrorBody({ code, message, details = [], correlationId }) {
  const error = { code, message };

  if (Array.isArray(details) && details.length > 0) {
    error.details = details;
  }

  return {
    error,
    meta: { correlationId, version: API_VERSION },
  };
}

module.exports = {
  API_VERSION,
  buildPaginationMeta,
  buildEtag,
  requestMatchesEtag,
  sendCollection,
  sendPagedCollection,
  sendResource,
  buildErrorBody,
};
