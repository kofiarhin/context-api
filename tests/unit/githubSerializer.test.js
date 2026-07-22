'use strict';

const serializer = require('../../src/serializers/github.serializer');
const {
  repositoryFixture,
  fileFixture,
  directoryFixture,
  branchFixture,
  pullRequestFixture,
  fileWriteFixture,
  SHA_A,
} = require('../helpers/githubFixtures');

describe('repository serialization', () => {
  it('exposes exactly the documented fields', () => {
    const serialized = serializer.serializeRepository(repositoryFixture());

    expect(Object.keys(serialized).sort()).toEqual(
      [
        'archived',
        'defaultBranch',
        'fullName',
        'htmlUrl',
        'name',
        'owner',
        'permissions',
        'private',
      ].sort()
    );
  });

  it('maps owner, visibility, and default branch', () => {
    const serialized = serializer.serializeRepository(repositoryFixture());

    expect(serialized.owner).toBe('kofiarhin');
    expect(serialized.fullName).toBe('kofiarhin/context-api');
    expect(serialized.private).toBe(false);
    expect(serialized.defaultBranch).toBe('main');
  });

  it('reduces raw permissions to contents and pull requests', () => {
    const serialized = serializer.serializeRepository(repositoryFixture());

    expect(serialized.permissions).toEqual({ contents: 'write', pullRequests: 'write' });
  });

  it('reports read-only access when push is not granted', () => {
    const repository = repositoryFixture({
      permissions: { admin: false, push: false, pull: true },
    });

    expect(serializer.serializeRepository(repository).permissions).toEqual({
      contents: 'read',
      pullRequests: 'read',
    });
  });

  it('never leaks clone URLs or admin flags', () => {
    const serialized = JSON.stringify(serializer.serializeRepository(repositoryFixture()));

    expect(serialized).not.toContain('ghs_secret');
    expect(serialized).not.toContain('clone_url');
    expect(serialized).not.toContain('ssh_url');
    expect(serialized).not.toContain('admin');
  });
});

describe('content serialization', () => {
  it('serializes a file with decoded content', () => {
    const serialized = serializer.serializeFileContent({
      owner: 'kofiarhin',
      repo: 'context-api',
      ref: 'main',
      entry: fileFixture(),
      content: '# Example\n',
    });

    expect(serialized.type).toBe('file');
    expect(serialized.encoding).toBe('utf-8');
    expect(serialized.content).toBe('# Example\n');
    expect(serialized.sha).toBe(SHA_A);
  });

  it('never exposes the raw base64 payload or download URL', () => {
    const serialized = JSON.stringify(
      serializer.serializeFileContent({
        owner: 'kofiarhin',
        repo: 'context-api',
        ref: 'main',
        entry: fileFixture(),
        content: '# Example\n',
      })
    );

    expect(serialized).not.toContain('download_url');
    expect(serialized).not.toContain('raw.githubusercontent.com');
  });

  it('reports directory entries and maps dir to directory', () => {
    const serialized = serializer.serializeDirectoryContent({
      owner: 'kofiarhin',
      repo: 'context-api',
      ref: 'main',
      path: 'src',
      entries: directoryFixture(),
    });

    expect(serialized.type).toBe('directory');
    expect(serialized.entries).toHaveLength(2);
    expect(serialized.entries[0].type).toBe('file');
    expect(serialized.entries[1].type).toBe('directory');
  });

  it.each(['symlink', 'submodule'])('preserves the %s type explicitly', (type) => {
    const serialized = serializer.serializeFileContent({
      owner: 'kofiarhin',
      repo: 'context-api',
      ref: 'main',
      entry: fileFixture({ type }),
      content: null,
    });

    expect(serialized.type).toBe(type);
    expect(serialized.content).toBeNull();
  });
});

describe('branch serialization', () => {
  it('exposes name, sha, and protection state only', () => {
    const serialized = serializer.serializeBranch(branchFixture());

    expect(serialized).toEqual({ name: 'main', sha: SHA_A, protected: false });
  });

  it('reports a protected branch', () => {
    expect(serializer.serializeBranch(branchFixture({ protected: true })).protected).toBe(true);
  });

  it('includes the default branch alongside the list', () => {
    const serialized = serializer.serializeBranchList({
      owner: 'kofiarhin',
      repo: 'context-api',
      defaultBranch: 'main',
      branches: [branchFixture()],
    });

    expect(serialized.defaultBranch).toBe('main');
    expect(serialized.branches).toHaveLength(1);
  });
});

describe('write result serialization', () => {
  it('reports the content and commit SHAs', () => {
    const serialized = serializer.serializeFileWrite({
      owner: 'kofiarhin',
      repo: 'context-api',
      branch: 'main',
      path: 'docs/example.md',
      response: fileWriteFixture(),
    });

    expect(serialized.contentSha).toBe('c'.repeat(40));
    expect(serialized.commitSha).toBe('b'.repeat(40));
    expect(serialized.commitUrl).toContain('/commit/');
  });

  it('marks a delete result as deleted', () => {
    const serialized = serializer.serializeFileDelete({
      owner: 'kofiarhin',
      repo: 'context-api',
      branch: 'main',
      path: 'docs/example.md',
      response: fileWriteFixture(),
    });

    expect(serialized.deleted).toBe(true);
    expect(serialized.commitSha).toBe('b'.repeat(40));
  });
});

describe('pull request serialization', () => {
  it('exposes the documented fields', () => {
    const serialized = serializer.serializePullRequest({
      owner: 'kofiarhin',
      repo: 'context-api',
      pullRequest: pullRequestFixture(),
    });

    expect(serialized.number).toBe(42);
    expect(serialized.state).toBe('open');
    expect(serialized.draft).toBe(true);
    expect(serialized.head).toEqual({ ref: 'feature/github-gateway', sha: 'b'.repeat(40) });
    expect(serialized.base).toEqual({ ref: 'main', sha: 'a'.repeat(40) });
  });

  it('preserves an unknown mergeable state rather than guessing', () => {
    const serialized = serializer.serializePullRequest({
      owner: 'kofiarhin',
      repo: 'context-api',
      pullRequest: pullRequestFixture({ mergeable: null, mergeable_state: 'unknown' }),
    });

    expect(serialized.mergeable).toBeNull();
    expect(serialized.mergeableState).toBe('unknown');
  });

  it('never leaks author details or API links', () => {
    const serialized = JSON.stringify(
      serializer.serializePullRequest({
        owner: 'kofiarhin',
        repo: 'context-api',
        pullRequest: pullRequestFixture(),
      })
    );

    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('_links');
    expect(serialized).not.toContain('api.github.com');
  });
});

describe('merge result serialization', () => {
  it('reports merged state, sha, and message', () => {
    const serialized = serializer.serializeMergeResult({
      owner: 'kofiarhin',
      repo: 'context-api',
      number: 42,
      response: { merged: true, sha: SHA_A, message: 'Pull Request successfully merged' },
    });

    expect(serialized).toEqual({
      owner: 'kofiarhin',
      repo: 'context-api',
      number: 42,
      merged: true,
      sha: SHA_A,
      message: 'Pull Request successfully merged',
    });
  });
});
