'use strict';

const { loadEnv } = require('../../src/config/env');

const VALID = {
  NODE_ENV: 'development',
  PORT: '4000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/context_api',
};

describe('loadEnv', () => {
  it('returns a frozen configuration for a valid source', () => {
    const env = loadEnv(VALID);

    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(4000);
    expect(env.mongodbUri).toBe(VALID.MONGODB_URI);
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('applies documented defaults for optional values', () => {
    const env = loadEnv(VALID);

    expect(env.logLevel).toBe('info');
    expect(env.corsOrigins).toEqual([]);
    expect(env.rateLimitWindowMs).toBe(900000);
    expect(env.rateLimitMax).toBe(100);
  });

  it.each(['NODE_ENV', 'PORT', 'MONGODB_URI'])('fails when %s is missing', (key) => {
    const source = { ...VALID };
    delete source[key];

    expect(() => loadEnv(source)).toThrow(new RegExp(`${key} is required`));
  });

  it('rejects an unsupported NODE_ENV', () => {
    expect(() => loadEnv({ ...VALID, NODE_ENV: 'staging' })).toThrow(/NODE_ENV must be one of/);
  });

  it.each(['0', '70000', 'abc', '80.5'])('rejects invalid PORT value %s', (port) => {
    expect(() => loadEnv({ ...VALID, PORT: port })).toThrow(/PORT must be an integer/);
  });

  it('rejects a connection string with an unsupported scheme', () => {
    expect(() => loadEnv({ ...VALID, MONGODB_URI: 'postgres://localhost/db' })).toThrow(
      /MONGODB_URI must start with/
    );
  });

  it('reports every problem in a single error', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging', PORT: 'abc' })).toThrow(
      /NODE_ENV[\s\S]*PORT[\s\S]*MONGODB_URI/
    );
  });

  it('never echoes the connection string value in an error message', () => {
    const secretUri = 'mysql://user:sup3rsecret@db.internal:3306/context';

    expect(() => loadEnv({ ...VALID, MONGODB_URI: secretUri })).toThrow();

    try {
      loadEnv({ ...VALID, MONGODB_URI: secretUri });
    } catch (error) {
      expect(error.message).not.toContain('sup3rsecret');
      expect(error.message).not.toContain('db.internal');
    }
  });

  it('parses a comma-separated CORS allowlist and trims entries', () => {
    const env = loadEnv({
      ...VALID,
      CORS_ORIGINS: 'http://localhost:5173, https://app.example.com ,',
    });

    expect(env.corsOrigins).toEqual(['http://localhost:5173', 'https://app.example.com']);
  });

  it('rejects out-of-range rate limit configuration', () => {
    expect(() => loadEnv({ ...VALID, RATE_LIMIT_MAX: '0' })).toThrow(/RATE_LIMIT_MAX/);
    expect(() => loadEnv({ ...VALID, RATE_LIMIT_WINDOW_MS: '10' })).toThrow(
      /RATE_LIMIT_WINDOW_MS/
    );
  });
});
