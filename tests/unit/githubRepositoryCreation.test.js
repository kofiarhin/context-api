'use strict';

const service = require('../../src/services/github.service');
const logger = require('../../src/utils/logger');

// A realistic-looking but fake credential. It must never reach output, an error
// message, a log record, or the serialized result.
const USER_TOKEN = 'ghu_ThisIsAFakeUserTokenValue0000000000';

const ENV = Object.freeze({
  githubRepositoryCreationEnabled: true,
  githubAllowedOwner: 'kofiarhin',
  githubUserAccessToken: USER_TOKEN,
});

function httpError(status, message = 'GitHub error') {
  const error = new Error(message);
  error.status = status;
  return error;
}

function repositoryPayload(overrides = {}) {
  return {
    id: 42,
    name: 'zoro-smoke',
    full_name: 'kofiarhin/zoro-smoke',
    owner: { login: 'kofiarhin', id: 7 },
    private: true,
    visibility: 'private',
    default_branch: 'main',
    html_url: 'https://github.com/kofiarhin/zoro-smoke',
    clone_url: 'https://github.com/kofiarhin/zoro-smoke.git',
    created_at: '2026-07-25T12:00:00Z',
    // Fields that must not survive serialization.
    node_id: 'R_secret',
    owner_token: USER_TOKEN,
    ...overrides,
  };
}

/**
 * Builds a user client whose `repos.get` returns 404 until the repository is
 * created, then returns the payload — the real sequence the service relies on.
 */
function createUserClient({ existing = false, defaultBranch = 'main', getOverride } = {}) {
  let created = existing;

  const get = jest.fn(async () => {
    if (!created) throw httpError(404, 'Not Found');
    return { data: repositoryPayload({ default_branch: defaultBranch }) };
  });

  return {
    created: () => created,
    rest: {
      repos: {
        get: getOverride || get,
        createForAuthenticatedUser: jest.fn(async () => {
          created = true;
          return { data: repositoryPayload({ default_branch: defaultBranch }) };
        }),
        renameBranch: jest.fn(async () => {
          defaultBranch = 'main';
          return { data: { name: 'main' } };
        }),
      },
    },
  };
}

function createInstallationClient({ accessible = true } = {}) {
  return {
    rest: {
      repos: {
        get: jest.fn(async () => {
          if (!accessible) throw httpError(404, 'Not Found');
          return { data: repositoryPayload() };
        }),
      },
    },
  };
}

function deps(overrides = {}) {
  return {
    env: ENV,
    userClient: createUserClient(),
    installationClient: createInstallationClient(),
    ...overrides,
  };
}

