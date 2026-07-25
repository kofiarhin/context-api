'use strict';

const { loadEnv } = require('../../src/config/env');
const { getZoroEngineeringConfig } = require('../../src/config/zoroEngineering');
const policy = require('../../src/services/zoro/zoroPolicy');
const {
  getDispatcher,
  getOperation,
  CLASSIFICATIONS,
} = require('../../src/services/zoro/zoroCatalogue');

const RESTRICTED = { ZORO_FULL_OPERATOR_MODE: 'false' };
const FULL_OPERATOR = {};

const APPROVAL = {
  approvedBy: 'Kofi',
  authority: 'explicit-user-instruction',
  reason: 'documented release authority',
};

function operation(dispatcherId, name) {
  return getOperation(getDispatcher(dispatcherId), name);
}

function enforce(op, extra = {}) {
  return policy.enforce({ operation: op, parameters: {}, ...extra });
}

describe('Full Operator configuration', () => {
  it('defaults to enabled when the variable is omitted', () => {
    expect(getZoroEngineeringConfig({}).fullOperatorMode).toBe(true);
  });

  it('treats a blank value as omitted', () => {
    expect(getZoroEngineeringConfig({ ZORO_FULL_OPERATOR_MODE: '' }).fullOperatorMode).toBe(true);
  });

  it('restores restricted mode when set explicitly to false', () => {
    expect(getZoroEngineeringConfig(RESTRICTED).fullOperatorMode).toBe(false);
  });

  it('accepts an explicit true', () => {
    expect(getZoroEngineeringConfig({ ZORO_FULL_OPERATOR_MODE: 'true' }).fullOperatorMode).toBe(
      true
    );
  });

  it.each(['no', 'yes', '0', '1', 'FALSE', 'disabled'])(
    'fails startup rather than guessing for %p',
    (value) => {
      expect(() => getZoroEngineeringConfig({ ZORO_FULL_OPERATOR_MODE: value })).toThrow(
        'ZORO_FULL_OPERATOR_MODE must be true or false'
      );
    }
  );
});

describe('GitHub repository creation configuration', () => {
  const BASE = { NODE_ENV: 'test', PORT: '3000', MONGODB_URI: 'mongodb://localhost:27017/test' };

  it('does not require the user token while creation is disabled', () => {
    expect(() => loadEnv({ ...BASE })).not.toThrow();
    expect(() => loadEnv({ ...BASE, GITHUB_REPOSITORY_CREATION_ENABLED: 'false' })).not.toThrow();

    const env = loadEnv({ ...BASE });
    expect(env.githubRepositoryCreationEnabled).toBe(false);
    expect(env.githubUserAccessToken).toBeNull();
  });

  it('requires the token and the owner once creation is enabled', () => {
    expect(() => loadEnv({ ...BASE, GITHUB_REPOSITORY_CREATION_ENABLED: 'true' })).toThrow(
      /GITHUB_USER_ACCESS_TOKEN is required/
    );
    expect(() => loadEnv({ ...BASE, GITHUB_REPOSITORY_CREATION_ENABLED: 'true' })).toThrow(
      /GITHUB_ALLOWED_OWNER is required/
    );
  });

  it('accepts a complete creation configuration and normalises the owner', () => {
    const env = loadEnv({
      ...BASE,
      GITHUB_REPOSITORY_CREATION_ENABLED: 'true',
      GITHUB_ALLOWED_OWNER: '  KofiArhin ',
      GITHUB_USER_ACCESS_TOKEN: 'user-token-value',
    });

    expect(env.githubRepositoryCreationEnabled).toBe(true);
    expect(env.githubAllowedOwner).toBe('kofiarhin');
  });

  it('rejects a non-boolean creation switch', () => {
    expect(() => loadEnv({ ...BASE, GITHUB_REPOSITORY_CREATION_ENABLED: 'sometimes' })).toThrow(
      /GITHUB_REPOSITORY_CREATION_ENABLED must be true or false/
    );
  });

  it('never defaults the owner, so a dropped variable cannot widen access', () => {
    const env = loadEnv({ ...BASE });
    expect(env.githubAllowedOwner).toBeNull();
  });

  it('does not make the user token required by supplying other GitHub variables', () => {
    // GITHUB_VARIABLES is all-or-nothing; repository creation is a separate,
    // opt-in group and must not be dragged into that requirement.
    expect(() =>
      loadEnv({
        ...BASE,
        GITHUB_APP_ID: '1',
        GITHUB_INSTALLATION_ID: '2',
        GITHUB_PRIVATE_KEY_BASE64: Buffer.from(
          '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJB\n-----END RSA PRIVATE KEY-----\n'
        ).toString('base64'),
        GITHUB_REPOSITORY_ACCESS: 'all',
        ZORO_GITHUB_API_KEY: 'k'.repeat(32),
      })
    ).not.toThrow();
  });
});

