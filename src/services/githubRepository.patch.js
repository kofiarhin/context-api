'use strict';

const logger = require('../utils/logger');
const githubService = require('./github.service');
const { getInstallationClient } = require('./githubClient');
const { getUserClient } = require('./githubUserClient');
const { getZoroEngineeringConfig } = require('../config/zoroEngineering');
const {
  GithubForbiddenError,
  GithubConflictError,
  GithubValidationError,
  GithubUnavailableError,
} = require('../utils/errors');

const REPOSITORY_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const VISIBILITIES = new Set(['private', 'public']);

function translate(error, context) {
  const status = error && error.status;
  if (status === 401 || status === 403) {
    return new GithubForbiddenError('GitHub repository creation was denied.', context);
  }
  if (status === 422) {
    return new GithubValidationError('GitHub rejected the repository request.', context);
  }
  if (status === 409) {
    return new GithubConflictError('The repository request conflicts with current state.', context);
  }
  return new GithubUnavailableError('GitHub repository creation failed.', context);
}

async function repositoryExists(client, owner, repo) {
  try {
    await client.rest.repos.get({ owner, repo });
    return true;
  } catch (error) {
    if (error && error.status === 404) return false;
    throw translate(error, [{ field: 'repository', message: `${owner}/${repo}` }]);
  }
}

async function createRepository(input = {}, deps = {}) {
  const config = deps.config || getZoroEngineeringConfig(deps.source || process.env);
  const owner = String(input.owner || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  const visibility = String(input.visibility || 'private').trim().toLowerCase();

  if (!config.githubRepositoryCreationEnabled) {
    throw new GithubForbiddenError('GitHub repository creation is disabled.');
  }
  if (!owner || owner !== config.githubAllowedOwner) {
    throw new GithubForbiddenError('The requested GitHub owner is not allowed.');
  }
  if (!REPOSITORY_NAME.test(name)) {
    throw new GithubValidationError('Repository name must contain only letters, numbers, dots, underscores, or hyphens.');
  }
  if (!VISIBILITIES.has(visibility)) {
    throw new GithubValidationError('Repository visibility must be private or public.');
  }

  const userClient = deps.userClient || (await getUserClient({ config }));
  let authenticated;
  try {
    authenticated = await userClient.rest.users.getAuthenticated();
  } catch (error) {
    throw translate(error, [{ field: 'owner', message: owner }]);
  }

  if (String(authenticated.data.login || '').toLowerCase() !== owner) {
    throw new GithubForbiddenError('The GitHub user token does not belong to the allowed owner.');
  }

  if (await repositoryExists(userClient, owner, name)) {
    throw new GithubConflictError('The repository already exists.', [
      { field: 'repository', message: `${owner}/${name}` },
    ]);
  }

  let created;
  try {
    created = await userClient.rest.repos.createForAuthenticatedUser({
      name,
      description: typeof input.description === 'string' ? input.description.trim() : '',
      private: visibility === 'private',
      auto_init: input.initializeWithReadme !== false,
      has_issues: true,
      has_projects: true,
      has_wiki: false,
    });
  } catch (error) {
    throw translate(error, [{ field: 'repository', message: `${owner}/${name}` }]);
  }

  let repository = created.data;
  if (repository.default_branch && repository.default_branch !== 'main') {
    try {
      await userClient.rest.repos.renameBranch({
        owner,
        repo: name,
        branch: repository.default_branch,
        new_name: 'main',
      });
    } catch (error) {
      throw translate(error, [{ field: 'defaultBranch', message: repository.default_branch }]);
    }
  }

  try {
    repository = (await userClient.rest.repos.get({ owner, repo: name })).data;
  } catch (error) {
    throw translate(error, [{ field: 'repository', message: `${owner}/${name}` }]);
  }

  let installationAccessible = false;
  try {
    const installationClient = deps.installationClient || (await getInstallationClient());
    await installationClient.rest.repos.get({ owner, repo: name });
    installationAccessible = true;
  } catch (error) {
    if (!error || error.status !== 404) {
      logger.warn('github.repository.installation_access_check_failed', {
        repository: `${owner}/${name}`,
        status: error && error.status,
      });
    }
  }

  logger.info('github.repository.created', {
    repository: `${owner}/${name}`,
    visibility,
    installationAccessible,
  });

  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    owner: repository.owner && repository.owner.login,
    visibility: repository.visibility || visibility,
    private: Boolean(repository.private),
    defaultBranch: repository.default_branch || 'main',
    htmlUrl: repository.html_url,
    cloneUrl: repository.clone_url,
    createdAt: repository.created_at,
    installationAccessible,
  };
}

githubService.createRepository = createRepository;

module.exports = { createRepository, REPOSITORY_NAME, VISIBILITIES };
