'use strict';

const herokuPolicy = require('../../src/services/heroku/herokuPolicy');
const herokuRoutes = require('../../src/services/heroku/herokuRoutes');
const { createPolicy } = require('../../src/services/vercelPolicy');
const { VercelForbiddenError } = require('../../src/utils/errors');

const HEROKU_BASE = {
  HEROKU_API_TOKEN: 'heroku-token-value',
  ZORO_HEROKU_API_KEY: 'h'.repeat(32),
  HEROKU_SELF_APP: 'context-api',
  HEROKU_RESOURCE_ACCESS: 'all',
  HEROKU_MUTATIONS_ENABLED: 'true',
  HEROKU_BILLING_OPERATIONS_ENABLED: 'true',
  HEROKU_ACCESS_ADMIN_OPERATIONS_ENABLED: 'true',
  HEROKU_PRIVATE_SPACE_OPERATIONS_ENABLED: 'true',
  HEROKU_DESTRUCTIVE_OPERATIONS_ENABLED: 'false',
};

const VERCEL_BASE = {
  VERCEL_TOKEN: 'vercel-token-value',
  ZORO_VERCEL_API_KEY: 'v'.repeat(32),
};

const APPROVAL = {
  approvedBy: 'Kofi',
  authority: 'explicit-user-instruction',
  reason: 'documented release authority',
};

function descriptor(operationId) {
  return herokuRoutes.find((route) => route.operationId === operationId);
}

function enforceHeroku(operationId, { input = {}, source }) {
  return herokuPolicy.enforce({ input, descriptor: descriptor(operationId), source });
}

describe('Heroku under Full Operator mode', () => {
  it('classifies createHerokuApp as billing-sensitive', () => {
    expect(descriptor('createHerokuApp').classification).toBe('billing-sensitive');
  });

  it('creates an app without per-request approval when the switches allow it', () => {
    expect(() =>
      enforceHeroku('createHerokuApp', {
        input: { body: { name: 'zoro-smoke-app', region: 'us' } },
        source: HEROKU_BASE,
      })
    ).not.toThrow();
  });

  it('still requires approval in restricted mode', () => {
    expect(() =>
      enforceHeroku('createHerokuApp', {
        input: { body: { name: 'zoro-smoke-app' } },
        source: { ...HEROKU_BASE, ZORO_FULL_OPERATOR_MODE: 'false' },
      })
    ).toThrow(/approval evidence/i);

    expect(() =>
      enforceHeroku('createHerokuApp', {
        input: { body: { name: 'zoro-smoke-app' }, approval: APPROVAL },
        source: { ...HEROKU_BASE, ZORO_FULL_OPERATOR_MODE: 'false' },
      })
    ).not.toThrow();
  });

  it('is still blocked when billing operations are disabled, in either mode', () => {
    for (const extra of [{}, { ZORO_FULL_OPERATOR_MODE: 'false' }]) {
      expect(() =>
        enforceHeroku('createHerokuApp', {
          input: { body: { name: 'zoro-smoke-app' }, approval: APPROVAL },
          source: { ...HEROKU_BASE, ...extra, HEROKU_BILLING_OPERATIONS_ENABLED: 'false' },
        })
      ).toThrow(/Billing-sensitive Heroku operations are disabled/);
    }
  });

  it('keeps the destructive switch closed in Full Operator mode', () => {
    expect(() =>
      enforceHeroku('deleteHerokuApp', {
        input: { app: 'disposable-app', approval: APPROVAL },
        source: HEROKU_BASE,
      })
    ).toThrow(/Destructive Heroku operations are disabled/);
  });

  describe('Context API self-protection is untouched', () => {
    const source = { ...HEROKU_BASE, HEROKU_DESTRUCTIVE_OPERATIONS_ENABLED: 'true' };

    it('cannot delete or transfer itself', () => {
      expect(() =>
        enforceHeroku('deleteHerokuApp', { input: { app: 'context-api' }, source })
      ).toThrow(/cannot delete or transfer itself/);
      expect(() =>
        enforceHeroku('transferHerokuApp', { input: { app: 'context-api' }, source })
      ).toThrow(/cannot delete or transfer itself/);
    });

    it('cannot scale its web formation to zero', () => {
      expect(() =>
        enforceHeroku('updateHerokuFormation', {
          input: { app: 'context-api', type: 'web', body: { quantity: 0 } },
          source,
        })
      ).toThrow(/cannot be scaled to zero/);
    });

    it('cannot stop all of its own dynos', () => {
      expect(() =>
        enforceHeroku('restartAllHerokuDynos', {
          input: { app: 'context-api', body: { stopAll: true } },
          source,
        })
      ).toThrow(/cannot stop all of its own dynos/);
    });

    it('cannot remove or clear a required configuration key', () => {
      expect(() =>
        enforceHeroku('deleteHerokuConfigVar', {
          input: { app: 'context-api', key: 'ZORO_ENGINEERING_API_KEY' },
          source,
        })
      ).toThrow(/cannot be removed/);

      expect(() =>
        enforceHeroku('updateHerokuConfigVars', {
          input: { app: 'context-api', body: { MONGODB_URI: '' } },
          source,
        })
      ).toThrow(/cannot be cleared/);
    });
  });

  it('still redacts config values in Full Operator mode', () => {
    const redacted = herokuPolicy.redactConfigVars({
      MONGODB_URI: 'mongodb+srv://user:pass@cluster/db',
      ZORO_ENGINEERING_API_KEY: 'super-secret-key',
      NODE_ENV: 'production',
    });

    const byKey = Object.fromEntries(redacted.map((entry) => [entry.key, entry]));

    expect(byKey.MONGODB_URI.value).toBe('[REDACTED]');
    expect(byKey.ZORO_ENGINEERING_API_KEY.value).toBe('[REDACTED]');
    expect(byKey.NODE_ENV.value).toBe('production');
    expect(JSON.stringify(redacted)).not.toContain('super-secret-key');
    expect(JSON.stringify(redacted)).not.toContain('pass@cluster');
  });
});

