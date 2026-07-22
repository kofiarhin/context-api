'use strict';

const requireGithubRepositoryAccess = require('../../src/middleware/requireGithubRepositoryAccess');

function runMiddleware({ allowlist, body = {}, query = {} }) {
  const middleware = requireGithubRepositoryAccess({ githubRepositoryAllowlist: allowlist });
  const req = { body, query };
  const next = jest.fn();

  middleware(req, {}, next);

  return next;
}

describe('requireGithubRepositoryAccess', () => {
  it('keeps the current all-repository behavior when no allowlist is configured', () => {
    const next = runMiddleware({
      allowlist: '',
      body: { owner: 'someone', repo: 'anything' },
    });

    expect(next).toHaveBeenCalledWith();
  });

  it('allows a configured repository case-insensitively', () => {
    const next = runMiddleware({
      allowlist: 'kofiarhin/context-api, kofiarhin/ideahub',
      query: { owner: 'KofiArhin', repo: 'Context-API' },
    });

    expect(next).toHaveBeenCalledWith();
  });

  it('denies a repository outside the configured allowlist', () => {
    const next = runMiddleware({
      allowlist: 'kofiarhin/context-api',
      body: { owner: 'kofiarhin', repo: 'another-repo' },
    });

    const error = next.mock.calls[0][0];
    expect(error.code).toBe('GITHUB_FORBIDDEN');
    expect(error.statusCode).toBe(403);
  });

  it('defers malformed requests to the normal request validator', () => {
    const next = runMiddleware({ allowlist: 'kofiarhin/context-api', body: {} });

    expect(next).toHaveBeenCalledWith();
  });
});
