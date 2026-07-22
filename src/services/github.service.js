'use strict';

const logger = require('../utils/logger');
const { getInstallationClient } = require('./githubClient');
const { translateGithubError } = require('./githubErrors');
const {
  GithubConflictError,
  GithubNotFoundError,
  UnsupportedContentError,
} = require('../utils/errors');
const serializer = require('../serializers/github.serializer');

/**
 * GitHub domain service.
 *
 * Controllers never reach Octokit directly. Every upstream call is funnelled
 * through `call()` so a failure is translated once, with safe context, and a
 * raw Octokit response never escapes this module.
 */

async function resolveClient(deps) {
  return deps.client || getInstallationClient(deps);
}

/**
 * Invokes an upstream operation and normalizes its failure mode.
 *
 * `context` carries only identifiers the caller already supplied, so the
 * resulting error can name the repository or path without quoting anything
 * GitHub returned.
 */
async function call(operation, context) {
  try {
    return await operation();
  } catch (error) {
    throw translateGithubError(error, context);
  }
}

/**
 * Treats a 404 as an absent resource rather than an error.
 *
 * Used where absence is a normal, expected branch of the logic — confirming a
 * file does not exist before a create, for example.
 */
async function callAllowingMissing(operation, context) {
  try {
    return await operation();
  } catch (error) {
    const translated = translateGithubError(error, context);

    if (translated instanceof GithubNotFoundError) {
      return null;
    }

    throw translated;
  }
}

/**
 * Determines whether more pages are available.
 *
 * GitHub's `Link` header is authoritative when present; the page-size
 * comparison is the fallback for mocked or trimmed responses.
 */
function hasNextPage(response, perPage, count) {
  const link = response && response.headers ? response.headers.link : null;

  if (typeof link === 'string') {
    return link.includes('rel="next"');
  }

  return count === perPage;
}

function paginationMeta({ page, perPage, response, count }) {
  return { page, perPage, hasNextPage: hasNextPage(response, perPage, count) };
}

/**
 * Decodes a Base64 blob as UTF-8 text.
 *
 * The decoded text is re-encoded and compared byte for byte: if the round trip
 * is not lossless the blob was not valid UTF-8, which is how binary content is
 * detected without guessing from the file extension.
 */
function decodeUtf8(base64, context) {
  const buffer = Buffer.from(base64, 'base64');
  const text = buffer.toString('utf8');

  if (Buffer.compare(Buffer.from(text, 'utf8'), buffer) !== 0 || text.includes('\x00')) {
    throw new UnsupportedContentError('The file is not UTF-8 text.', [
      { field: 'path', message: context.path },
    ]);
  }

  return text;
}

async function getRepository(client, { owner, repo }) {
  const response = await call(() => client.rest.repos.get({ owner, repo }), {
    repository: `${owner}/${repo}`,
  });

  return response.data;
}

async function resolveRef(client, { owner, repo, ref }) {
  if (ref) {
    return ref;
  }

  const repository = await getRepository(client, { owner, repo });

  return repository.default_branch;
}

async function listRepositories({ page, perPage }, deps = {}) {
  const client = await resolveClient(deps);

  const response = await call(
    () => client.rest.apps.listReposAccessibleToInstallation({ page, per_page: perPage }),
    {}
  );

  const repositories = response.data.repositories || [];

  logger.info('github.repository.listed', { count: repositories.length, page });

  return {
    data: repositories.map(serializer.serializeRepository),
    meta: paginationMeta({ page, perPage, response, count: repositories.length }),
  };
}

