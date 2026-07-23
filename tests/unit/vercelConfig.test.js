'use strict';

const { getVercelConfig, split, parseBoolean } = require('../../src/config/vercel');

describe('Vercel gateway configuration', () => {
  it('normalizes allowlists and booleans', () => {
    const config = getVercelConfig(
      {},
      {
        VERCEL_TOKEN: 'token',
        VERCEL_TEAM_ID: 'team_123',
        ZORO_VERCEL_API_KEY: 'a'.repeat(32),
        VERCEL_PROJECT_ALLOWLIST: ' Alpha,alpha,prj_1 ',
        VERCEL_DOMAIN_ALLOWLIST: 'Example.com',
        VERCEL_REPOSITORY_ALLOWLIST: 'kofiarhin/context-api',
        VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS: 'true',
      }
    );

    expect(config.vercelProjectAllowlist).toEqual(['Alpha', 'alpha', 'prj_1']);
    expect(config.vercelAllowDestructiveOperations).toBe(true);
  });

  it('fails closed for partial configuration without echoing values', () => {
    expect(() =>
      getVercelConfig({}, { VERCEL_TOKEN: 'secret-token-value' })
    ).toThrow('ZORO_VERCEL_API_KEY is required.');

    try {
      getVercelConfig({}, { VERCEL_TOKEN: 'secret-token-value' });
    } catch (error) {
      expect(error.message).not.toContain('secret-token-value');
    }
  });

  it('rejects short action keys', () => {
    expect(() =>
      getVercelConfig({}, { VERCEL_TOKEN: 'token', ZORO_VERCEL_API_KEY: 'short' })
    ).toThrow('ZORO_VERCEL_API_KEY must be at least 32 characters.');
  });

  it('supports unconfigured local operation', () => {
    expect(getVercelConfig({}, {})).toMatchObject({ vercelToken: null, zoroVercelApiKey: null });
  });

  it('exposes deterministic parsing helpers', () => {
    expect(split('a, b,a')).toEqual(['a', 'b']);
    expect(parseBoolean('TRUE')).toBe(true);
    expect(parseBoolean('false')).toBe(false);
  });
});
