'use strict';

const {
  AppError,
  GithubForbiddenError,
  GithubNotFoundError,
  GithubConflictError,
  GithubValidationError,
  GithubUnavailableError,
} = require('../utils/errors');

/**
 * Upstream GitHub error translation.
 *
 * This is the single boundary where Octokit failures become application errors.
 * Raw upstream bodies, request objects, headers, and stack traces are discarded
 * here rather than forwarded, because they can carry the installation token,
 * the signed app JWT, and authenticated URLs.
 */

// GitHub reports several distinct state conflicts as 422. These reasons mean
// "the repository moved underneath you", which is a 409 to the caller, not a
// malformed request.
const CONFLICT_REASONS = [
  'is at',
  'not a fast forward',
  'fast forward',
  'reference already exists',
  'already exists',
  'no commits between',
  'is out of date',
  'head branch was modified',
  'review cannot be requested',
  'pull request is not mergeable',
  'merge conflict',
];

function statusOf(error) {
  if (typeof error.status === 'number') {
    return error.status;
  }

  if (error.response && typeof error.response.status === 'number') {
    return error.response.status;
  }

  return null;
}

// GitHub's own credential formats. Personal access tokens, App user tokens,
// installation tokens, OAuth tokens, refresh tokens, and fine-grained PATs.
const GITHUB_CREDENTIAL = /\b(gh[pusor]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g;

/**
 * Extracts a short, non-sensitive reason from an upstream error.
 *
 * Only GitHub's own top-level message is considered, and it is length-capped.
 * Nested `errors[]` entries and response bodies are ignored because they can
 * echo submitted content.
 *
 * Anything token-shaped is redacted before the reason is returned. GitHub does
 * not normally echo a credential in a top-level message, but this is the one
 * upstream string the gateway does forward to a caller, and the cost of the
 * guarantee is a regex.
 */
function safeReason(error) {
  const message = typeof error.message === 'string' ? error.message : '';
  const firstLine = message.split('\n')[0].trim();

  if (!firstLine || firstLine.length > 200) {
    return null;
  }

  // Octokit appends the request URL to some messages; drop anything after it so
  // an authenticated URL cannot ride along.
  const withoutUrl = firstLine.split(' - http')[0].trim();

  return withoutUrl.replace(GITHUB_CREDENTIAL, '[REDACTED]') || null;
}

function looksLikeConflict(error) {
  const reason = (safeReason(error) || '').toLowerCase();

  return CONFLICT_REASONS.some((candidate) => reason.includes(candidate));
}

/**
 * Translates an upstream failure into the application error hierarchy.
 *
 * `context` supplies safe identifiers already known to the caller (repository,
 * branch, path, pull-request number) so the response can stay useful without
 * quoting anything GitHub returned.
 */
function translateGithubError(error, context = {}) {
  // Policy and validation errors raised before the upstream call already carry
  // the correct status and must pass through untouched.
  if (error instanceof AppError) {
    return error;
  }

  const status = statusOf(error);
  const reason = safeReason(error);
  const details = [];

  for (const [field, value] of Object.entries(context)) {
    if (value !== undefined && value !== null && value !== '') {
      details.push({ field, message: String(value) });
    }
  }

  if (reason) {
    details.push({ field: 'githubReason', message: reason });
  }

  switch (status) {
    case 401:
      // A 401 here is the *server's* GitHub credential failing, never the
      // caller's bearer token, so it must not be reported as an auth challenge.
      return new GithubUnavailableError('GitHub rejected the gateway credentials.', details);
    case 403:
      return new GithubForbiddenError('GitHub denied the operation.', details);
    case 404:
      return new GithubNotFoundError('The requested GitHub resource was not found.', details);
    case 409:
      return new GithubConflictError(
        'The GitHub operation conflicts with the current repository state.',
        details
      );
    case 422:
      return looksLikeConflict(error)
        ? new GithubConflictError(
            'The GitHub operation conflicts with the current repository state.',
            details
          )
        : new GithubValidationError('GitHub rejected the request as invalid.', details);
    case 429:
      return new GithubUnavailableError('GitHub rate limited the gateway.', details);
    default:
      break;
  }

  if (status !== null && status >= 500 && status <= 599) {
    return new GithubUnavailableError('GitHub is currently unavailable.', details);
  }

  return new GithubUnavailableError('GitHub returned an unexpected response.', details);
}

module.exports = { translateGithubError, safeReason };
