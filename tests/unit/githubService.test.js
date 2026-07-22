'use strict';

const service = require('../../src/services/github.service');
const {
  createOctokitStub,
  createUpstreamError,
  repositoryFixture,
  fileFixture,
  directoryFixture,
  branchFixture,
  pullRequestFixture,
  fileWriteFixture,
  ok,
  SHA_A,
  SHA_B,
  SHA_C,
} = require('../helpers/githubFixtures');

const TARGET = { owner: 'kofiarhin', repo: 'context-api' };

function withClient(client) {
  return { client };
}

describe('listRepositories', () => {
  it('requests the installation repository list with pagination', async () => {
    const listReposAccessibleToInstallation = jest.fn(() =>
      Promise.resolve(ok({ repositories: [repositoryFixture()] }))
    );
    const client = createOctokitStub({ apps: { listReposAccessibleToInstallation } });

    const result = await service.listRepositories({ page: 2, perPage: 50 }, withClient(client));

    expect(listReposAccessibleToInstallation).toHaveBeenCalledWith({ page: 2, per_page: 50 });
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 2, perPage: 50, hasNextPage: false });
  });

  it('reports a further page from the Link header', async () => {
    const client = createOctokitStub({
      apps: {
        listReposAccessibleToInstallation: jest.fn(() =>
          Promise.resolve(
            ok({ repositories: [repositoryFixture()] }, { link: '<https://x?page=2>; rel="next"' })
          )
        ),
      },
    });

    const result = await service.listRepositories({ page: 1, perPage: 30 }, withClient(client));

    expect(result.meta.hasNextPage).toBe(true);
  });

  it('translates an upstream failure into a safe error', async () => {
    const client = createOctokitStub({
      apps: {
        listReposAccessibleToInstallation: jest.fn(() => Promise.reject(createUpstreamError(500))),
      },
    });

    await expect(
      service.listRepositories({ page: 1, perPage: 30 }, withClient(client))
    ).rejects.toMatchObject({ statusCode: 502, code: 'GITHUB_UNAVAILABLE' });
  });
});

describe('getContent', () => {
  it('resolves the default branch when no ref is supplied', async () => {
    const get = jest.fn(() => Promise.resolve(ok(repositoryFixture())));
    const getContent = jest.fn(() => Promise.resolve(ok(fileFixture())));
    const client = createOctokitStub({ repos: { get, getContent } });

    const result = await service.getContent(
      { ...TARGET, path: 'docs/example.md', ref: null },
      withClient(client)
    );

    expect(get).toHaveBeenCalledWith(TARGET);
    expect(getContent).toHaveBeenCalledWith({
      ...TARGET,
      path: 'docs/example.md',
      ref: 'main',
    });
    expect(result.ref).toBe('main');
  });

  it('uses an explicit ref without a repository lookup', async () => {
    const get = jest.fn();
    const getContent = jest.fn(() => Promise.resolve(ok(fileFixture())));
    const client = createOctokitStub({ repos: { get, getContent } });

    await service.getContent(
      { ...TARGET, path: 'docs/example.md', ref: 'feature/x' },
      withClient(client)
    );

    expect(get).not.toHaveBeenCalled();
    expect(getContent).toHaveBeenCalledWith(expect.objectContaining({ ref: 'feature/x' }));
  });

  it('decodes UTF-8 file content exactly', async () => {
    const content = '# Héllo — wörld 👋\nsecond line\n';
    const client = createOctokitStub({
      repos: {
        getContent: jest.fn(() => Promise.resolve(ok(fileFixture({ rawContent: content })))),
      },
    });

    const result = await service.getContent(
      { ...TARGET, path: 'docs/example.md', ref: 'main' },
      withClient(client)
    );

    expect(result.content).toBe(content);
  });

  it('reads an empty file', async () => {
    const client = createOctokitStub({
      repos: { getContent: jest.fn(() => Promise.resolve(ok(fileFixture({ rawContent: '' })))) },
    });

    const result = await service.getContent(
      { ...TARGET, path: 'docs/empty.md', ref: 'main' },
      withClient(client)
    );

    expect(result.content).toBe('');
  });

  it('lists a directory without expanding it recursively', async () => {
    const client = createOctokitStub({
      repos: { getContent: jest.fn(() => Promise.resolve(ok(directoryFixture()))) },
    });

    const result = await service.getContent(
      { ...TARGET, path: 'src', ref: 'main' },
      withClient(client)
    );

    expect(result.type).toBe('directory');
    expect(result.entries).toHaveLength(2);
  });

  it('rejects binary content with 415', async () => {
    const binary = Buffer.from([0x00, 0x01, 0xff, 0xfe]).toString('base64');
    const client = createOctokitStub({
      repos: {
        getContent: jest.fn(() => Promise.resolve(ok(fileFixture({ content: binary })))),
      },
    });

    await expect(
      service.getContent({ ...TARGET, path: 'image.png', ref: 'main' }, withClient(client))
    ).rejects.toMatchObject({ statusCode: 415, code: 'UNSUPPORTED_CONTENT' });
  });

  it('rejects a blob GitHub declined to inline', async () => {
    const client = createOctokitStub({
      repos: {
        getContent: jest.fn(() =>
          Promise.resolve(ok(fileFixture({ encoding: 'none', content: '' })))
        ),
      },
    });

    await expect(
      service.getContent({ ...TARGET, path: 'huge.txt', ref: 'main' }, withClient(client))
    ).rejects.toMatchObject({ statusCode: 415 });
  });

  it('maps a missing path to 404', async () => {
    const client = createOctokitStub({
      repos: { getContent: jest.fn(() => Promise.reject(createUpstreamError(404))) },
    });

    await expect(
      service.getContent({ ...TARGET, path: 'missing.md', ref: 'main' }, withClient(client))
    ).rejects.toMatchObject({ statusCode: 404, code: 'GITHUB_NOT_FOUND' });
  });
});

