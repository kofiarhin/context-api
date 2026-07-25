'use strict';

const { getHealthSnapshot } = require('../services/health.service');

/**
 * Reports application and database availability.
 *
 * The snapshot itself lives in `health.service` so the unified dispatcher's
 * `health.check` operation can return exactly the same body without this route
 * being called over HTTP. Only the environment name and connection state name
 * are exposed; host names, credentials, and connection strings are never
 * included (SPEC §9.1).
 */
function getHealth(req, res) {
  const { connected, payload } = getHealthSnapshot();

  res.status(connected ? 200 : 503).json({ data: payload });
}

module.exports = { getHealth };
