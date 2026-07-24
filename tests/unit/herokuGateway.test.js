'use strict';

const { getHerokuConfig } = require('../../src/config/heroku');
const { secretsMatch } = require('../../src/middleware/requireHerokuActionAuth');
const policy = require('../../src/services/heroku/herokuPolicy');
const catalogue = require('../../src/services/heroku/herokuCatalogue');
const service = require('../../src/services/heroku/heroku.service');

const source = {
  HEROKU_API_TOKEN: 'heroku-token-value',
  ZORO_HEROKU_API_KEY: 'a'.repeat(32),
  HEROKU_SELF_APP: 'context-api',
  HEROKU_RESOURCE_ACCESS: 'allowlist',
  HEROKU_APP_ALLOWLIST: 'context-api, disposable-app',
  HEROKU_TEAM_ALLOWLIST: 'kofi-team',
  HEROKU_PIPELINE_ALLOWLIST: 'main-pipeline',
  HEROKU_SPACE_ALLOWLIST: 'private-space',
  HEROKU_DYNO_SIZE_ALLOWLIST: 'basic,standard-1x',
  HEROKU_ADDON_PLAN_ALLOWLIST: 'heroku-redis:mini',
  HEROKU_MUTATIONS_ENABLED: 'true',
  HEROKU_DESTRUCTIVE_OPERATIONS_ENABLED: 'true',
  HEROKU_BILLING_OPERATIONS_ENABLED: 'true',
  HEROKU_ACCESS_ADMIN_OPERATIONS_ENABLED: 'true',
  HEROKU_PRIVATE_SPACE_OPERATIONS_ENABLED: 'true',
};

const approval = {
  approvedBy: 'Kofi',
  authority: 'explicit-user-instruction',
  reason: 'test',
};

function descriptor(operationId) {
  return catalogue.find((route) => route.operationId === operationId);
}

describe('Heroku gateway', () => {
  test('loads validated configuration without exposing values in errors', () => {
    const config = getHerokuConfig({}, source);
    expect(config.herokuSelfApp).toBe('context-api');
    expect(config.herokuAppAllowlist).toEqual(['context-api', 'disposable-app']);
    expect(() => getHerokuConfig({}, { HEROKU_API_TOKEN: 'super-secret' })).toThrow('ZORO_HEROKU_API_KEY is required');
    expect(() => getHerokuConfig({}, { HEROKU_API_TOKEN: 'super-secret' })).not.toThrow('super-secret');
  });

  test('compares bearer credentials safely', () => {
    expect(secretsMatch('same', 'same')).toBe(true);
    expect(secretsMatch('left', 'right')).toBe(false);
  });

  test('defines a full, unique endpoint catalogue', () => {
    expect(catalogue.length).toBeGreaterThanOrEqual(100);
    expect(new Set(catalogue.map((route) => route.operationId)).size).toBe(catalogue.length);
  });

  test('blocks self deletion, scale-to-zero, and required config removal', () => {
    expect(() => policy.enforce({ input: { app: 'context-api', approval }, descriptor: descriptor('deleteHerokuApp'), source })).toThrow('cannot delete');
    expect(() => policy.enforce({ input: { app: 'context-api', type: 'web', body: { quantity: 0 }, approval }, descriptor: descriptor('updateHerokuFormation'), source })).toThrow('scaled to zero');
    expect(() => policy.enforce({ input: { app: 'context-api', key: 'HEROKU_API_TOKEN', approval }, descriptor: descriptor('deleteHerokuConfigVar'), source })).toThrow('cannot be removed');
  });

  test('blocks non-allowlisted resources and unapproved sensitive operations', () => {
    expect(() => policy.enforce({ input: { app: 'unknown' }, descriptor: descriptor('getHerokuApp'), source })).toThrow('not allowlisted');
    expect(() => policy.enforce({ input: { app: 'disposable-app', body: { quantity: 2 } }, descriptor: descriptor('updateHerokuFormation'), source })).toThrow('approval evidence');
  });

  test('redacts sensitive configuration values', () => {
    expect(policy.redactConfigVars({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://secret' })).toEqual([
      { key: 'NODE_ENV', configured: true, sensitive: false, value: 'production' },
      { key: 'MONGODB_URI', configured: true, sensitive: true, value: '[REDACTED]' },
    ]);
  });

  test('removes gateway control fields from upstream payloads', () => {
    expect(service.sanitizeBody({ name: 'app', expectedEtag: 'etag', approval })).toEqual({ name: 'app' });
    expect(service.pathFor('/apps/{app}/dynos/{dyno}', { app: 'my app', dyno: 'web.1' })).toBe('/apps/my%20app/dynos/web.1');
  });
});
