'use strict';

const requireVercelActionAuth = require('../../src/middleware/requireVercelActionAuth');

const VERCEL_KEY = 'vercel-action-key-that-is-at-least-32-characters';
const SHARED_KEY = 'github-shared-key-that-is-at-least-32-characters';

function run(authorization, options = {}) {
  const middleware = requireVercelActionAuth(
    { zoroGithubApiKey: options.baseSharedKey || SHARED_KEY },
    {
      source: {
        VERCEL_TOKEN: 'vercel-provider-token',
        ZORO_VERCEL_API_KEY: VERCEL_KEY,
        ...(options.source || {}),
      },
    }
  );
  const req = {
    get(name) {
      return String(name).toLowerCase() === 'authorization' ? authorization : undefined;
    },
  };
  const next = jest.fn();

  middleware(req, {}, next);
  return next;
}

function expectAccepted(next) {
  expect(next).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledWith();
}

function expectRejected(next) {
  expect(next).toHaveBeenCalledTimes(1);
  expect(next.mock.calls[0][0]).toMatchObject({
    code: 'AUTHENTICATION_REQUIRED',
    statusCode: 401,
  });
}

describe('shared Zoro authentication for Vercel', () => {
  it('accepts the dedicated Vercel action key', () => {
    expectAccepted(run(`Bearer ${VERCEL_KEY}`));
  });

  it('accepts the existing GitHub Zoro action key', () => {
    expectAccepted(run(`Bearer ${SHARED_KEY}`));
  });

  it('accepts the shared key from the raw environment source', () => {
    const sourceKey = 'source-shared-key-that-is-at-least-32-characters';
    expectAccepted(
      run(`Bearer ${sourceKey}`, {
        baseSharedKey: null,
        source: { ZORO_GITHUB_API_KEY: sourceKey },
      })
    );
  });

  it('rejects malformed, unknown, and missing credentials', () => {
    expectRejected(run(`Bearer ${SHARED_KEY} extra`));
    expectRejected(run('Bearer unknown-key'));
    expectRejected(run(undefined));
  });

  it('fails closed when the upstream Vercel token is unavailable', () => {
    expectRejected(
      run(`Bearer ${SHARED_KEY}`, {
        source: { VERCEL_TOKEN: undefined },
      })
    );
  });
});
