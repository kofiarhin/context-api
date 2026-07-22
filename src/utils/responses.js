'use strict';

const API_VERSION = 'v1';

/**
 * Builds the paginated portion of collection metadata.
 */
function buildPaginationMeta({ total, page, pageSize }) {
  return {
    total,
    page,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

function sendCollection(res, data, pagination = null) {
  const meta = { count: data.length };

  if (pagination) {
    Object.assign(meta, buildPaginationMeta(pagination));
  }

  meta.version = API_VERSION;

  return res.status(200).json({ data, meta });
}

/**
 * Emits a collection whose pagination metadata comes from an upstream service.
 *
 * The GitHub gateway cannot use `sendCollection`: GitHub reports pagination as
 * a cursor-style `hasNextPage` and never returns a total count, so the
 * total/totalPages shape would have to be invented.
 */
function sendPagedCollection(res, data, meta, statusCode = 200) {
  return res.status(statusCode).json({
    data,
    meta: { count: Array.isArray(data) ? data.length : 1, ...meta, version: API_VERSION },
  });
}

function sendResource(res, data, statusCode = 200) {
  return res.status(statusCode).json({
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
  sendCollection,
  sendPagedCollection,
  sendResource,
  buildErrorBody,
};
