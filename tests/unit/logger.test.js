'use strict';

const logger = require('../../src/utils/logger');

describe('log redaction', () => {
  it.each([
    'authorization',
    'Authorization',
    'cookie',
    'set-cookie',
    'password',
    'accessToken',
    'apiKey',
    'API_KEY',
    'clientSecret',
    'MONGODB_URI',
    'mongodbUri',
    'connectionString',
  ])('treats %s as sensitive', (key) => {
    expect(logger.isSensitiveKey(key)).toBe(true);
  });

  it.each(['method', 'status', 'durationMs', 'correlationId', 'route'])(
    'treats %s as safe',
    (key) => {
      expect(logger.isSensitiveKey(key)).toBe(false);
    }
  );

  it('redacts sensitive values while preserving safe ones', () => {
    const redacted = logger.redact({
      method: 'GET',
      authorization: 'Bearer abc123',
      MONGODB_URI: 'mongodb://user:pw@host/db',
    });

    expect(redacted.method).toBe('GET');
    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.MONGODB_URI).toBe('[REDACTED]');
  });

  it('redacts nested structures', () => {
    const redacted = logger.redact({
      request: { headers: { authorization: 'Bearer abc', accept: 'application/json' } },
    });

    expect(redacted.request.headers.authorization).toBe('[REDACTED]');
    expect(redacted.request.headers.accept).toBe('application/json');
  });

  it('redacts inside arrays', () => {
    const redacted = logger.redact([{ token: 'abc' }, { safe: 'yes' }]);

    expect(redacted[0].token).toBe('[REDACTED]');
    expect(redacted[1].safe).toBe('yes');
  });

  it('leaves primitives untouched', () => {
    expect(logger.redact('plain')).toBe('plain');
    expect(logger.redact(42)).toBe(42);
    expect(logger.redact(null)).toBeNull();
  });

  it('stays silent in the test environment by default', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    logger.info('should not be emitted', { method: 'GET' });

    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });
});
