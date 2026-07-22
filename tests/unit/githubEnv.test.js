'use strict';

const { loadEnv } = require('../../src/config/env');
const { TEST_PEM, TEST_PRIVATE_KEY_BASE64, TEST_API_KEY } = require('../helpers/githubFixtures');

const BASE = {
  NODE_ENV: 'production',
  PORT: '4000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/context_api',
};

const GITHUB = {
  GITHUB_APP_ID: '123456',
  GITHUB_INSTALLATION_ID: '654321',
  GITHUB_PRIVATE_KEY_BASE64: TEST_PRIVATE_KEY_BASE64,
  GITHUB_REPOSITORY_ACCESS: 'all',
  ZORO_GITHUB_API_KEY: TEST_API_KEY,
};

const PRODUCTION = { ...BASE, ...GITHUB };

describe('GitHub environment configuration', () => {
  it('accepts a complete production configuration', () => {
    const env = loadEnv(PRODUCTION);

    expect(env.githubAppId).toBe(123456);
    expect(env.githubInstallationId).toBe(654321);
    expect(env.githubRepositoryAccess).toBe('all');
    expect(env.zoroGithubApiKey).toBe(TEST_API_KEY);
  });

  it('decodes the private key into PEM form', () => {
    const env = loadEnv(PRODUCTION);

    expect(env.githubPrivateKey).toBe(TEST_PEM);
    expect(env.githubPrivateKey).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/);
  });

  it('returns a frozen configuration object', () => {
    expect(Object.isFrozen(loadEnv(PRODUCTION))).toBe(true);
  });

  it.each(Object.keys(GITHUB))('fails in production when %s is missing', (key) => {
    const source = { ...PRODUCTION };
    delete source[key];

    expect(() => loadEnv(source)).toThrow(new RegExp(`${key} is required`));
  });

  it('does not require GitHub configuration outside production', () => {
    const env = loadEnv({ ...BASE, NODE_ENV: 'development' });

    expect(env.githubAppId).toBeNull();
    expect(env.zoroGithubApiKey).toBeNull();
  });

  it('still validates a partially supplied configuration outside production', () => {
    // A typo in a local .env should surface locally, not on the first deploy.
    expect(() =>
      loadEnv({ ...BASE, NODE_ENV: 'development', GITHUB_APP_ID: 'not-a-number' })
    ).toThrow(/GITHUB_APP_ID must be a positive integer/);
  });

  it.each(['0', '-5', 'abc', '1.5', '12a'])('rejects the app id %p', (value) => {
    expect(() => loadEnv({ ...PRODUCTION, GITHUB_APP_ID: value })).toThrow(
      /GITHUB_APP_ID must be a positive integer/
    );
  });

  it.each(['0', 'abc', '-1'])('rejects the installation id %p', (value) => {
    expect(() => loadEnv({ ...PRODUCTION, GITHUB_INSTALLATION_ID: value })).toThrow(
      /GITHUB_INSTALLATION_ID must be a positive integer/
    );
  });

  it('rejects a private key that is not Base64', () => {
    expect(() => loadEnv({ ...PRODUCTION, GITHUB_PRIVATE_KEY_BASE64: 'not base64!!' })).toThrow(
      /GITHUB_PRIVATE_KEY_BASE64 must be Base64 encoded/
    );
  });

  it('rejects a Base64 value that does not decode to a PEM key', () => {
    const encoded = Buffer.from('just some text', 'utf8').toString('base64');

    expect(() => loadEnv({ ...PRODUCTION, GITHUB_PRIVATE_KEY_BASE64: encoded })).toThrow(
      /GITHUB_PRIVATE_KEY_BASE64 must decode to a PEM private key/
    );
  });

  it('rejects a PEM whose footer does not match its header', () => {
    const mismatched = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
      '-----END EC PRIVATE KEY-----',
    ].join('\n');

    const encoded = Buffer.from(mismatched, 'utf8').toString('base64');

    expect(() => loadEnv({ ...PRODUCTION, GITHUB_PRIVATE_KEY_BASE64: encoded })).toThrow(
      /matching footer/
    );
  });

  it('rejects an unsupported repository access mode', () => {
    expect(() => loadEnv({ ...PRODUCTION, GITHUB_REPOSITORY_ACCESS: 'selected' })).toThrow(
      /GITHUB_REPOSITORY_ACCESS must be one of/
    );
  });

  it('rejects a bearer key below the minimum length', () => {
    expect(() => loadEnv({ ...PRODUCTION, ZORO_GITHUB_API_KEY: 'short' })).toThrow(
      /ZORO_GITHUB_API_KEY must be at least 32 characters/
    );
  });

  it('reports every problem at once', () => {
    let message = '';

    try {
      loadEnv({ ...PRODUCTION, GITHUB_APP_ID: 'x', ZORO_GITHUB_API_KEY: 'short' });
    } catch (error) {
      message = error.message;
    }

    expect(message).toMatch(/GITHUB_APP_ID/);
    expect(message).toMatch(/ZORO_GITHUB_API_KEY/);
  });

  it('never includes secret values in validation errors', () => {
    const secret = 'super-secret-bearer-value-that-is-long-enough';
    let message = '';

    try {
      loadEnv({
        ...PRODUCTION,
        GITHUB_REPOSITORY_ACCESS: 'selected',
        ZORO_GITHUB_API_KEY: secret,
        GITHUB_PRIVATE_KEY_BASE64: 'not base64!!',
      });
    } catch (error) {
      message = error.message;
    }

    expect(message).not.toContain(secret);
    expect(message).not.toContain(TEST_PRIVATE_KEY_BASE64);
    expect(message).not.toContain('PRIVATE KEY');
    expect(message).not.toContain('selected');
  });
});