describe('listBranches', () => {
  it('returns the default branch alongside the branch list', async () => {
    const client = createOctokitStub({
      repos: {
        get: jest.fn(() => Promise.resolve(ok(repositoryFixture()))),
        listBranches: jest.fn(() => Promise.resolve(ok([branchFixture()]))),
      },
    });

    const result = await service.listBranches(
      { ...TARGET, page: 1, perPage: 30 },
      withClient(client)
    );

    expect(result.data.defaultBranch).toBe('main');
    expect(result.data.branches).toEqual([{ name: 'main', sha: SHA_A, protected: false }]);
  });
});

describe('createBranch', () => {
  function stubForCreate({ existing = null, baseSha = SHA_A } = {}) {
    return createOctokitStub({
      repos: {
        get: jest.fn(() => Promise.resolve(ok(repositoryFixture()))),
        getCommit: jest.fn(() => Promise.resolve(ok({ sha: baseSha }))),
      },
      git: {
        getRef: jest.fn(() =>
          existing ? Promise.resolve(ok(existing)) : Promise.reject(createUpstreamError(404))
        ),
        createRef: jest.fn(() => Promise.resolve(ok({ object: { sha: baseSha } }))),
      },
    });
  }

  it('creates a branch from the repository default branch', async () => {
    const client = stubForCreate();

    const result = await service.createBranch(
      { ...TARGET, branch: 'feature/x', baseRef: null },
      withClient(client)
    );

    expect(client.rest.repos.getCommit).toHaveBeenCalledWith({ ...TARGET, ref: 'main' });
    expect(client.rest.git.createRef).toHaveBeenCalledWith({
      ...TARGET,
      ref: 'refs/heads/feature/x',
      sha: SHA_A,
    });
    expect(result.baseRef).toBe('main');
    expect(result.sha).toBe(SHA_A);
  });

  it('creates a branch from an explicit base ref', async () => {
    const client = stubForCreate();

    await service.createBranch(
      { ...TARGET, branch: 'feature/x', baseRef: 'v1.0.0' },
      withClient(client)
    );

    expect(client.rest.repos.get).not.toHaveBeenCalled();
    expect(client.rest.repos.getCommit).toHaveBeenCalledWith({ ...TARGET, ref: 'v1.0.0' });
  });

  it('rejects an existing branch with 409 before creating anything', async () => {
    const client = stubForCreate({ existing: { object: { sha: SHA_A } } });

    await expect(
      service.createBranch({ ...TARGET, branch: 'main', baseRef: null }, withClient(client))
    ).rejects.toMatchObject({ statusCode: 409, code: 'GITHUB_CONFLICT' });

    expect(client.rest.git.createRef).not.toHaveBeenCalled();
  });

  it('maps a missing base ref to 404', async () => {
    const client = createOctokitStub({
      repos: {
        getCommit: jest.fn(() => Promise.reject(createUpstreamError(404))),
      },
      git: { getRef: jest.fn(() => Promise.reject(createUpstreamError(404))) },
    });

    await expect(
      service.createBranch(
        { ...TARGET, branch: 'feature/x', baseRef: 'no-such-ref' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateBranch', () => {
  function stubForUpdate({ currentSha = SHA_A, updateResult } = {}) {
    return createOctokitStub({
      repos: { getCommit: jest.fn(() => Promise.resolve(ok({ sha: SHA_B }))) },
      git: {
        getRef: jest.fn(() => Promise.resolve(ok({ object: { sha: currentSha } }))),
        updateRef: jest.fn(() => updateResult || Promise.resolve(ok({ object: { sha: SHA_B } }))),
      },
    });
  }

  it('fast-forwards a branch and never requests a force update', async () => {
    const client = stubForUpdate();

    const result = await service.updateBranch(
      { ...TARGET, branch: 'feature/x', expectedCurrentSha: SHA_A, newSha: SHA_B },
      withClient(client)
    );

    expect(client.rest.git.updateRef).toHaveBeenCalledWith({
      ...TARGET,
      ref: 'heads/feature/x',
      sha: SHA_B,
      force: false,
    });
    expect(result.sha).toBe(SHA_B);
  });

  it('fast-forwards a default branch', async () => {
    const client = stubForUpdate();

    await service.updateBranch(
      { ...TARGET, branch: 'main', expectedCurrentSha: SHA_A, newSha: SHA_B },
      withClient(client)
    );

    expect(client.rest.git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'heads/main', force: false })
    );
  });

  it('rejects a stale expected SHA with 409 and does not update', async () => {
    const client = stubForUpdate({ currentSha: SHA_C });

    await expect(
      service.updateBranch(
        { ...TARGET, branch: 'main', expectedCurrentSha: SHA_A, newSha: SHA_B },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 409, code: 'GITHUB_CONFLICT' });

    expect(client.rest.git.updateRef).not.toHaveBeenCalled();
  });

  it('surfaces a branch protection denial as 403', async () => {
    const client = stubForUpdate({
      updateResult: Promise.reject(createUpstreamError(403, 'Protected branch update failed')),
    });

    await expect(
      service.updateBranch(
        { ...TARGET, branch: 'main', expectedCurrentSha: SHA_A, newSha: SHA_B },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 403, code: 'GITHUB_FORBIDDEN' });
  });

  it('maps a non-fast-forward rejection to 409', async () => {
    const client = stubForUpdate({
      updateResult: Promise.reject(createUpstreamError(422, 'Update is not a fast forward')),
    });

    await expect(
      service.updateBranch(
        { ...TARGET, branch: 'main', expectedCurrentSha: SHA_A, newSha: SHA_B },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a target commit that does not exist', async () => {
    const client = createOctokitStub({
      repos: { getCommit: jest.fn(() => Promise.reject(createUpstreamError(404))) },
      git: {
        getRef: jest.fn(() => Promise.resolve(ok({ object: { sha: SHA_A } }))),
        updateRef: jest.fn(),
      },
    });

    await expect(
      service.updateBranch(
        { ...TARGET, branch: 'main', expectedCurrentSha: SHA_A, newSha: SHA_B },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(client.rest.git.updateRef).not.toHaveBeenCalled();
  });
});

describe('createFile', () => {
  function stubForCreateFile({ exists = false } = {}) {
    return createOctokitStub({
      repos: {
        getContent: jest.fn(() =>
          exists ? Promise.resolve(ok(fileFixture())) : Promise.reject(createUpstreamError(404))
        ),
        createOrUpdateFileContents: jest.fn(() => Promise.resolve(ok(fileWriteFixture()))),
      },
    });
  }

  it.each(['main', 'master', 'feature/x'])('creates a file on %s', async (branch) => {
    const client = stubForCreateFile();

    const result = await service.createFile(
      {
        ...TARGET,
        branch,
        path: 'docs/example.md',
        content: '# Example\n',
        message: 'docs: add example',
      },
      withClient(client)
    );

    expect(client.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
      ...TARGET,
      branch,
      path: 'docs/example.md',
      message: 'docs: add example',
      content: Buffer.from('# Example\n', 'utf8').toString('base64'),
    });
    expect(result.commitSha).toBe(SHA_B);
  });

  it('never sends a SHA when creating', async () => {
    const client = stubForCreateFile();

    await service.createFile(
      { ...TARGET, branch: 'main', path: 'docs/a.md', content: 'x', message: 'docs: add' },
      withClient(client)
    );

    const payload = client.rest.repos.createOrUpdateFileContents.mock.calls[0][0];

    expect(payload).not.toHaveProperty('sha');
  });

  it('rejects an existing file with 409', async () => {
    const client = stubForCreateFile({ exists: true });

    await expect(
      service.createFile(
        { ...TARGET, branch: 'main', path: 'docs/example.md', content: 'x', message: 'docs: add' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 409, code: 'GITHUB_CONFLICT' });

    expect(client.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
  });

  it('preserves multi-byte UTF-8 through the base64 round trip', async () => {
    const client = stubForCreateFile();
    const content = 'héllo — 👋\n';

    await service.createFile(
      { ...TARGET, branch: 'main', path: 'docs/a.md', content, message: 'docs: add' },
      withClient(client)
    );

    const payload = client.rest.repos.createOrUpdateFileContents.mock.calls[0][0];

    expect(Buffer.from(payload.content, 'base64').toString('utf8')).toBe(content);
  });
});

describe('updateFile', () => {
  function stubForUpdateFile({ current = fileFixture(), missing = false } = {}) {
    return createOctokitStub({
      repos: {
        getContent: jest.fn(() =>
          missing ? Promise.reject(createUpstreamError(404)) : Promise.resolve(ok(current))
        ),
        createOrUpdateFileContents: jest.fn(() => Promise.resolve(ok(fileWriteFixture()))),
      },
    });
  }

  it('replaces content when the SHA matches', async () => {
    const client = stubForUpdateFile();

    const result = await service.updateFile(
      {
        ...TARGET,
        branch: 'main',
        path: 'docs/example.md',
        sha: SHA_A,
        content: '# Updated\n',
        message: 'docs: update',
      },
      withClient(client)
    );

    expect(client.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ sha: SHA_A, branch: 'main' })
    );
    expect(result.commitSha).toBe(SHA_B);
  });

  it('rejects a stale SHA with 409 and does not write', async () => {
    const client = stubForUpdateFile();

    await expect(
      service.updateFile(
        {
          ...TARGET,
          branch: 'main',
          path: 'docs/example.md',
          sha: SHA_C,
          content: 'x',
          message: 'docs: update',
        },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 409, code: 'GITHUB_CONFLICT' });

    expect(client.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
  });

  it('rejects a missing file with 404', async () => {
    const client = stubForUpdateFile({ missing: true });

    await expect(
      service.updateFile(
        {
          ...TARGET,
          branch: 'main',
          path: 'docs/missing.md',
          sha: SHA_A,
          content: 'x',
          message: 'docs: update',
        },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 404, code: 'GITHUB_NOT_FOUND' });
  });

  it('refuses to write over a directory', async () => {
    const client = stubForUpdateFile({ current: directoryFixture() });

    await expect(
      service.updateFile(
        { ...TARGET, branch: 'main', path: 'src', sha: SHA_A, content: 'x', message: 'docs: u' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 415 });
  });

  it.each(['symlink', 'submodule'])('refuses to write over a %s', async (type) => {
    const client = stubForUpdateFile({ current: fileFixture({ type }) });

    await expect(
      service.updateFile(
        { ...TARGET, branch: 'main', path: 'link', sha: SHA_A, content: 'x', message: 'docs: u' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 415 });
  });
});

describe('deleteFile', () => {
  function stubForDelete({ current = fileFixture(), missing = false, deleteResult } = {}) {
    return createOctokitStub({
      repos: {
        getContent: jest.fn(() =>
          missing ? Promise.reject(createUpstreamError(404)) : Promise.resolve(ok(current))
        ),
        deleteFile: jest.fn(() => deleteResult || Promise.resolve(ok(fileWriteFixture()))),
      },
    });
  }

  it('deletes with the current SHA', async () => {
    const client = stubForDelete();

    const result = await service.deleteFile(
      { ...TARGET, branch: 'main', path: 'docs/example.md', sha: SHA_A, message: 'docs: remove' },
      withClient(client)
    );

    expect(client.rest.repos.deleteFile).toHaveBeenCalledWith({
      ...TARGET,
      branch: 'main',
      path: 'docs/example.md',
      sha: SHA_A,
      message: 'docs: remove',
    });
    expect(result.deleted).toBe(true);
  });

  it('rejects a stale SHA with 409 and does not delete', async () => {
    const client = stubForDelete();

    await expect(
      service.deleteFile(
        { ...TARGET, branch: 'main', path: 'docs/example.md', sha: SHA_C, message: 'docs: rm' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(client.rest.repos.deleteFile).not.toHaveBeenCalled();
  });

  it('rejects a missing file with 404', async () => {
    const client = stubForDelete({ missing: true });

    await expect(
      service.deleteFile(
        { ...TARGET, branch: 'main', path: 'gone.md', sha: SHA_A, message: 'docs: rm' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('surfaces branch protection as 403', async () => {
    const client = stubForDelete({
      deleteResult: Promise.reject(createUpstreamError(403, 'Protected branch')),
    });

    await expect(
      service.deleteFile(
        { ...TARGET, branch: 'main', path: 'docs/example.md', sha: SHA_A, message: 'docs: rm' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('pull requests', () => {
  it('creates a draft pull request', async () => {
    const create = jest.fn(() => Promise.resolve(ok(pullRequestFixture())));
    const client = createOctokitStub({ pulls: { create } });

    const result = await service.createPullRequest(
      {
        ...TARGET,
        title: 'Add gateway',
        body: 'Body',
        head: 'feature/x',
        base: 'main',
        draft: true,
        maintainerCanModify: true,
      },
      withClient(client)
    );

    expect(create).toHaveBeenCalledWith({
      ...TARGET,
      title: 'Add gateway',
      body: 'Body',
      head: 'feature/x',
      base: 'main',
      draft: true,
      maintainer_can_modify: true,
    });
    expect(result.number).toBe(42);
  });

  it('creates a non-draft pull request when requested', async () => {
    const create = jest.fn(() => Promise.resolve(ok(pullRequestFixture({ draft: false }))));
    const client = createOctokitStub({ pulls: { create } });

    const result = await service.createPullRequest(
      {
        ...TARGET,
        title: 'T',
        body: '',
        head: 'feature/x',
        base: 'main',
        draft: false,
        maintainerCanModify: true,
      },
      withClient(client)
    );

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ draft: false }));
    expect(result.draft).toBe(false);
  });

  it('maps a duplicate pull request to 409', async () => {
    const client = createOctokitStub({
      pulls: {
        create: jest.fn(() =>
          Promise.reject(createUpstreamError(422, 'A pull request already exists for feature/x'))
        ),
      },
    });

    await expect(
      service.createPullRequest(
        {
          ...TARGET,
          title: 'T',
          body: '',
          head: 'feature/x',
          base: 'main',
          draft: true,
          maintainerCanModify: true,
        },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('reads a pull request', async () => {
    const client = createOctokitStub({
      pulls: { get: jest.fn(() => Promise.resolve(ok(pullRequestFixture()))) },
    });

    const result = await service.getPullRequest({ ...TARGET, pullNumber: 42 }, withClient(client));

    expect(client.rest.pulls.get).toHaveBeenCalledWith({ ...TARGET, pull_number: 42 });
    expect(result.htmlUrl).toContain('/pull/42');
  });

  it('forwards only the supplied update fields', async () => {
    const update = jest.fn(() => Promise.resolve(ok(pullRequestFixture({ title: 'New' }))));
    const client = createOctokitStub({ pulls: { update } });

    await service.updatePullRequest(
      { ...TARGET, pullNumber: 42, changes: { title: 'New' } },
      withClient(client)
    );

    expect(update).toHaveBeenCalledWith({ ...TARGET, pull_number: 42, title: 'New' });
  });

  it('closes a pull request', async () => {
    const update = jest.fn(() => Promise.resolve(ok(pullRequestFixture({ state: 'closed' }))));
    const client = createOctokitStub({ pulls: { update } });

    const result = await service.updatePullRequest(
      { ...TARGET, pullNumber: 42, changes: { state: 'closed' } },
      withClient(client)
    );

    expect(update).toHaveBeenCalledWith({ ...TARGET, pull_number: 42, state: 'closed' });
    expect(result.state).toBe('closed');
  });

  it('reopens a closed pull request', async () => {
    const update = jest.fn(() => Promise.resolve(ok(pullRequestFixture({ state: 'open' }))));
    const client = createOctokitStub({ pulls: { update } });

    const result = await service.updatePullRequest(
      { ...TARGET, pullNumber: 42, changes: { state: 'open' } },
      withClient(client)
    );

    expect(result.state).toBe('open');
  });
});

describe('mergePullRequest', () => {
  function stubForMerge({ pullRequest = pullRequestFixture(), mergeResult } = {}) {
    return createOctokitStub({
      pulls: {
        get: jest.fn(() => Promise.resolve(ok(pullRequest))),
        merge: jest.fn(
          () =>
            mergeResult ||
            Promise.resolve(
              ok({ merged: true, sha: SHA_C, message: 'Pull Request successfully merged' })
            )
        ),
      },
    });
  }

  it.each(['merge', 'squash', 'rebase'])('merges using the %s method', async (mergeMethod) => {
    const client = stubForMerge();

    const result = await service.mergePullRequest(
      { ...TARGET, pullNumber: 42, expectedHeadSha: SHA_B, mergeMethod },
      withClient(client)
    );

    expect(client.rest.pulls.merge).toHaveBeenCalledWith({
      ...TARGET,
      pull_number: 42,
      sha: SHA_B,
      merge_method: mergeMethod,
    });
    expect(result.merged).toBe(true);
  });

  it('forwards the expected head SHA to GitHub as well as checking it locally', async () => {
    const client = stubForMerge();

    await service.mergePullRequest(
      { ...TARGET, pullNumber: 42, expectedHeadSha: SHA_B, mergeMethod: 'squash' },
      withClient(client)
    );

    expect(client.rest.pulls.merge).toHaveBeenCalledWith(expect.objectContaining({ sha: SHA_B }));
  });

  it('rejects a stale head SHA with 409 without merging', async () => {
    const client = stubForMerge();

    await expect(
      service.mergePullRequest(
        { ...TARGET, pullNumber: 42, expectedHeadSha: SHA_C, mergeMethod: 'squash' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 409, code: 'GITHUB_CONFLICT' });

    expect(client.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it('rejects an already merged pull request', async () => {
    const client = stubForMerge({ pullRequest: pullRequestFixture({ merged: true }) });

    await expect(
      service.mergePullRequest(
        { ...TARGET, pullNumber: 42, expectedHeadSha: SHA_B, mergeMethod: 'squash' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(client.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it('rejects a closed pull request', async () => {
    const client = stubForMerge({ pullRequest: pullRequestFixture({ state: 'closed' }) });

    await expect(
      service.mergePullRequest(
        { ...TARGET, pullNumber: 42, expectedHeadSha: SHA_B, mergeMethod: 'squash' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('surfaces a merge conflict as 409', async () => {
    const client = stubForMerge({
      mergeResult: Promise.reject(createUpstreamError(409, 'Merge conflict')),
    });

    await expect(
      service.mergePullRequest(
        { ...TARGET, pullNumber: 42, expectedHeadSha: SHA_B, mergeMethod: 'squash' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('surfaces missing required checks as 403', async () => {
    const client = stubForMerge({
      mergeResult: Promise.reject(
        createUpstreamError(403, 'Required status check has not succeeded')
      ),
    });

    await expect(
      service.mergePullRequest(
        { ...TARGET, pullNumber: 42, expectedHeadSha: SHA_B, mergeMethod: 'squash' },
        withClient(client)
      )
    ).rejects.toMatchObject({ statusCode: 403, code: 'GITHUB_FORBIDDEN' });
  });

  it('never sends a branch protection bypass parameter', async () => {
    const client = stubForMerge();

    await service.mergePullRequest(
      { ...TARGET, pullNumber: 42, expectedHeadSha: SHA_B, mergeMethod: 'squash' },
      withClient(client)
    );

    const payload = client.rest.pulls.merge.mock.calls[0][0];

    expect(payload).not.toHaveProperty('force');
    expect(payload).not.toHaveProperty('bypass_reason');
    expect(Object.keys(payload).sort()).toEqual(
      ['merge_method', 'owner', 'pull_number', 'repo', 'sha'].sort()
    );
  });
});
