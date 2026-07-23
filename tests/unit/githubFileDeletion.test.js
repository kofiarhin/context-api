'use strict';

const service = require('../../src/services/github.service');
const {
  createOctokitStub,
  fileFixture,
  fileWriteFixture,
  ok,
  SHA_A,
  SHA_C,
} = require('../helpers/githubFixtures');

const TARGET = { owner: 'kofiarhin', repo: 'context-api' };

function createClient(currentSha = SHA_A) {
  return createOctokitStub({
    repos: {
      getContent: jest.fn(() =>
        Promise.resolve(ok(fileFixture({ path: 'tmp/zoro-smoke-test.txt', sha: currentSha })))
      ),
      deleteFile: jest.fn(() => Promise.resolve(ok(fileWriteFixture()))),
    },
  });
}

describe('GitHub file deletion service regression', () => {
  it('forwards the exact blob SHA and non-default branch to Octokit', async () => {
    const client = createClient();

    const result = await service.deleteFile(
      {
        ...TARGET,
        branch: 'fix/delete-probe',
        path: 'tmp/zoro-smoke-test.txt',
        sha: SHA_A,
        message: 'test: remove disposable probe',
      },
      { client }
    );

    expect(client.rest.repos.getContent).toHaveBeenCalledWith({
      ...TARGET,
      path: 'tmp/zoro-smoke-test.txt',
      ref: 'fix/delete-probe',
    });
    expect(client.rest.repos.deleteFile).toHaveBeenCalledWith({
      ...TARGET,
      branch: 'fix/delete-probe',
      path: 'tmp/zoro-smoke-test.txt',
      sha: SHA_A,
      message: 'test: remove disposable probe',
    });
    expect(result).toMatchObject({
      branch: 'fix/delete-probe',
      path: 'tmp/zoro-smoke-test.txt',
      deleted: true,
    });
  });

  it('preserves stale-SHA conflict behavior and does not call Octokit delete', async () => {
    const client = createClient(SHA_A);

    await expect(
      service.deleteFile(
        {
          ...TARGET,
          branch: 'fix/delete-probe',
          path: 'tmp/zoro-smoke-test.txt',
          sha: SHA_C,
          message: 'test: remove stale probe',
        },
        { client }
      )
    ).rejects.toMatchObject({ statusCode: 409, code: 'GITHUB_CONFLICT' });

    expect(client.rest.repos.deleteFile).not.toHaveBeenCalled();
  });
});