async function getContent({ owner, repo, path, ref }, deps = {}) {
  const client = await resolveClient(deps);
  const resolvedRef = await resolveRef(client, { owner, repo, ref });
  const context = { repository: `${owner}/${repo}`, ref: resolvedRef, path };

  const response = await call(
    () => client.rest.repos.getContent({ owner, repo, path, ref: resolvedRef }),
    context
  );

  const entry = response.data;

  if (Array.isArray(entry)) {
    logger.info('github.content.read', { ...context, type: 'directory' });

    return serializer.serializeDirectoryContent({
      owner,
      repo,
      ref: resolvedRef,
      path,
      entries: entry,
    });
  }

  // Symlinks and submodules are reported under their own type. They are not
  // editable text, so no decode is attempted and no content is returned.
  if (entry.type === 'symlink' || entry.type === 'submodule') {
    logger.info('github.content.read', { ...context, type: entry.type });

    return serializer.serializeFileContent({
      owner,
      repo,
      ref: resolvedRef,
      entry,
      content: null,
    });
  }

  // GitHub omits content for blobs above its inline size limit.
  if (entry.encoding !== 'base64') {
    throw new UnsupportedContentError('The file is too large to read through the gateway.', [
      { field: 'path', message: entry.path },
    ]);
  }

  const content = decodeUtf8(entry.content, { path: entry.path });

  logger.info('github.content.read', { ...context, type: 'file', size: entry.size });

  return serializer.serializeFileContent({ owner, repo, ref: resolvedRef, entry, content });
}

async function listBranches({ owner, repo, page, perPage }, deps = {}) {
  const client = await resolveClient(deps);
  const repository = await getRepository(client, { owner, repo });

  const response = await call(
    () => client.rest.repos.listBranches({ owner, repo, page, per_page: perPage }),
    { repository: `${owner}/${repo}` }
  );

  const branches = response.data || [];

  return {
    data: serializer.serializeBranchList({
      owner,
      repo,
      defaultBranch: repository.default_branch,
      branches,
    }),
    meta: paginationMeta({ page, perPage, response, count: branches.length }),
  };
}

/**
 * Resolves any ref — branch, tag, or commit SHA — to a commit SHA.
 */
async function resolveCommitSha(client, { owner, repo, ref }) {
  const response = await call(() => client.rest.repos.getCommit({ owner, repo, ref }), {
    repository: `${owner}/${repo}`,
    ref,
  });

  return response.data.sha;
}

async function createBranch({ owner, repo, branch, baseRef }, deps = {}) {
  const client = await resolveClient(deps);
  const context = { repository: `${owner}/${repo}`, branch };

  const resolvedBase = await resolveRef(client, { owner, repo, ref: baseRef });

  const existing = await callAllowingMissing(
    () => client.rest.git.getRef({ owner, repo, ref: `heads/${branch}` }),
    context
  );

  if (existing) {
    throw new GithubConflictError('The branch already exists.', [
      { field: 'branch', message: branch },
    ]);
  }

  const sha = await resolveCommitSha(client, { owner, repo, ref: resolvedBase });

  const response = await call(
    () => client.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha }),
    context
  );

  logger.info('github.branch.created', { ...context, sha });

  return serializer.serializeBranchRef({
    owner,
    repo,
    branch,
    sha: response.data.object ? response.data.object.sha : sha,
    baseRef: resolvedBase,
    htmlUrl: `https://github.com/${owner}/${repo}/tree/${branch}`,
  });
}

/**
 * Fast-forwards a branch under optimistic concurrency.
 *
 * `force` is hard-coded to `false` and is never derived from caller input, so a
 * force push cannot be requested through this gateway under any payload.
 */
