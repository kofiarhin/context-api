'use strict';

const crypto = require('crypto');

const requireVercelActionAuth = require('../../src/middleware/requireVercelActionAuth');

const API_KEY = 'zoro-vercel-test-key-that-is-at-least-32-characters';
const VERCEL_TOKEN = 'vercel-token-for-tests';

function createRequest(authorization) {
  return {
    headers: authorization === undefined ? {} : { authorization },
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
  };
}

function run(authorization, source = {}) {
  const middleware = requireVercelActionAuth(
    {},
    {
      source: {
        VERCEL_TOKEN,
        ZORO_VERCEL_API_KEY: API_KEY,
        ...source,
      },
    }
  );
  const next = jest.fn();

  middleware(createRequest(authorization), {}, next);

  return next;
}

function expectRejected(next) {
  expect(next).toHaveBeenCalledTimes(1);

  const error = next.mock.calls[0][0];

  expect(error).toBeDefined();
  expect(error.statusCode).toBe(401);
  expect(error.code).toBe('AUTHENTICATION_REQUIRED');

  return error;
}

describe('requireVercelActionAuth', () => {
  it('calls next with no argument for the correct token', () => {
    expect(run(`Bearer ${API_KEY}`)).toHaveBeenCalledWith();
  });

  it('reads the Authorization header only', () => {
    const middleware = requireVercelActionAuth(
      {},
      {
        source: {
          VERCEL_TOKEN,
          ZORO_VERCEL_API_KEY: API_KEY,
        },
      }
    );
    const get = jest.fn((name) =>
      String(name).toLowerCase() === 'authorization' ? `Bearer ${API_KEY}` : undefined
    );
    const req = { get, headers: { 'x-api-key': API_KEY } };
    const next = jest.fn();

    middleware(req, {}, next);

    expect(get).toHaveBeenCalledWith('authorization');
    expect(get).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('accepts the Bearer scheme case-insensitively', () => {
    expect(run(`bearer ${API_KEY}`)).toHaveBeenCalledWith();
    expect(run(`BEARER ${API_KEY}`)).toHaveBeenCalledWith();
  });

  it('tolerates leading, separator, and trailing whitespace', () => {
    expect(run(`  Bearer   ${API_KEY}  `)).toHaveBeenCalledWith();
  });

  it('rejects a missing Authorization header', () => {
    expectRejected(run(undefined));
  });

  it('rejects an empty Authorization header', () => {
    expectRejected(run(''));
  });

  it.each([
    ['basic scheme', 'Basic dXNlcjpwYXNz'],
    ['token scheme', `token ${API_KEY}`],
    ['bare token', API_KEY],
    ['scheme only', 'Bearer'],
    ['empty bearer value', 'Bearer '],
    ['whitespace bearer value', 'Bearer    '],
    ['embedded whitespace after token', `Bearer ${API_KEY} extra`],
  ])('rejects %s', (label, header) => {
    expectRejected(run(header));
  });

  it('rejects an incorrect token without echoing either secret', () => {
    const bad = 'wrong-vercel-key-that-is-at-least-32-characters';
    const error = expectRejected(run(`Bearer ${bad}`));
    const serialized = JSON.stringify({
      message: error.message,
      details: error.details,
    });

    expect(serialized).not.toContain(bad);
    expect(serialized).not.toContain(API_KEY);
  });

  it('rejects a token that is a prefix of the configured key', () => {
    expectRejected(run(`Bearer ${API_KEY.slice(0, -1)}`));
  });

  it('rejects a token that extends the configured key', () => {
    expectRejected(run(`Bearer ${API_KEY}extra`));
  });

  it('compares tokens of differing lengths without throwing', () => {
    expect(() => run('Bearer a')).not.toThrow();
    expectRejected(run('Bearer a'));
  });

  it('denies every request when the action key is not configured', () => {
    expectRejected(run(`Bearer ${API_KEY}`, { ZORO_VERCEL_API_KEY: undefined }));
  });

  it('denies every request when the upstream token is not configured', () => {
    expectRejected(run(`Bearer ${API_KEY}`, { VERCEL_TOKEN: undefined }));
  });

  it('uses timing-safe digest comparison', () => {
    const timingSafeEqual = jest.spyOn(crypto, 'timingSafeEqual');

    expect(requireVercelActionAuth.secretsMatch(API_KEY, API_KEY)).toBe(true);

    expect(timingSafeEqual).toHaveBeenCalledTimes(1);
    expect(timingSafeEqual.mock.calls[0][0]).toHaveLength(32);
    expect(timingSafeEqual.mock.calls[0][1]).toHaveLength(32);

    timingSafeEqual.mockRestore();
  });

  it('does not copy the secret onto the request', () => {
    const middleware = requireVercelActionAuth(
      {},
      {
        source: {
          VERCEL_TOKEN,
          ZORO_VERCEL_API_KEY: API_KEY,
        },
      }
    );
    const req = createRequest(`Bearer ${API_KEY}`);
    const keysBefore = Object.keys(req).sort();

    middleware(req, {}, jest.fn());

    expect(Object.keys(req).sort()).toEqual(keysBefore);
    expect(req.zoroVercelApiKey).toBeUndefined();
    expect(req.token).toBeUndefined();
  });
});
