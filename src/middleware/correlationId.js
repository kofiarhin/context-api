'use strict';

const { randomUUID } = require('node:crypto');

const HEADER = 'x-correlation-id';
const VALID_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Adopts a caller-supplied correlation ID when it is well formed, otherwise
 * generates one. Rejecting malformed IDs prevents header injection into logs.
 */
function correlationId(req, res, next) {
  const incoming = req.get(HEADER);

  req.correlationId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.set(HEADER, req.correlationId);

  next();
}

module.exports = correlationId;
module.exports.HEADER = HEADER;
module.exports.VALID_ID = VALID_ID;
