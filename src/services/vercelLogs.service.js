'use strict';

const { getEnv } = require('../config/env');
const { createVercelClient } = require('./vercelClient');
const { serializeLogEvent } = require('./vercelRedaction');

function createLogsService(options = {}) {
  const env = options.env || getEnv();
  const client = options.client || createVercelClient(env, options);

  return Object.freeze({
    async getDeploymentLogs({ deployment, limit = 50, since, until }) {
      const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const payload = await client.request('GET', `/v3/deployments/${encodeURIComponent(deployment)}/events`, {
        query: {
          limit: boundedLimit,
          follow: 0,
          direction: 'backward',
          since,
          until,
        },
      });
      const events = Array.isArray(payload) ? payload : [];
      return {
        data: events.slice(0, boundedLimit).map(serializeLogEvent),
        meta: { limit: boundedLimit, redactionBestEffort: true },
      };
    },
  });
}

let singleton;
function service() {
  if (!singleton) singleton = createLogsService();
  return singleton;
}

module.exports = {
  createLogsService,
  getDeploymentLogs(input) {
    return service().getDeploymentLogs(input);
  },
};
