'use strict';

const { getConnectionState, isConnected } = require('../config/database');
const { getEnv } = require('../config/env');

/**
 * Reports application and database availability.
 *
 * Only the environment name and connection state name are exposed; host names,
 * credentials, and connection strings are never included (SPEC §9.1).
 */
function getHealth(req, res) {
  const connected = isConnected();

  res.status(connected ? 200 : 503).json({
    data: {
      status: connected ? 'ok' : 'degraded',
      database: getConnectionState(),
      environment: getEnv().nodeEnv,
      timestamp: new Date().toISOString(),
    },
  });
}

module.exports = { getHealth };
