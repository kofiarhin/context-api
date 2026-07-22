'use strict';

const { translateGithubError } = require('../../src/services/githubErrors');
const { ValidationError, GithubForbiddenError } = require('../../src/utils/errors');
const { createUpstreamError } = require('../helpers/githubFixtures');

describe('upstream status mapping', () => {
  it.each([
    [401, 502, 'GITHUB_UNAVAILABLE'],
    [403, 403, 'GITHUB_FORBIDDEN'],
    [404, 404, 'GITHUB_NOT_FOUND'],
    [409, 409, 'GITHUB_CONFLICT'],
    [429, 502, 'GITHUB_UNAVAILABLE'],
    [500, 502, 'GITHUB_UNAVAILABLE'],
    [502, 502, 'GITHUB_UNAVAILABLE'],
    [503, 502, 'GITHUB_UNAVAILABLE'],
  ])('maps upstream %i to %i %s', (upstream, statusCode, code) => {
    const translated = translateGithubError(createUpstreamError(upstream));

    expect(translated.statusCode).toBe(statusCode);
    expect(translated.code).toBe(code);
  });

  it('maps a semantic 422 to a validation error', () => {
    const translated = translateGithubError(
      createUpstreamError(422, 'Invalid request: title is too long')
    );

    expect(translated.statusCode).toBe(422);
    expect(translated.code).toBe('GITHUB_VALIDATION_ERROR');
  });

  it.each([
    'Reference already exists',
    'Update is not a fast forward',
    'No commits between main and feature',
    'Head branch was modified. Review and try the merge again.',
  ])('maps the state conflict %p to a 409', (message) => {
    const translated = translateGithubError(createUpstreamError(422, message));

    expect(translated.statusCode).toBe(409);
    expect(translated.code).toBe('GITHUB_CONFLICT');
  });

  it('falls back to 502 for an error with no status', () => {
    const translated = translateGithubError(new Error('socket hang up'));

    expect(translated.statusCode).toBe(502);
    expect(translated.code).toBe('GITHUB_UNAVAILABLE');
  });

  it('reads the status from a nested response when absent at the top level', () => {
    const error = new Error('nested');
    error.response = { status: 404 };

    expect(translateGithubError(error).statusCode).toBe(404);
  });
});

describe('error passthrough', () => {
  it('returns an application error untouched', () => {
    const original = new ValidationError('Request validation failed.', [
      { field: 'path', message: 'Value is required.' },
    ]);

    expect(translateGithubError(original)).toBe(original);
  });

  it('does not downgrade a policy denial into an upstream error', () => {
    const original = new GithubForbiddenError(
      'Writes beneath .github/workflows are not permitted.'
    );

    expect(translateGithubError(original)).toBe(original);
    expect(translateGithubError(original).statusCode).toBe(403);
  });
});

describe('safe details', () => {
  it('includes the supplied context identifiers', () => {
    const translated = translateGithubError(createUpstreamError(404), {
      repository: 'kofiarhin/context-api',
      branch: 'main',
      path: 'docs/example.md',
    });

    const fields = translated.details.map((detail) => detail.field);

    expect(fields).toEqual(expect.arrayContaining(['repository', 'branch', 'path']));
  });

  it('omits context entries that are empty', () => {
    const translated = translateGithubError(createUpstreamError(404), {
      repository: 'kofiarhin/context-api',
      branch: null,
      path: '',
    });

    const fields = translated.details.map((detail) => detail.field);

    expect(fields).toContain('repository');
    expect(fields).not.toContain('branch');
    expect(fields).not.toContain('path');
  });

  it('preserves a short upstream reason', () => {
    const translated = translateGithubError(createUpstreamError(403, 'Resource not accessible'));

    expect(translated.details).toContainEqual({
      field: 'githubReason',
      message: 'Resource not accessible',
    });
  });

  it('drops an excessively long upstream message', () => {
    const translated = translateGithubError(createUpstreamError(403, 'x'.repeat(500)));
    const fields = translated.details.map((detail) => detail.field);

    expect(fields).not.toContain('githubReason');
  });

  it('strips a trailing request URL from the reason', () => {
    const translated = translateGithubError(
      createUpstreamError(404, 'Not Found - https://docs.github.com/rest/private')
    );

    const reason = translated.details.find((detail) => detail.field === 'githubReason');

    expect(reason.message).toBe('Not Found');
    expect(JSON.stringify(translated.details)).not.toContain('https://');
  });

  it('never forwards upstream headers, tokens, or response bodies', () => {
    const error = createUpstreamError(403, 'Denied', {
      message: 'Denied',
      documentation_url: 'https://docs.github.com/secret',
      token: 'ghs_supersecrettoken',
    });

    const translated = translateGithubError(error, { repository: 'kofiarhin/context-api' });
    const serialized = JSON.stringify({
      message: translated.message,
      details: translated.details,
    });

    expect(serialized).not.toContain('ghs_supersecrettoken');
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('documentation_url');
    expect(serialized).not.toContain('api.github.com/secret-path');
  });

  it('does not carry an upstream stack trace into details', () => {
    const translated = translateGithubError(createUpstreamError(500));

    expect(JSON.stringify(translated.details)).not.toContain('at Object');
  });
});