describe('GitHub repository creation', () => {
  it('creates a repository for the permitted owner and returns safe metadata', async () => {
    const dependencies = deps();

    const result = await service.createRepository(
      { owner: 'kofiarhin', name: 'zoro-smoke', visibility: 'private' },
      dependencies
    );

    expect(result).toEqual({
      owner: 'kofiarhin',
      name: 'zoro-smoke',
      fullName: 'kofiarhin/zoro-smoke',
      private: true,
      visibility: 'private',
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/kofiarhin/zoro-smoke',
      cloneUrl: 'https://github.com/kofiarhin/zoro-smoke.git',
      createdAt: '2026-07-25T12:00:00Z',
      installationAccessible: true,
    });

    // Field-by-field serialization: nothing upstream returned leaks through.
    expect(result).not.toHaveProperty('node_id');
    expect(result).not.toHaveProperty('owner_token');
    expect(result).not.toHaveProperty('id');
  });

  it('accepts a case-insensitive owner and defaults visibility to private', async () => {
    const dependencies = deps();

    const result = await service.createRepository(
      { owner: 'KofiArhin', name: 'zoro-smoke' },
      dependencies
    );

    expect(result.private).toBe(true);
    const call = dependencies.userClient.rest.repos.createForAuthenticatedUser.mock.calls[0][0];
    expect(call.private).toBe(true);
  });

  it('initialises the repository so it has a default branch', async () => {
    const dependencies = deps();

    await service.createRepository({ owner: 'kofiarhin', name: 'zoro-smoke' }, dependencies);

    const call = dependencies.userClient.rest.repos.createForAuthenticatedUser.mock.calls[0][0];
    expect(call.auto_init).toBe(true);
  });

  it('renames the default branch to main when the account default differs', async () => {
    const userClient = createUserClient({ defaultBranch: 'master' });
    const dependencies = deps({ userClient });

    await service.createRepository({ owner: 'kofiarhin', name: 'zoro-smoke' }, dependencies);

    expect(userClient.rest.repos.renameBranch).toHaveBeenCalledWith(
      expect.objectContaining({ branch: 'master', new_name: 'main' })
    );
  });

  it('does not rename when the default branch is already main', async () => {
    const userClient = createUserClient({ defaultBranch: 'main' });

    await service.createRepository(
      { owner: 'kofiarhin', name: 'zoro-smoke' },
      deps({ userClient })
    );

    expect(userClient.rest.repos.renameBranch).not.toHaveBeenCalled();
  });

  it('reads the repository back after creation', async () => {
    const userClient = createUserClient();

    await service.createRepository(
      { owner: 'kofiarhin', name: 'zoro-smoke' },
      deps({ userClient })
    );

    // One duplicate probe before creating, then the post-create read and the
    // final read-back.
    expect(userClient.rest.repos.get.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('verifies the GitHub App installation can access the repository', async () => {
    const installationClient = createInstallationClient({ accessible: true });

    const result = await service.createRepository(
      { owner: 'kofiarhin', name: 'zoro-smoke' },
      deps({ installationClient })
    );

    expect(installationClient.rest.repos.get).toHaveBeenCalledWith({
      owner: 'kofiarhin',
      repo: 'zoro-smoke',
    });
    expect(result.installationAccessible).toBe(true);
  });

  it('fails clearly when the installation cannot see the new repository', async () => {
    const installationClient = createInstallationClient({ accessible: false });

    await expect(
      service.createRepository(
        { owner: 'kofiarhin', name: 'zoro-smoke' },
        deps({ installationClient })
      )
    ).rejects.toThrow(/installation cannot access it/i);
  });

  it('rejects an owner other than the configured one', async () => {
    const dependencies = deps();

    await expect(
      service.createRepository({ owner: 'someone-else', name: 'zoro-smoke' }, dependencies)
    ).rejects.toThrow(/owner is not allowed/i);

    expect(dependencies.userClient.rest.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('rejects a missing owner rather than defaulting to one', async () => {
    await expect(service.createRepository({ name: 'zoro-smoke' }, deps())).rejects.toThrow(
      /owner is not allowed/i
    );
  });

  it.each(['bad name', '-leading-hyphen', '', 'a/b', 'x'.repeat(101), 'na$me'])(
    'rejects the invalid repository name %p',
    async (name) => {
      const dependencies = deps();

      await expect(
        service.createRepository({ owner: 'kofiarhin', name }, dependencies)
      ).rejects.toThrow(/Repository name/i);

      expect(dependencies.userClient.rest.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
    }
  );

  it.each(['internal', 'secret', 'PUBLICLY', 'none'])(
    'rejects the invalid visibility %p',
    async (visibility) => {
      await expect(
        service.createRepository({ owner: 'kofiarhin', name: 'zoro-smoke', visibility }, deps())
      ).rejects.toThrow(/visibility must be private or public/i);
    }
  );

  it('accepts public visibility', async () => {
    const dependencies = deps();

    await service.createRepository(
      { owner: 'kofiarhin', name: 'zoro-smoke', visibility: 'public' },
      dependencies
    );

    const call = dependencies.userClient.rest.repos.createForAuthenticatedUser.mock.calls[0][0];
    expect(call.private).toBe(false);
  });

  it('returns a conflict for a repository that already exists', async () => {
    const userClient = createUserClient({ existing: true });

    await expect(
      service.createRepository({ owner: 'kofiarhin', name: 'zoro-smoke' }, deps({ userClient }))
    ).rejects.toThrow(/already exists/i);

    expect(userClient.rest.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('refuses when repository creation is disabled', async () => {
    await expect(
      service.createRepository(
        { owner: 'kofiarhin', name: 'zoro-smoke' },
        deps({ env: { ...ENV, githubRepositoryCreationEnabled: false } })
      )
    ).rejects.toThrow(/creation is disabled/i);
  });

  describe('credential safety', () => {
    it('never includes the user token in a successful result', async () => {
      const result = await service.createRepository(
        { owner: 'kofiarhin', name: 'zoro-smoke' },
        deps()
      );

      expect(JSON.stringify(result)).not.toContain(USER_TOKEN);
    });

    it('never includes the user token in an error raised upstream', async () => {
      const userClient = createUserClient();
      userClient.rest.repos.createForAuthenticatedUser = jest.fn(async () => {
        throw httpError(422, `Upstream rejected token ${USER_TOKEN}`);
      });

      const error = await service
        .createRepository({ owner: 'kofiarhin', name: 'zoro-smoke' }, deps({ userClient }))
        .catch((thrown) => thrown);

      expect(error).toBeInstanceOf(Error);
      expect(JSON.stringify({ message: error.message, details: error.details })).not.toContain(
        USER_TOKEN
      );
    });

    it('never writes the user token to the log', async () => {
      const info = jest.spyOn(logger, 'info').mockImplementation(() => {});

      try {
        await service.createRepository({ owner: 'kofiarhin', name: 'zoro-smoke' }, deps());
        expect(JSON.stringify(info.mock.calls)).not.toContain(USER_TOKEN);
        expect(info).toHaveBeenCalledWith(
          'github.repository.created',
          expect.objectContaining({ repository: 'kofiarhin/zoro-smoke' })
        );
      } finally {
        info.mockRestore();
      }
    });
  });
});