async function updateBranch({ owner, repo, branch, expectedCurrentSha, newSha }, deps = {}) {
  const client = await resolveClient(deps);
  const context = { repository: `${owner}/${repo}`, branch };

  const current = await call(
    () => client.rest.git.getRef({ owner, repo, ref: `heads/${branch}` }),
    context
  );

  const currentSha = current.data.object.sha;

  if (currentSha !== expectedCurrentSha) {
    throw new GithubConflictError('The branch has moved since it was read.', [
      { field: 'branch', message: branch },
      { field: 'expectedCurrentSha', message: 'Does not match the current branch head.' },
    ]);
  }

  // Confirm the target commit exists before moving the ref, so a typo fails as
  // a 404 rather than an opaque upstream rejection.
  await resolveCommitSha(client, { owner, repo, ref: newSha });

  const response = await call(
    () =>
      client.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newSha,
        force: false,
      }),
    context
  );

  logger.info('github.branch.updated', { ...context, sha: newSha });

  return serializer.serializeBranchRef({
    owner,
    repo,
    branch,
    sha: response.data.object ? response.data.object.sha : newSha,
    htmlUrl: `https://github.com/${owner}/${repo}/tree/${branch}`,
  });
}

/**
 * Reads the current blob at a path, or returns null when it is absent.
 *
 * Directories, symlinks, and submodules are rejected here: they are not
 * replaceable text blobs, and writing to them would corrupt the tree.
 */
async function getExistingFile(client, { owner, repo, path, branch }) {
  const context = { repository: `${owner}/${repo}`, branch, path };

  const response = await callAllowingMissing(
    () => client.rest.repos.getContent({ owner, repo, path, ref: branch }),
    context
  );

  if (!response) {
    return null;
  }

  const entry = response.data;

  if (Array.isArray(entry) || entry.type !== 'file') {
    throw new UnsupportedContentError('The path does not address a file.', [
      { field: 'path', message: path },
    ]);
  }

  return entry;
}

async function createFile({ owner, repo, branch, path, content, message }, deps = {}) {
  const client = await resolveClient(deps);
  const context = { repository: `${owner}/${repo}`, branch, path };

  const existing = await getExistingFile(client, { owner, repo, path, branch });

  if (existing) {
    throw new GithubConflictError('The file already exists.', [{ field: 'path', message: path }]);
  }

  const response = await call(
    () =>
      client.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch,
      }),
    context
  );

  logger.info('github.file.created', { ...context, commitSha: response.data.commit.sha });

  return serializer.serializeFileWrite({ owner, repo, branch, path, response: response.data });
}

async function updateFile({ owner, repo, branch, path, sha, content, message }, deps = {}) {
  const client = await resolveClient(deps);
  const context = { repository: `${owner}/${repo}`, branch, path };

  const existing = await getExistingFile(client, { owner, repo, path, branch });

  if (!existing) {
    throw new GithubNotFoundError('The file was not found.', [{ field: 'path', message: path }]);
  }

  if (existing.sha !== sha) {
    throw new GithubConflictError('The file has changed since it was read.', [
      { field: 'path', message: path },
      { field: 'sha', message: 'Does not match the current blob SHA.' },
    ]);
  }

  const response = await call(
    () =>
      client.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch,
        sha,
      }),
    context
  );

  logger.info('github.file.updated', { ...context, commitSha: response.data.commit.sha });

  return serializer.serializeFileWrite({ owner, repo, branch, path, response: response.data });
}

async function deleteFile({ owner, repo, branch, path, sha, message }, deps = {}) {
  const client = await resolveClient(deps);
  const context = { repository: `${owner}/${repo}`, branch, path };

  const existing = await getExistingFile(client, { owner, repo, path, branch });

  if (!existing) {
    throw new GithubNotFoundError('The file was not found.', [{ field: 'path', message: path }]);
  }

  if (existing.sha !== sha) {
    throw new GithubConflictError('The file has changed since it was read.', [
      { field: 'path', message: path },
      { field: 'sha', message: 'Does not match the current blob SHA.' },
    ]);
  }

  const response = await call(
    () => client.rest.repos.deleteFile({ owner, repo, path, message, sha, branch }),
    context
  );

  logger.info('github.file.deleted', { ...context, commitSha: response.data.commit.sha });

  return serializer.serializeFileDelete({ owner, repo, branch, path, response: response.data });
}

