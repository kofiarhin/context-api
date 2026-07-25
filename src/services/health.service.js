'use strict';

const { getConnectionState, isConnected } = require('../config/database');
const { getEnv } = require('../config/env');

/**
 * Builds the availability snapshot shared by `GET /health` and the unified
 * dispatcher's `health.check` operation.
 *
 * Only the environment name and the connection state name are exposed. Host
 * names, credentials, and connection strings are never included (SPEC §9.1).
 */
function getHealthSnapshot() {
  const connected = isConnected();

  return {
    connected,
    payload: {
      status: connected ? 'ok' : 'degraded',
      database: getConnectionState(),
      environment: getEnv().nodeEnv,
      timestamp: new Date().toISOString(),
    },
  };
}

module.exports = { getHealthSnapshot };
