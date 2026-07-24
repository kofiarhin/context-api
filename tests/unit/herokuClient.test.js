'use strict';

const client = require('../../src/services/heroku/herokuClient');

const source = {
  HEROKU_API_TOKEN: 'heroku-token-value',
  ZORO_HEROKU_API_KEY: 'a'.repeat(32),
  HEROKU_SELF_APP: 'context-api',
  HEROKU_REQUEST_TIMEOUT_MS: '5000',
};

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

describe('Heroku client', () => {
  test('sends versioned authentication and concurrency headers', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, { id: 'app-id' }, {
      'request-id': 'req-1',
      etag: 'etag-1',
      'ratelimit-remaining': '4499',
    }));

    const result = await client.request('PATCH', '/apps/example', {
      source,
      fetchImpl,
      expectedEtag: 'etag-0',
      body: { name: 'renamed' },
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://api.heroku.com/apps/example', expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({
        Accept: 'application/vnd.heroku+json; version=3',
        Authorization: 'Bearer heroku-token-value',
        'If-Match': 'etag-0',
      }),
      body: JSON.stringify({ name: 'renamed' }),
    }));
    expect(result.meta).toEqual(expect.objectContaining({ herokuRequestId: 'req-1', etag: 'etag-1', rateLimitRemaining: 4499 }));
  });

  test.each([
    [402, 'HEROKU_PAYMENT_REQUIRED'],
    [403, 'HEROKU_RESOURCE_FORBIDDEN'],
    [404, 'HEROKU_NOT_FOUND'],
    [409, 'HEROKU_CONFLICT'],
    [412, 'HEROKU_PRECONDITION_FAILED'],
    [422, 'HEROKU_INVALID_REQUEST'],
    [429, 'HEROKU_RATE_LIMITED'],
    [503, 'HEROKU_UNAVAILABLE'],
  ])('translates upstream %s errors', async (status, code) => {
    const fetchImpl = jest.fn().mockResolvedValue(response(status, { message: 'unsafe upstream detail' }, { 'request-id': 'req-error' }));
    await expect(client.request('GET', '/apps/example', { source, fetchImpl })).rejects.toMatchObject({ code });
  });

  test('builds bounded query strings', () => {
    expect(client.buildQuery({ limit: 10, order: 'desc', empty: '' })).toBe('?limit=10&order=desc');
  });
});
