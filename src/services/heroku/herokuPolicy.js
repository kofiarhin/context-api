'use strict';

const { AppError } = require('../../utils/errors');
const { getHerokuConfig } = require('../../config/heroku');

const SENSITIVE_KEYS = /(token|secret|password|private[_-]?key|database_url|mongodb|redis|credential|certificate|api[_-]?key|uri|url)/i;
const SAFE_CONFIG_KEYS = new Set(['NODE_ENV', 'LOG_LEVEL']);
const REQUIRED_SELF_KEYS = new Set(['HEROKU_API_TOKEN', 'ZORO_HEROKU_API_KEY', 'MONGODB_URI', 'PORT']);

function denied(message) {
  return new AppError('HEROKU_RESOURCE_FORBIDDEN', message, 403);
}

function matches(value, allowlist) {
  if (!value) return true;
  return allowlist.some((item) => item.toLowerCase() === String(value).toLowerCase());
}

function requireApproval(input, classification) {
  if (classification === 'read' || classification === 'normal-write') return;
  const approval = input.approval;
  if (!approval || approval.approvedBy !== 'Kofi' || !approval.authority || !approval.reason) {
    throw denied('Explicit Kofi approval evidence is required for this Heroku operation.');
  }
}

function enforce({ input, descriptor, baseEnv = {}, source = process.env }) {
  const config = getHerokuConfig(baseEnv, source);
  const classification = descriptor.classification;
  const mutating = descriptor.method !== 'GET';

  if (mutating && !config.herokuMutationsEnabled) throw denied('Heroku mutations are disabled.');
  if (classification === 'destructive' && !config.herokuDestructiveOperationsEnabled) throw denied('Destructive Heroku operations are disabled.');
  if (classification === 'billing-sensitive' && !config.herokuBillingOperationsEnabled) throw denied('Billing-sensitive Heroku operations are disabled.');
  if (classification === 'access-admin' && !config.herokuAccessAdminOperationsEnabled) throw denied('Heroku access administration is disabled.');
  if (classification === 'private-space-admin' && !config.herokuPrivateSpaceOperationsEnabled) throw denied('Heroku Private Space administration is disabled.');

  requireApproval(input, classification);

  if (config.herokuResourceAccess !== 'all') {
    if (input.app && !matches(input.app, config.herokuAppAllowlist)) throw denied('The Heroku app is not allowlisted.');
    if (input.team && !matches(input.team, config.herokuTeamAllowlist)) throw denied('The Heroku team is not allowlisted.');
    if (input.pipeline && !matches(input.pipeline, config.herokuPipelineAllowlist)) throw denied('The Heroku pipeline is not allowlisted.');
    if (input.space && !matches(input.space, config.herokuSpaceAllowlist)) throw denied('The Heroku Private Space is not allowlisted.');
  }

  const body = input.body || {};
  if (body.size && config.herokuDynoSizeAllowlist.length && !matches(body.size, config.herokuDynoSizeAllowlist)) {
    throw denied('The requested dyno size is not allowlisted.');
  }
  if (body.quantity !== undefined && Number(body.quantity) > config.herokuMaxDynoQuantity) {
    throw denied('The requested dyno quantity exceeds the configured maximum.');
  }
  if (body.plan && config.herokuAddonPlanAllowlist.length && !matches(body.plan, config.herokuAddonPlanAllowlist)) {
    throw denied('The requested add-on plan is not allowlisted.');
  }

  const hostname = body.hostname || body.hostname_pattern;
  if (hostname && config.herokuDomainSuffixAllowlist.length) {
    const allowed = config.herokuDomainSuffixAllowlist.some((suffix) => String(hostname).toLowerCase().endsWith(String(suffix).toLowerCase()));
    if (!allowed) throw denied('The requested domain is not allowlisted.');
  }

  const isSelf = input.app && String(input.app).toLowerCase() === String(config.herokuSelfApp).toLowerCase();
  if (isSelf) {
    if (descriptor.operationId === 'deleteHerokuApp' || descriptor.operationId === 'transferHerokuApp') {
      throw denied('The Context API Heroku app cannot delete or transfer itself.');
    }
    if ((descriptor.operationId === 'updateHerokuFormation' || descriptor.operationId === 'batchUpdateHerokuFormation') && Number(body.quantity) === 0) {
      throw denied('The Context API web formation cannot be scaled to zero.');
    }
    if (descriptor.operationId === 'restartAllHerokuDynos' && body.stopAll === true) {
      throw denied('The Context API cannot stop all of its own dynos.');
    }
    if (descriptor.operationId === 'deleteHerokuConfigVar' && REQUIRED_SELF_KEYS.has(input.key)) {
      throw denied('A required Context API configuration value cannot be removed.');
    }
    if (descriptor.operationId === 'updateHerokuConfigVars') {
      for (const key of REQUIRED_SELF_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body, key) && (body[key] === null || body[key] === '')) {
          throw denied('A required Context API configuration value cannot be cleared.');
        }
      }
    }
  }

  return config;
}

function redactConfigVars(values = {}) {
  return Object.entries(values).map(([key, value]) => {
    const safe = SAFE_CONFIG_KEYS.has(key) && !SENSITIVE_KEYS.test(key);
    return {
      key,
      configured: value !== undefined && value !== null,
      sensitive: !safe,
      value: safe ? String(value) : '[REDACTED]',
    };
  });
}

function filterCollection(operationId, data, config) {
  if (!Array.isArray(data) || config.herokuResourceAccess === 'all') return data;
  const definitions = {
    listHerokuApps: ['name', config.herokuAppAllowlist],
    listHerokuTeams: ['name', config.herokuTeamAllowlist],
    listHerokuPipelines: ['name', config.herokuPipelineAllowlist],
    listHerokuSpaces: ['name', config.herokuSpaceAllowlist],
  };
  const definition = definitions[operationId];
  if (!definition) return data;
  const [field, allowlist] = definition;
  return data.filter((item) => matches(item && (item[field] || item.id), allowlist));
}

module.exports = {
  enforce,
  redactConfigVars,
  filterCollection,
  matches,
  SENSITIVE_KEYS,
  SAFE_CONFIG_KEYS,
  REQUIRED_SELF_KEYS,
};