describe('Vercel under Full Operator mode', () => {
  it('stands down the per-request Production approval', () => {
    const policy = createPolicy({}, { source: VERCEL_BASE });

    expect(() => policy.requireProductionApproval(undefined, 'deployment for site')).not.toThrow();
  });

  it('still requires Production approval in restricted mode', () => {
    const policy = createPolicy(
      {},
      { source: { ...VERCEL_BASE, ZORO_FULL_OPERATOR_MODE: 'false' } }
    );

    expect(() => policy.requireProductionApproval(undefined, 'deployment for site')).toThrow(
      VercelForbiddenError
    );

    expect(() =>
      policy.requireProductionApproval(
        { confirmed: true, scope: 'production', reason: 'documented release authority' },
        'deployment for site'
      )
    ).not.toThrow();
  });

  it('keeps the destructive switch and its exact confirmation closed', () => {
    const policy = createPolicy({}, { source: VERCEL_BASE });

    expect(() =>
      policy.requireDestructiveConfirmation(
        { confirmed: true, expectedName: 'site', reason: 'removing a superseded project' },
        { expectedName: 'site' }
      )
    ).toThrow(/Destructive Vercel operations are disabled/);
  });

  it('still refuses a mismatched destructive confirmation once enabled', () => {
    const policy = createPolicy(
      {},
      { source: { ...VERCEL_BASE, VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS: 'true' } }
    );

    expect(() =>
      policy.requireDestructiveConfirmation(
        { confirmed: true, expectedName: 'WRONG', reason: 'removing a superseded project' },
        { expectedName: 'site' }
      )
    ).toThrow(/does not match/i);

    expect(() =>
      policy.requireDestructiveConfirmation(
        { confirmed: true, expectedName: 'site', reason: 'removing a superseded project' },
        { expectedName: 'site' }
      )
    ).not.toThrow();
  });

  it('keeps project and domain allowlists enforced in Full Operator mode', () => {
    const policy = createPolicy(
      {},
      {
        source: {
          ...VERCEL_BASE,
          VERCEL_PROJECT_ALLOWLIST: 'site',
          VERCEL_DOMAIN_ALLOWLIST: 'example.com',
        },
      }
    );

    expect(() => policy.assertProjectAllowed('other-project')).toThrow(VercelForbiddenError);
    expect(() => policy.assertProjectAllowed('site')).not.toThrow();
    expect(() => policy.assertDomainAllowed('evil.test')).toThrow(VercelForbiddenError);
  });
});
