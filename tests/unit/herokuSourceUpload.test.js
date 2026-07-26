'use strict';

const zlib = require('node:zlib');
const service = require('../../src/services/heroku/heroku.service');
const routes = require('../../src/services/heroku/herokuRoutes');
const sourceUpload = require('../../src/services/heroku/herokuSourceUpload');

const source = {
  HEROKU_API_TOKEN: 'heroku-token-value',
  ZORO_HEROKU_API_KEY: 'a'.repeat(32),
  HEROKU_SELF_APP: 'context-api',
  HEROKU_RESOURCE_ACCESS: 'all',
  HEROKU_MUTATIONS_ENABLED: 'true',
  HEROKU_BILLING_OPERATIONS_ENABLED: 'true',
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

function githubClient() {
  return {
    request: jest.fn(async (route, parameters) => {
      if (route.includes('/git/commits/')) return { data: { tree: { sha: 'tree-sha' } } };
      if (route.includes('/git/trees/')) {
        return {
          data: {
            tree: [
              { type: 'blob', path: 'api/package.json', sha: 'package' },
              { type: 'blob', path: 'api/server.js', sha: 'server' },
              { type: 'blob', path: 'api/.env', sha: 'secret' },
              { type: 'blob', path: 'api/node_modules/x.js', sha: 'dependency' },
              { type: 'blob', path: 'web/index.html', sha: 'web' },
            ],
          },
        };
      }
      if (route.includes('/git/blobs/')) {
        const value = parameters.file_sha === 'package' ? '{"name":"api"}' : 'console.log("ok")';
        return { data: { encoding: 'base64', content: Buffer.from(value).toString('base64') } };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    }),
  };
}

beforeEach(() => sourceUpload.reset());

describe('governed Heroku source archive upload', () => {
  it('turns source URLs into an opaque capability', async () => {
    const fetchImpl = jest.fn(async () =>
      response(201, {
        id: 'source-id',
        source_blob: {
          put_url: 'https://s3.amazonaws.com/heroku-source/upload',
          get_url: 'https://s3.amazonaws.com/heroku-source/download',
        },
      })
    );

    const result = await service.execute(
      descriptor('createHerokuSource'),
      { body: {} },
      { source, fetchImpl, now: 1000 }
    );

    expect(result.data.id).toBe('source-id');
    expect(result.data.source_blob.capability).toEqual(expect.any(String));
    expect(JSON.stringify(result.data)).not.toContain('amazonaws.com');
  });

  it('uploads only the selected safe directory and rejects replay', async () => {
    const capability = sourceUpload.issue(
      {
        source_blob: {
          put_url: 'https://s3.amazonaws.com/heroku-source/upload',
          get_url: 'https://s3.amazonaws.com/heroku-source/download',
        },
      },
      { now: 1000 }
    );
    let archive;
    const fetchImpl = jest.fn(async (_url, init) => {
      archive = init.body;
      return response(200);
    });
    const input = {
      capability: capability.capability,
      repository: 'kofiarhin/zoro-full-flow-test-20260726',
      commitSha: '8bd7b18a829edb79ca8c57de4db98953486d1ea9',
      sourceDirectory: 'api',
    };

    const result = await sourceUpload.upload(input, {
      now: 1001,
      githubClient: githubClient(),
      fetchImpl,
    });

    expect(result).toEqual(
      expect.objectContaining({
        uploaded: true,
        repository: 'kofiarhin/zoro-full-flow-test-20260726',
        sourceDirectory: 'api',
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    const tar = zlib.gunzipSync(archive).toString('utf8');
    expect(tar).toContain('package.json');
    expect(tar).toContain('server.js');
    expect(tar).not.toContain('.env');
    expect(tar).not.toContain('node_modules');
    expect(tar).not.toContain('web/index.html');

    await expect(
      sourceUpload.upload(input, {
        now: 1002,
        githubClient: githubClient(),
        fetchImpl,
      })
    ).rejects.toMatchObject({ code: 'HEROKU_SOURCE_CAPABILITY_USED' });
  });

  it('injects the bound download URL into createHerokuBuild without exposing it', async () => {
    const capability = sourceUpload.issue(
      {
        source_blob: {
          put_url: 'https://s3.amazonaws.com/heroku-source/upload',
          get_url: 'https://s3.amazonaws.com/heroku-source/download',
        },
      },
      { now: 1000 }
    );
    await sourceUpload.upload(
      {
        capability: capability.capability,
        repository: 'kofiarhin/zoro-full-flow-test-20260726',
        commitSha: '8bd7b18a829edb79ca8c57de4db98953486d1ea9',
        sourceDirectory: 'api',
      },
      { now: 1001, githubClient: githubClient(), fetchImpl: async () => response(200) }
    );

    const fetchImpl = jest.fn(async (_url, init) => {
      expect(JSON.parse(init.body)).toEqual({
        source_blob: { url: 'https://s3.amazonaws.com/heroku-source/download' },
      });
      return response(201, { id: 'build-id', status: 'pending' });
    });

    const result = await service.execute(
      descriptor('createHerokuBuild'),
      {
        app: 'zoro-flow-test-20260726-api',
        body: { sourceCapability: capability.capability },
      },
      { source, fetchImpl, now: 1002 }
    );

    expect(result.data).toEqual(expect.objectContaining({ id: 'build-id' }));
    expect(JSON.stringify(result.data)).not.toContain('amazonaws.com');
  });

  it('rejects caller-controlled and private-network destinations', () => {
    expect(sourceUpload.isTrustedUploadUrl('http://s3.amazonaws.com/file')).toBe(false);
    expect(sourceUpload.isTrustedUploadUrl('https://127.0.0.1/file')).toBe(false);
    expect(sourceUpload.isTrustedUploadUrl('https://example.com/file')).toBe(false);
  });
});