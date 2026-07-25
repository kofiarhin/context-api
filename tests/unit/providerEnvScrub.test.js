'use strict';

const fs = require('fs');
const path = require('path');

const {
  PROVIDER_ENV_VARS,
  GITHUB_ENV_VARS,
  VERCEL_ENV_VARS,
  HEROKU_ENV_VARS,
  scrubProviderEnv,
} = require('../helpers/providerEnvVars');

describe('provider env var allowlist', () => {
  it('is a non-empty, duplicate-free, frozen list', () => {
    expect(PROVIDER_ENV_VARS.length).toBeGreaterThan(0);
    expect(new Set(PROVIDER_ENV_VARS).size).toBe(PROVIDER_ENV_VARS.length);
    expect(Object.isFrozen(PROVIDER_ENV_VARS)).toBe(true);
  });

  it('covers each provider category the gateways expose', () => {
    // Credentials, bearer keys, resource-access modes, allowlists, self-app
    // config, feature switches, and timeout controls must all be represented so
    // no class of ambient provider variable leaks into tests.
    expect(GITHUB_ENV_VARS).toEqual(
      expect.arrayContaining(['GITHUB_APP_ID', 'ZORO_GITHUB_API_KEY'])
    );
    expect(VERCEL_ENV_VARS).toEqual(
      expect.arrayContaining(['VERCEL_TOKEN', 'ZORO_VERCEL_API_KEY', 'VERCEL_PROJECT_ALLOWLIST'])
    );
    expect(HEROKU_ENV_VARS).toEqual(
      expect.arrayContaining([
        'HEROKU_API_TOKEN',
        'ZORO_HEROKU_API_KEY',
        'HEROKU_SELF_APP',
        'HEROKU_RESOURCE_ACCESS',
        'HEROKU_MUTATIONS_ENABLED',
        'HEROKU_REQUEST_TIMEOUT_MS',
      ])
    );
  });
});

describe('scrubProviderEnv', () => {
  it('removes every known provider variable', () => {
    const env = {};
    for (const key of PROVIDER_ENV_VARS) {
      env[key] = 'ambient-value';
    }

    scrubProviderEnv(env);

    for (const key of PROVIDER_ENV_VARS) {
      expect(env[key]).toBeUndefined();
    }
  });

  it('leaves an unrelated ZORO_ variable intact', () => {
    const env = {
      ZORO_GITHUB_API_KEY: 'ambient-provider-key',
      ZORO_UNRELATED_TEST_SETTING: 'keep-me',
      GITHUB_APP_ID: '123',
    };

    scrubProviderEnv(env);

    expect(env.ZORO_GITHUB_API_KEY).toBeUndefined();
    expect(env.GITHUB_APP_ID).toBeUndefined();
    expect(env.ZORO_UNRELATED_TEST_SETTING).toBe('keep-me');
  });

  it('leaves unrelated GITHUB_/VERCEL_/HEROKU_ prefixed variables intact', () => {
    const env = {
      GITHUB_UNRELATED_FLAG: 'a',
      VERCEL_UNRELATED_FLAG: 'b',
      HEROKU_UNRELATED_FLAG: 'c',
      HEROKU_API_TOKEN: 'scrub-me',
    };

    scrubProviderEnv(env);

    expect(env.HEROKU_API_TOKEN).toBeUndefined();
    expect(env.GITHUB_UNRELATED_FLAG).toBe('a');
    expect(env.VERCEL_UNRELATED_FLAG).toBe('b');
    expect(env.HEROKU_UNRELATED_FLAG).toBe('c');
  });

  it('defaults to scrubbing process.env and is a harmless no-op for absent keys', () => {
    delete process.env.GITHUB_APP_ID;
    process.env.ZORO_UNRELATED_TEST_SETTING = 'keep-me';

    expect(() => scrubProviderEnv()).not.toThrow();
    expect(process.env.GITHUB_APP_ID).toBeUndefined();
    expect(process.env.ZORO_UNRELATED_TEST_SETTING).toBe('keep-me');

    delete process.env.ZORO_UNRELATED_TEST_SETTING;
  });
});

describe('provider env allowlist stays in sync with the config loaders', () => {
  // Guards against drift: every provider-prefixed variable a config loader or
  // gateway middleware reads must be in the scrub allowlist, or an ambient copy
  // of it would leak into tests. Conversely a name in the allowlist that no
  // source references is dead weight worth removing.
  const PROVIDER_PREFIX = /^(GITHUB_|VERCEL_|HEROKU_|ZORO_)/;
  const REFERENCE =
    /(?:source|process\.env)\.([A-Z][A-Z0-9_]+)|'((?:GITHUB_|VERCEL_|HEROKU_|ZORO_)[A-Z0-9_]+)'/g;

  const SOURCE_FILES = [
    'src/config/env.js',
    'src/config/vercel.js',
    'src/config/heroku.js',
    'src/config/engineering.js',
    // The unified dispatcher's own config loader. It was missing from this list,
    // so the switches it reads were invisible to the drift check in both
    // directions.
    'src/config/zoroEngineering.js',
    'src/middleware/requireGithubRepositoryAccess.js',
  ];

  function referencedProviderVars() {
    const found = new Set();

    for (const relative of SOURCE_FILES) {
      const contents = fs.readFileSync(path.join(__dirname, '..', '..', relative), 'utf8');
      let match;
      while ((match = REFERENCE.exec(contents)) !== null) {
        const name = match[1] || match[2];
        if (name && PROVIDER_PREFIX.test(name)) {
          found.add(name);
        }
      }
    }

    return found;
  }

  it('includes every provider variable the config loaders read', () => {
    const referenced = referencedProviderVars();
    const missing = [...referenced].filter((name) => !PROVIDER_ENV_VARS.includes(name));

    expect(missing).toEqual([]);
  });

  it('does not list provider variables no source references', () => {
    const referenced = referencedProviderVars();
    const unused = PROVIDER_ENV_VARS.filter((name) => !referenced.has(name));

    expect(unused).toEqual([]);
  });
});
