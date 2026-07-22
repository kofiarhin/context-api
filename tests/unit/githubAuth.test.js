'use strict';

const requireGithubActionAuth = require('../../src/middleware/requireGithubActionAuth');
const { TEST_API_KEY } = require('../helpers/githubFixtures');

function createRequest(authorization) {
  return {
    headers: authorization === undefined ? {} : { authorization },
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
  };
}

function run(authorization, env = { zoroGithubApiKey: TEST_API_KEY }) {
  const middleware = requireGithubActionAuth(env);
  const next = jest.fn();

  middleware(createRequest(authorization), {}, next);

  return next;
}

describe('requireGithubActionAuth', () => {
  it('calls next with no argument for the correct token', () => {
    const next = run(`Bearer ${TEST_API_KEY}`);

    expect(next).toHaveBeenCalledWith();
  });

  it('accepts the scheme case-insensitively', () => {
    expect(run(`bearer ${TEST_API_KEY}`)).toHaveBeenCalledWith();
    expect(run(`BEARER ${TEST_API_KEY}`)).toHaveBeenCalledWith();
  });

  it('tolerates extra whitespace around the token', () => {
    expect(run(`Bearer   ${TEST_API_KEY}  `)).toHaveBeenCalledWith();
  });

  function expectRejected(next) {
    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('AUTHENTICATION_REQUIRED');

    return error;
  }

  it('rejects a missing Authorization header', () => {
    expectRejected(run(undefined));
  });

  it('rejects an empty Authorization header', () => {
    expectRejected(run(''));
  });

  it.each([
    ['basic scheme', 'Basic dXNlcjpwYXNz'],
    ['token scheme', `token ${TEST_API_KEY}`],
    ['bare token', TEST_API_KEY],
    ['scheme only', 'Bearer'],
    ['empty bearer value', 'Bearer '],
    ['whitespace bearer value', 'Bearer    '],
  ])('rejects %s', (label, header) => {
    expectRejected(run(header));
  });

  it('rejects an incorrect token of the same length', () => {
    const wrong = 'x'.repeat(TEST_API_KEY.length);

    expectRejected(run(`Bearer ${wrong}`));
  });

  it('rejects a token that is a prefix of the configured key', () => {
    expectRejected(run(`Bearer ${TEST_API_KEY.slice(0, -1)}`));
  });

  it('rejects a token that extends the configured key', () => {
    expectRejected(run(`Bearer ${TEST_API_KEY}extra`));
  });

  it('compares tokens of differing lengths without throwing', () => {
    // timingSafeEqual rejects unequal-length buffers, so the implementation must
    // normalize widths before comparing. A short token must fail cleanly.
    expect(() => run('Bearer a')).not.toThrow();
    expectRejected(run('Bearer a'));
  });

  it('denies every request when no key is configured', () => {
    expectRejected(run(`Bearer ${TEST_API_KEY}`, { zoroGithubApiKey: null }));
  });

  it('never echoes the supplied or configured token in the error', () => {
    const error = expectRejected(run('Bearer wrong-token-value'));
    const serialized = JSON.stringify({
      message: error.message,
      details: error.details,
    });

    expect(serialized).not.toContain('wrong-token-value');
    expect(serialized).not.toContain(TEST_API_KEY);
  });

  it('does not copy the secret onto the request', () => {
    const middleware = requireGithubActionAuth({ zoroGithubApiKey: TEST_API_KEY });
    const req = createRequest(`Bearer ${TEST_API_KEY}`);
    const keysBefore = Object.keys(req).sort();

    middleware(req, {}, jest.fn());

    // The inbound header naturally still holds the token; what must not happen
    // is the middleware persisting it anywhere else on the request.
    expect(Object.keys(req).sort()).toEqual(keysBefore);
    expect(req.zoroGithubApiKey).toBeUndefined();
    expect(req.token).toBeUndefined();
  });
});
