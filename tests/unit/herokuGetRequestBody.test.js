'use strict';

/**
 * Regression coverage for Heroku read requests carrying a body.
 *
 * `fetch` rejects a GET or HEAD that has a body, synchronously and before any
 * network call. The Heroku client caught that TypeError alongside genuine
 * network failures and reported it as HEROKU_UNAVAILABLE, so every Heroku read
 * returned 502 with a message blaming the upstream.
 *
 * It reached production because callers legitimately supply an empty body: the
 * unified Zoro dispatcher destructures `body = {}` for every operation, so the
 * `{}` that reached `requestBody` was indistinguishable from an intentional one.
 * These tests pin the behaviour at both layers.
 */

const client = require('../../src/services/heroku/herokuClient');
const service = require('../../src/services/heroku/heroku.service');
const routes = require('../../src/services/heroku/herokuRoutes');

const source = {
  HEROKU_API_TOKEN: 'heroku-token-value',
  ZORO_HEROKU_API_KEY: 'a'.repeat(32),
  HEROKU_SELF_APP: 'context-api',
  HEROKU_RESOURCE_ACCESS: 'all',
  HEROKU_MUTATIONS_ENABLED: 'true',
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

function descriptor(operationId) {
  return routes.find((route) => route.operationId === operationId);
}

/**
 * Stands in for undici's real behaviour, which is what the production failure
 * actually was. A mock that quietly accepted the body would not have caught it.
 */
function strictFetch(impl) {
  return jest.fn(async (url, init) => {
    if ((init.method === 'GET' || init.method === 'HEAD') && init.body !== undefined) {
      throw new TypeError('Request with GET/HEAD method cannot have body.');
    }
    return impl ? impl(url, init) : response(200, {});
  });
}

describe('Heroku client omits the body on reads', () => {
  it.each(['GET', 'HEAD'])('sends no body for %s even when one is supplied', async (method) => {
    const fetchImpl = strictFetch();

    await client.request(method, '/apps', { source, fetchImpl, body: {} });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.heroku.com/apps',
      expect.objectContaining({ method, body: undefined })
    );
  });

  it('still sends a body on a write', async () => {
    const fetchImpl = strictFetch();

    await client.request('PATCH', '/apps/example', {
      source,
      fetchImpl,
      body: { name: 'renamed' },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.heroku.com/apps/example',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'renamed' }) })
    );
  });
});

describe('Heroku service reads succeed when a caller supplies an empty body', () => {
  it('lists apps when body is {}, as the unified dispatcher always sends', async () => {
    const fetchImpl = strictFetch(() => response(200, [{ name: 'context-api' }]));

    const result = await service.execute(
      descriptor('listHerokuApps'),
      { body: {}, query: {} },
      { source, fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.heroku.com/apps',
      expect.objectContaining({ method: 'GET', body: undefined })
    );
    expect(result.status).toBe(200);
  });

  it('reads a single app with a path parameter and an empty body', async () => {
    const fetchImpl = strictFetch(() => response(200, { name: 'context-api' }));

    await service.execute(
      descriptor('getHerokuApp'),
      { app: 'context-api', body: {}, query: {} },
      { source, fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.heroku.com/apps/context-api',
      expect.objectContaining({ method: 'GET', body: undefined })
    );
  });

  it('reads config-var metadata, the path that hid live redaction coverage', async () => {
    const fetchImpl = strictFetch(() => response(200, { MONGODB_URI: 'mongodb://x/y' }));

    const result = await service.execute(
      descriptor('listHerokuConfigVarMetadata'),
      { app: 'context-api', body: {}, query: {} },
      { source, fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.heroku.com/apps/context-api/config-vars',
      expect.objectContaining({ method: 'GET', body: undefined })
    );
    // Redaction is unchanged by this fix and must survive it.
    expect(JSON.stringify(result.data)).not.toContain('mongodb://x/y');
    expect(result.data).toEqual([
      expect.objectContaining({ key: 'MONGODB_URI', sensitive: true, value: '[REDACTED]' }),
    ]);
  });

  it('keeps sending a body on a write through the service', async () => {
    const fetchImpl = strictFetch(() => response(201, { name: 'new-app' }));

    await service.execute(
      descriptor('createHerokuApp'),
      { body: { name: 'new-app' }, query: {} },
      // createHerokuApp is billing-sensitive, so its switch must be on for the
      // request to reach the client at all.
      { source: { ...source, HEROKU_BILLING_OPERATIONS_ENABLED: 'true' }, fetchImpl }
    );

    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'new-app' });
  });
});

describe('every read descriptor is body-free', () => {
  it('never builds a body for a GET or HEAD operation', () => {
    const reads = routes.filter((route) => route.method === 'GET' || route.method === 'HEAD');

    expect(reads.length).toBeGreaterThan(50);

    for (const route of reads) {
      expect(service.requestBody(route, { body: {}, params: {} })).toBeUndefined();
      expect(service.requestBody(route, { body: { stray: true }, params: {} })).toBeUndefined();
    }
  });
});