async function createPullRequest(
  { owner, repo, title, body, head, base, draft, maintainerCanModify },
  deps = {}
) {
  const client = await resolveClient(deps);
  const context = { repository: `${owner}/${repo}`, head, base };

  const response = await call(
    () =>
      client.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base,
        draft,
        maintainer_can_modify: maintainerCanModify,
      }),
    context
  );

  logger.info('github.pull_request.created', { ...context, number: response.data.number });

  return serializer.serializePullRequest({ owner, repo, pullRequest: response.data });
}

async function getPullRequest({ owner, repo, pullNumber }, deps = {}) {
  const client = await resolveClient(deps);

  const response = await call(
    () => client.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
    { repository: `${owner}/${repo}`, pullNumber }
  );

  return serializer.serializePullRequest({ owner, repo, pullRequest: response.data });
}

async function updatePullRequest({ owner, repo, pullNumber, changes }, deps = {}) {
  const client = await resolveClient(deps);
  const context = { repository: `${owner}/${repo}`, pullNumber };

  const payload = { owner, repo, pull_number: pullNumber };

  if (changes.title !== undefined) {
    payload.title = changes.title;
  }

  if (changes.body !== undefined) {
    payload.body = changes.body;
  }

  if (changes.state !== undefined) {
    payload.state = changes.state;
  }

  if (changes.base !== undefined) {
    payload.base = changes.base;
  }

  if (changes.maintainerCanModify !== undefined) {
    payload.maintainer_can_modify = changes.maintainerCanModify;
  }

  const response = await call(() => client.rest.pulls.update(payload), context);

  logger.info('github.pull_request.updated', { ...context, state: response.data.state });

  return serializer.serializePullRequest({ owner, repo, pullRequest: response.data });
}

/**
 * Merges a pull request under optimistic concurrency.
 *
 * The expected head SHA is checked locally *and* forwarded to GitHub, so the
 * merge is rejected if the branch moves between the check and the call. Branch
 * protection, required reviews, and required checks stay authoritative: no
 * bypass parameter is ever sent.
 */
async function mergePullRequest(
  { owner, repo, pullNumber, expectedHeadSha, mergeMethod, commitTitle, commitMessage },
  deps = {}
) {
  const client = await resolveClient(deps);
  const context = { repository: `${owner}/${repo}`, pullNumber };

  const current = await call(
    () => client.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
    context
  );

  const pullRequest = current.data;

  if (pullRequest.merged) {
    throw new GithubConflictError('The pull request is already merged.', [
      { field: 'pullNumber', message: String(pullNumber) },
    ]);
  }

  if (pullRequest.state !== 'open') {
    throw new GithubConflictError('The pull request is not open.', [
      { field: 'pullNumber', message: String(pullNumber) },
      { field: 'state', message: pullRequest.state },
    ]);
  }

  if (pullRequest.head.sha !== expectedHeadSha) {
    throw new GithubConflictError('The pull request head has moved since it was read.', [
      { field: 'expectedHeadSha', message: 'Does not match the current head SHA.' },
    ]);
  }

  const payload = {
    owner,
    repo,
    pull_number: pullNumber,
    sha: expectedHeadSha,
    merge_method: mergeMethod,
  };

  if (commitTitle !== undefined) {
    payload.commit_title = commitTitle;
  }

  if (commitMessage !== undefined) {
    payload.commit_message = commitMessage;
  }

  const response = await call(() => client.rest.pulls.merge(payload), context);

  logger.info('github.pull_request.merged', { ...context, sha: response.data.sha });

  return serializer.serializeMergeResult({
    owner,
    repo,
    number: pullNumber,
    response: response.data,
  });
}

module.exports = {
  listRepositories,
  getContent,
  listBranches,
  createBranch,
  updateBranch,
  createFile,
  updateFile,
  deleteFile,
  createPullRequest,
  getPullRequest,
  updatePullRequest,
  mergePullRequest,
};