describe('Full Operator approval policy', () => {
  const cases = [
    ['merge', operation('github.review', 'mergePullRequest'), { expectedHeadSha: 'abc123' }],
    ['security-sensitive', operation('github.write', 'createRepository'), {}],
    ['production-sensitive', operation('vercel.write', 'rollbackProject'), {}],
  ];

  it.each(cases)('proceeds without approval for %s work', (_label, op, parameters) => {
    expect(() =>
      policy.enforce({ operation: op, parameters, source: FULL_OPERATOR })
    ).not.toThrow();
  });

  it.each(cases)('still demands approval for %s work in restricted mode', (_l, op, parameters) => {
    expect(() => policy.enforce({ operation: op, parameters, source: RESTRICTED })).toThrow(
      /approval/i
    );
  });

  it('covers every classification the mode is documented to stand down', () => {
    for (const classification of policy.FULL_OPERATOR_AUTO_ALLOWED) {
      expect(() => enforce({ classification }, { source: FULL_OPERATOR })).not.toThrow();
    }

    expect(policy.FULL_OPERATOR_AUTO_ALLOWED.has(CLASSIFICATIONS.DESTRUCTIVE)).toBe(false);
  });

  it('proceeds without approval for billing and access-admin work', () => {
    for (const classification of [CLASSIFICATIONS.BILLING, CLASSIFICATIONS.ACCESS_ADMIN]) {
      expect(() => enforce({ classification }, { source: FULL_OPERATOR })).not.toThrow();
      expect(() => enforce({ classification }, { source: RESTRICTED })).toThrow(/approval/i);
    }
  });

  it('still validates the shape of a supplied approval block in either mode', () => {
    for (const source of [FULL_OPERATOR, RESTRICTED]) {
      expect(() =>
        enforce(
          { classification: CLASSIFICATIONS.WRITE },
          { approval: { approvedby: 'Kofi' }, source }
        )
      ).toThrow(/Unknown approval field/);

      expect(() =>
        enforce({ classification: CLASSIFICATIONS.WRITE }, { approval: 'Kofi', source })
      ).toThrow(/approval must be an object/);
    }
  });
});

describe('Guards Full Operator mode does not touch', () => {
  const deleteFile = operation('github.destructive', 'deleteFile');

  it('still requires an expected SHA for a state-sensitive operation', () => {
    expect(() =>
      policy.enforce({
        operation: operation('github.write', 'updateFile'),
        parameters: { owner: 'kofiarhin', repo: 'context-api', path: 'a.txt' },
        source: FULL_OPERATOR,
      })
    ).toThrow(/sha is required/i);
  });

  it('still requires an expected head SHA before a merge', () => {
    expect(() =>
      policy.enforce({
        operation: operation('github.review', 'mergePullRequest'),
        parameters: {},
        source: FULL_OPERATOR,
      })
    ).toThrow(/expectedHeadSha is required/i);
  });

  it('still requires Kofi approval for destructive work', () => {
    expect(() =>
      policy.enforce({
        operation: deleteFile,
        parameters: { owner: 'kofiarhin', repo: 'context-api', path: 'a.txt', sha: 'abc' },
        source: FULL_OPERATOR,
      })
    ).toThrow(/approval/i);
  });

  it('still requires an exact, resource-naming destructive confirmation', () => {
    const parameters = { owner: 'kofiarhin', repo: 'context-api', path: 'a.txt', sha: 'abc' };

    expect(() =>
      policy.enforce({
        operation: deleteFile,
        parameters,
        approval: APPROVAL,
        confirmation: { confirmed: true },
        source: FULL_OPERATOR,
      })
    ).toThrow(/confirmation is required/i);

    expect(() =>
      policy.enforce({
        operation: deleteFile,
        parameters,
        approval: APPROVAL,
        confirmation: {
          confirmed: true,
          resourceType: 'file',
          resourceId: 'kofiarhin/context-api:WRONG.txt',
          reason: 'removing a stale fixture',
        },
        source: FULL_OPERATOR,
      })
    ).toThrow(/does not match/i);

    expect(() =>
      policy.enforce({
        operation: deleteFile,
        parameters,
        approval: APPROVAL,
        confirmation: {
          confirmed: true,
          resourceType: 'file',
          resourceId: 'kofiarhin/context-api:a.txt',
          reason: 'removing a stale fixture',
        },
        source: FULL_OPERATOR,
      })
    ).not.toThrow();
  });
});
