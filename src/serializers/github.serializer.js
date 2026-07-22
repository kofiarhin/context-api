'use strict';

/**
 * GitHub response allowlists.
 *
 * Upstream payloads are mapped field by field and never spread. Octokit returns
 * a great deal more than these shapes — installation metadata, clone URLs
 * carrying credentials, raw permission objects, and request context — so an
 * explicit allowlist is the boundary that keeps all of it out of responses.
 */

function nullable(value) {
  return value === undefined ? null : value;
}

/**
 * Reduces GitHub's permission object to the two capabilities this gateway uses.
 *
 * The raw object also advertises admin, maintain, and push flags, which would
 * misrepresent what the Action can actually do.
 */
function serializePermissions(permissions = {}) {
  return {
    contents: permissions.push ? 'write' : 'read',
    pullRequests: permissions.push ? 'write' : 'read',
  };
}

function serializeRepository(repository) {
  return {
    owner: repository.owner ? repository.owner.login : null,
    name: repository.name,
    fullName: repository.full_name,
    private: Boolean(repository.private),
    archived: Boolean(repository.archived),
    defaultBranch: nullable(repository.default_branch),
    htmlUrl: nullable(repository.html_url),
    permissions: serializePermissions(repository.permissions),
  };
}

/**
 * Maps a GitHub contents entry type onto the gateway's vocabulary.
 *
 * Symlinks and submodules are surfaced under their own type rather than being
 * flattened into `file`, so a caller cannot mistake them for editable text.
 */
function serializeEntryType(type) {
  if (type === 'dir') {
    return 'directory';
  }

  return type;
}

function serializeDirectoryEntry(entry) {
  return {
    type: serializeEntryType(entry.type),
    name: entry.name,
    path: entry.path,
    sha: nullable(entry.sha),
    size: typeof entry.size === 'number' ? entry.size : null,
    htmlUrl: nullable(entry.html_url),
  };
}

function serializeFileContent({ owner, repo, ref, entry, content }) {
  return {
    type: serializeEntryType(entry.type),
    owner,
    repo,
    path: entry.path,
    ref,
    sha: nullable(entry.sha),
    size: typeof entry.size === 'number' ? entry.size : null,
    encoding: 'utf-8',
    content,
    htmlUrl: nullable(entry.html_url),
  };
}

function serializeDirectoryContent({ owner, repo, ref, path, entries }) {
  return {
    type: 'directory',
    owner,
    repo,
    path,
    ref,
    entries: entries.map(serializeDirectoryEntry),
  };
}

function serializeBranch(branch) {
  return {
    name: branch.name,
    sha: branch.commit ? branch.commit.sha : null,
    protected: Boolean(branch.protected),
  };
}

function serializeBranchList({ owner, repo, defaultBranch, branches }) {
  return {
    owner,
    repo,
    defaultBranch,
    branches: branches.map(serializeBranch),
  };
}

function serializeBranchRef({ owner, repo, branch, sha, baseRef = null, htmlUrl = null }) {
  const serialized = {
    owner,
    repo,
    branch,
    sha,
    htmlUrl,
  };

  if (baseRef !== null) {
    serialized.baseRef = baseRef;
  }

  return serialized;
}

function serializeFileWrite({ owner, repo, branch, path, response }) {
  const content = response.content || {};
  const commit = response.commit || {};

  return {
    owner,
    repo,
    branch,
    path,
    contentSha: nullable(content.sha),
    commitSha: nullable(commit.sha),
    commitUrl: nullable(commit.html_url),
  };
}

function serializeFileDelete({ owner, repo, branch, path, response }) {
  const commit = response.commit || {};

  return {
    owner,
    repo,
    branch,
    path,
    deleted: true,
    commitSha: nullable(commit.sha),
    commitUrl: nullable(commit.html_url),
  };
}

/**
 * Serializes a pull request.
 *
 * `mergeable` is preserved exactly as GitHub reports it, including `null` while
 * mergeability is still being computed. Collapsing that unknown state into a
 * boolean would invite a caller to merge on a guess.
 */
function serializePullRequest({ owner, repo, pullRequest }) {
  return {
    owner,
    repo,
    number: pullRequest.number,
    title: nullable(pullRequest.title),
    body: pullRequest.body ?? null,
    state: nullable(pullRequest.state),
    draft: Boolean(pullRequest.draft),
    merged: Boolean(pullRequest.merged),
    mergeable: pullRequest.mergeable === undefined ? null : pullRequest.mergeable,
    mergeableState: nullable(pullRequest.mergeable_state),
    head: {
      ref: pullRequest.head ? pullRequest.head.ref : null,
      sha: pullRequest.head ? pullRequest.head.sha : null,
    },
    base: {
      ref: pullRequest.base ? pullRequest.base.ref : null,
      sha: pullRequest.base ? pullRequest.base.sha : null,
    },
    htmlUrl: nullable(pullRequest.html_url),
  };
}

function serializeMergeResult({ owner, repo, number, response }) {
  return {
    owner,
    repo,
    number,
    merged: Boolean(response.merged),
    sha: nullable(response.sha),
    message: nullable(response.message),
  };
}

module.exports = {
  serializeRepository,
  serializeDirectoryEntry,
  serializeFileContent,
  serializeDirectoryContent,
  serializeBranch,
  serializeBranchList,
  serializeBranchRef,
  serializeFileWrite,
  serializeFileDelete,
  serializePullRequest,
  serializeMergeResult,
};
