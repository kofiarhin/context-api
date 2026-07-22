'use strict';

const { GithubForbiddenError } = require('../utils/errors');

function parseAllowlist(raw) {
  if (!raw) {
    return null;
  }

  const repositories = String(raw)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return repositories.length > 0 ? new Set(repositories) : null;
}

/**
 * Optionally narrows the GitHub App installation scope without changing the
 * current all-repository default. Set GITHUB_REPOSITORY_ALLOWLIST to a
 * comma-separated owner/repository list to enable the restriction.
 *
 * Validation remains responsible for malformed or missing owner/repo values.
 * This middleware only makes an authorization decision when both values exist.
 */
function requireGithubRepositoryAccess(options = {}) {
  const allowlist = parseAllowlist(
    options.githubRepositoryAllowlist === undefined
      ? process.env.GITHUB_REPOSITORY_ALLOWLIST
      : options.githubRepositoryAllowlist
  );

  return function githubRepositoryAccess(req, res, next) {
    if (!allowlist) {
      next();
      return;
    }

    const owner = req.body?.owner ?? req.query?.owner;
    const repo = req.body?.repo ?? req.query?.repo;

    if (typeof owner !== 'string' || typeof repo !== 'string') {
      next();
      return;
    }

    const fullName = `${owner.trim()}/${repo.trim()}`.toLowerCase();

    if (!allowlist.has(fullName)) {
      next(
        new GithubForbiddenError('This repository is not permitted by the gateway policy.', [
          { field: 'repository', message: fullName },
        ])
      );
      return;
    }

    next();
  };
}

module.exports = requireGithubRepositoryAccess;
module.exports.parseAllowlist = parseAllowlist;
