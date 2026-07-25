'use strict';

const { getHerokuConfig } = require('../../src/config/heroku');
const { secretsMatch } = require('../../src/middleware/requireHerokuActionAuth');
const policy = require('../../src/services/heroku/herokuPolicy');
const routes = require('../../src/services/heroku/herokuRoutes');
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
  HEROKU_DOMAIN_SUFFIX_ALLOWLIST: '.example.com',
  HEROKU_DYNO_SIZE_ALLOWLIST: 'basic,standard-1x',
  HEROKU_ADDON_PLAN_ALLOWLIST: 'heroku-redis:mini',
  HEROKU_MUTATIONS_ENABLED: 'true',
  HEROKU_DESTRUCTIVE_OPERATIONS_ENABLED: 'true',
  HEROKU_BILLING_OPERATIONS_ENABLED: 'true',
  HEROKU_ACCESS_ADMIN_OPERATIONS_ENABLED: 'true',
  HEROKU_PRIVATE_SPACE_OPERATIONS_ENABLED: 'true',
  // Pinned explicitly: Full Operator mode defaults to enabled, and these cases
  // assert the restricted-mode approval requirement. The Full Operator
  // behaviour is covered separately in tests/unit/zoroFullOperator.test.js.
  ZORO_FULL_OPERATOR_MODE: 'false',
};

const approval = {
  approvedBy: 'Kofi',
  authority: 'explicit-user-instruction',
  reason: 'test',
};

function descriptor(operationId) {
  return routes.find((route) => route.operationId === operationId);
}

describe('Heroku gateway', () => {
  test('loads validated configuration without exposing values in errors', () => {
    const config = getHerokuConfig({}, source);
    expect(config.herokuSelfApp).toBe('context-api');
    expect(config.herokuAppAllowlist).toEqual(['context-api', 'disposable-app']);
    expect(() => getHerokuConfig({}, { HEROKU_API_TOKEN: 'super-secret' })).toThrow(
      'ZORO_HEROKU_API_KEY is required'
    );
    expect(() => getHerokuConfig({}, { HEROKU_API_TOKEN: 'super-secret' })).not.toThrow(
      'super-secret'
    );
  });

  test('compares bearer credentials safely', () => {
    expect(secretsMatch('same', 'same')).toBe(true);
    expect(secretsMatch('left', 'right')).toBe(false);
  });

  test('defines a full, unique endpoint catalogue', () => {
    expect(routes.length).toBeGreaterThanOrEqual(110);
    expect(new Set(routes.map((route) => route.operationId)).size).toBe(routes.length);
  });

  test('blocks self deletion, scale-to-zero, and required config removal', () => {
    expect(() =>
      policy.enforce({
        input: { app: 'context-api', approval },
        descriptor: descriptor('deleteHerokuApp'),
        source,
      })
    ).toThrow('cannot delete');
    expect(() =>
      policy.enforce({
        input: { app: 'context-api', type: 'web', body: { quantity: 0 }, approval },
        descriptor: descriptor('updateHerokuFormation'),
        source,
      })
    ).toThrow('scaled to zero');
    expect(() =>
      policy.enforce({
        input: { app: 'context-api', key: 'HEROKU_API_TOKEN', approval },
        descriptor: descriptor('deleteHerokuConfigVar'),
        source,
      })
    ).toThrow('cannot be removed');
    expect(() =>
      policy.enforce({
        input: { app: 'context-api', body: { MONGODB_URI: null }, approval },
        descriptor: descriptor('updateHerokuConfigVars'),
        source,
      })
    ).toThrow('cannot be cleared');
  });

  test('blocks non-allowlisted resources and unapproved sensitive operations', () => {
    expect(() =>
      policy.enforce({ input: { app: 'unknown' }, descriptor: descriptor('getHerokuApp'), source })
    ).toThrow('not allowlisted');
    expect(() =>
      policy.enforce({
        input: { app: 'disposable-app', body: { quantity: 2 } },
        descriptor: descriptor('updateHerokuFormation'),
        source,
      })
    ).toThrow('approval evidence');
    expect(() =>
      policy.enforce({
        input: { app: 'disposable-app', body: { hostname: 'bad.invalid' }, approval },
        descriptor: descriptor('createHerokuDomain'),
        source,
      })
    ).toThrow('domain is not allowlisted');
  });

  test('redacts config values and filters collection reads', () => {
    expect(
      policy.redactConfigVars({
        NODE_ENV: 'production',
        PUBLIC_URL: 'https://example.com',
        MONGODB_URI: 'mongodb://secret',
      })
    ).toEqual([
      { key: 'NODE_ENV', configured: true, sensitive: false, value: 'production' },
      { key: 'PUBLIC_URL', configured: true, sensitive: true, value: '[REDACTED]' },
      { key: 'MONGODB_URI', configured: true, sensitive: true, value: '[REDACTED]' },
    ]);
    const config = getHerokuConfig({}, source);
    expect(
      policy.filterCollection(
        'listHerokuApps',
        [{ name: 'context-api' }, { name: 'private-app' }],
        config
      )
    ).toEqual([{ name: 'context-api' }]);
  });

  test('removes gateway control fields and normalizes special request bodies', () => {
    expect(service.sanitizeBody({ name: 'app', expectedEtag: 'etag', approval })).toEqual({
      name: 'app',
    });
    expect(service.pathFor('/apps/{app}/dynos/{dyno}', { app: 'my app', dyno: 'web.1' })).toBe(
      '/apps/my%20app/dynos/web.1'
    );
    expect(
      service.requestBody(descriptor('deleteHerokuConfigVar'), {
        params: { key: 'OLD_KEY' },
        body: {},
      })
    ).toEqual({ OLD_KEY: null });
    expect(
      service.requestBody(descriptor('rollbackHerokuRelease'), {
        params: { release: 'v42' },
        body: {},
      })
    ).toEqual({ release: 'v42' });
  });
});
