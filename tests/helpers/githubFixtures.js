'use strict';

/**
 * Deterministic GitHub test doubles.
 *
 * Nothing here reaches the network. `createOctokitStub` mirrors the shape of the
 * installation client so services can be driven through the same call surface
 * Octokit exposes, and `createUpstreamError` reproduces the `status`-carrying
 * errors Octokit throws.
 */

// A syntactically valid throwaway key used only to exercise PEM validation.
// It is not a real credential and cannot authenticate against anything.
const TEST_PEM = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
  'KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQJAIJLixBy2qpFoS4DSmoEm',
  'o3qGy0t6z09AIJtH+5OeRV1be+N4cDYJKffGzDa88vQENZiRm0GRq6a+HPGQMd2k',
  'TQIhAKMSvzIBnni7ot/OSie2TmJLY4SwTQAevXysE2RbFDYdAiEBCUEaRQnMnbp7',
  '9mxDXDf6AU0cN/RPBjb9qSHDcWZHGzUCIG2Es59z8ugGrDY+pxLQnwfotadxd+Uy',
  'v/Ow5T0q5gIJAiEAyS4RaI9YG8EWx/2w0T67ZUVAw8eOMB6BIUg0Xcu+3okCIBOs',
  '/5OiPgoTdSy7bcF9IGpSE8ZgGKzgYQVZeN97YE00',
  '-----END RSA PRIVATE KEY-----',
  '',
].join('\n');

const TEST_PRIVATE_KEY_BASE64 = Buffer.from(TEST_PEM, 'utf8').toString('base64');
const TEST_API_KEY = 'test-zoro-github-api-key-0123456789abcdef';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

function githubEnvOverrides(overrides = {}) {
  return {
    githubAppId: 123456,
    githubInstallationId: 654321,
    githubPrivateKey: TEST_PEM,
    githubRepositoryAccess: 'all',
    zoroGithubApiKey: TEST_API_KEY,
    ...overrides,
  };
}

function authHeader(token = TEST_API_KEY) {
  return `Bearer ${token}`;
}

/**
 * Builds an error shaped like an Octokit request failure.
 *
 * The `response` body is populated on purpose so tests can assert that the
 * translator discards it rather than forwarding it to the client.
 */
function createUpstreamError(status, message = 'Upstream failure', body = {}) {
  const error = new Error(message);
  error.status = status;
  error.response = {
    status,
    url: 'https://api.github.com/secret-path',
    headers: { authorization: 'token ghs_supersecrettoken' },
    data: body,
  };

  return error;
}

function repositoryFixture(overrides = {}) {
  return {
    id: 1,
    name: 'context-api',
    full_name: 'kofiarhin/context-api',
    owner: { login: 'kofiarhin', id: 99, node_id: 'MDQ6' },
    private: false,
    archived: false,
    default_branch: 'main',
    html_url: 'https://github.com/kofiarhin/context-api',
    permissions: { admin: true, push: true, pull: true, maintain: true },
    // Fields that must never be serialized into a response.
    clone_url: 'https://x-access-token:ghs_secret@github.com/kofiarhin/context-api.git',
    ssh_url: 'git@github.com:kofiarhin/context-api.git',
    ...overrides,
  };
}

function fileFixture(overrides = {}) {
  const content = overrides.rawContent === undefined ? '# Example\n' : overrides.rawContent;
  delete overrides.rawContent;

  return {
    type: 'file',
    name: 'example.md',
    path: 'docs/example.md',
    sha: SHA_A,
    size: content.length,
    encoding: 'base64',
    content: Buffer.from(content, 'utf8').toString('base64'),
    html_url: 'https://github.com/kofiarhin/context-api/blob/main/docs/example.md',
    download_url: 'https://raw.githubusercontent.com/token/docs/example.md',
    ...overrides,
  };
}

function directoryFixture() {
  return [
    {
      type: 'file',
      name: 'app.js',
      path: 'src/app.js',
      sha: SHA_A,
      size: 2048,
      html_url: 'https://github.com/kofiarhin/context-api/blob/main/src/app.js',
    },
    {
      type: 'dir',
      name: 'routes',
      path: 'src/routes',
      sha: SHA_B,
      size: 0,
      html_url: 'https://github.com/kofiarhin/context-api/tree/main/src/routes',
    },
  ];
}

function branchFixture(overrides = {}) {
  return {
    name: 'main',
    commit: { sha: SHA_A, url: 'https://api.github.com/commits/a' },
    protected: false,
    ...overrides,
  };
}

function pullRequestFixture(overrides = {}) {
  return {
    number: 42,
    title: 'Add GitHub gateway',
    body: 'Implements the approved gateway specification.',
    state: 'open',
    draft: true,
    merged: false,
    mergeable: true,
    mergeable_state: 'clean',
    head: { ref: 'feature/github-gateway', sha: SHA_B },
    base: { ref: 'main', sha: SHA_A },
    html_url: 'https://github.com/kofiarhin/context-api/pull/42',
    // Must not leak into the serialized response.
    user: { login: 'kofiarhin', email: 'private@example.com' },
    _links: { self: { href: 'https://api.github.com/pulls/42' } },
    ...overrides,
  };
}

function fileWriteFixture(overrides = {}) {
  return {
    content: { sha: SHA_C, path: 'docs/example.md' },
    commit: {
      sha: SHA_B,
      html_url: 'https://github.com/kofiarhin/context-api/commit/bbb',
    },
    ...overrides,
  };
}

function ok(data, headers = {}) {
  return { status: 200, headers, data };
}

/**
 * Builds a stub installation client.
 *
 * Every method defaults to a jest mock that rejects, so a service reaching an
 * endpoint the test did not intend surfaces loudly rather than silently
 * returning undefined.
 */
function createOctokitStub(overrides = {}) {
  const unexpected = (name) =>
    jest.fn(() => Promise.reject(new Error(`Unexpected call to ${name}`)));

  const stub = {
    rest: {
      apps: {
        listReposAccessibleToInstallation: unexpected('apps.listReposAccessibleToInstallation'),
      },
      repos: {
        get: unexpected('repos.get'),
        getContent: unexpected('repos.getContent'),
        listBranches: unexpected('repos.listBranches'),
        getCommit: unexpected('repos.getCommit'),
        createOrUpdateFileContents: unexpected('repos.createOrUpdateFileContents'),
        deleteFile: unexpected('repos.deleteFile'),
      },
      git: {
        getRef: unexpected('git.getRef'),
        createRef: unexpected('git.createRef'),
        updateRef: unexpected('git.updateRef'),
      },
      pulls: {
        create: unexpected('pulls.create'),
        get: unexpected('pulls.get'),
        update: unexpected('pulls.update'),
        merge: unexpected('pulls.merge'),
      },
    },
  };

  for (const [namespace, methods] of Object.entries(overrides)) {
    Object.assign(stub.rest[namespace], methods);
  }

  return stub;
}

module.exports = {
  TEST_PEM,
  TEST_PRIVATE_KEY_BASE64,
  TEST_API_KEY,
  SHA_A,
  SHA_B,
  SHA_C,
  githubEnvOverrides,
  authHeader,
  createUpstreamError,
  repositoryFixture,
  fileFixture,
  directoryFixture,
  branchFixture,
  pullRequestFixture,
  fileWriteFixture,
  ok,
  createOctokitStub,
};
