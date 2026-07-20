'use strict';

const logger = require('../utils/logger');

/**
 * Logs one structured line per completed request.
 *
 * Only the route template is recorded where available, so path parameters
 * carrying user-supplied values never land in logs. Response bodies are never
 * logged, which keeps full context payloads out of the log stream.
 */
function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const routeTemplate = req.route ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'unmatched';

    logger.info('request.completed', {
      correlationId: req.correlationId,
      method: req.method,
      route: routeTemplate,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    });
  });

  next();
}

module.exports = requestLogger;
