'use strict';

const { createVercelClient } = require('../../src/services/vercelClient');

const source = {
  VERCEL_TOKEN: 'provider-secret-token',
  VERCEL_TEAM_ID: 'team_123',
  ZORO_VERCEL_API_KEY: 'a'.repeat(32),
};

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(payload === null ? '' : JSON.stringify(payload)),
  };
}

describe('Vercel client', () => {
  it('adds bearer authentication and configured team scope', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, { projects: [] }));
    const client = createVercelClient({}, { source, fetchImpl });

    await client.request('GET', '/v9/projects', { query: { limit: 20 } });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.toString()).toContain('teamId=team_123');
    expect(url.toString()).toContain('limit=20');
    expect(options.headers.Authorization).toBe('Bearer provider-secret-token');
  });

  it('does not place provider credentials in the URL', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, {}));
    const client = createVercelClient({}, { source, fetchImpl });
    await client.request('GET', '/v2/user');
    expect(fetchImpl.mock.calls[0][0].toString()).not.toContain('provider-secret-token');
  });

  it('translates upstream errors without preserving arbitrary secret fields', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      response(403, { error: { code: 'forbidden', message: 'Denied', token: 'leak-me' } })
    );
    const client = createVercelClient({}, { source, fetchImpl });

    await expect(client.request('GET', '/v2/user')).rejects.toMatchObject({
      code: 'VERCEL_FORBIDDEN',
      statusCode: 403,
    });

    try {
      await client.request('GET', '/v2/user');
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('leak-me');
      expect(JSON.stringify(error)).not.toContain('provider-secret-token');
    }
  });
});
