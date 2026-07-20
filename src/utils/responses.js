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
  sendResource,
  buildErrorBody,
};
