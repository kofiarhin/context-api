'use strict';

const {
  ValidationError,
  GithubForbiddenError,
  UnsupportedContentError,
} = require('../utils/errors');

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,99}$/;
const REPOSITORY = /^[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/i;

const MAX_BRANCH_LENGTH = 255;
const MAX_PATH_LENGTH = 1024;
const MAX_CONTENT_LENGTH = 250000;
const MAX_COMMIT_MESSAGE_LENGTH = 250;
const MAX_PULL_REQUEST_TITLE_LENGTH = 250;
const MAX_PULL_REQUEST_BODY_LENGTH = 65536;
const MAX_PULL_REQUEST_NUMBER = 1000000000;

const MERGE_METHODS = ['merge', 'squash', 'rebase'];
const PULL_REQUEST_STATES = ['open', 'closed'];

// Anything at or beneath this prefix is denied outright. Workflow files are
// executable CI configuration, so write access to them would be equivalent to
// arbitrary code execution under the repository's own credentials.
const DENIED_PATH_PREFIX = '.github/workflows';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS_EXCEPT_NEWLINE = /[\x00-\x09\x0b-\x1f\x7f]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const NULL_BYTE = '\x00';

function fail(field, message) {
  throw new ValidationError('Request validation failed.', [{ field, message }]);
}

function requireString(value, field) {
  if (typeof value !== 'string') {
    fail(field, 'Value must be a string.');
  }

  return value;
}

function assertOwner(value, field = 'owner') {
  const owner = requireString(value, field).trim();

  if (!OWNER.test(owner)) {
    fail(field, 'Value is not a valid GitHub owner login.');
  }

  return owner;
}

function assertRepositoryName(value, field = 'repo') {
  const repo = requireString(value, field).trim();

  if (!REPOSITORY.test(repo) || repo === '.' || repo === '..') {
    fail(field, 'Value is not a valid GitHub repository name.');
  }

  return repo;
}

/**
 * Validates a Git ref against the rules Git itself enforces.
 *
 * Refs are interpolated into upstream API paths, so a ref containing a control
 * character, a space, or `..` is rejected here rather than being encoded and
 * forwarded to GitHub.
 */
function assertRef(value, field = 'ref') {
  const ref = requireString(value, field);

  if (ref.length < 1 || ref.length > MAX_BRANCH_LENGTH) {
    fail(field, `Value must be between 1 and ${MAX_BRANCH_LENGTH} characters.`);
  }

  if (CONTROL_CHARACTERS.test(ref) || /[ ~^:?*[\\]/.test(ref)) {
    fail(field, 'Value contains characters that are not valid in a Git ref.');
  }

  if (
    ref.includes('..') ||
    ref.includes('@{') ||
    ref.includes('//') ||
    ref.startsWith('/') ||
    ref.startsWith('-') ||
    ref.endsWith('/') ||
    ref.endsWith('.') ||
    ref.endsWith('.lock') ||
    ref === '@'
  ) {
    fail(field, 'Value is not a well-formed Git ref.');
  }

  return ref;
}

function assertBranchName(value, field = 'branch') {
  return assertRef(value, field);
}

function assertCommitSha(value, field) {
  const sha = requireString(value, field).trim();

  if (!SHA.test(sha)) {
    fail(field, 'Value must be a 40-character hexadecimal SHA.');
  }

  return sha;
}

/**
 * Validates a blob SHA.
 *
 * GitHub blob identifiers share the 40-character SHA-1 format used for commits.
 * This stays a separate function so error details name the right field and so
 * the two concepts can diverge if GitHub adopts SHA-256 object names.
 */
function assertBlobSha(value, field = 'sha') {
  return assertCommitSha(value, field);
}

/**
 * Normalizes a repository-relative path.
 *
 * Normalization is deliberately conservative: it collapses redundant separators
 * but refuses any path containing a `.` or `..` segment instead of resolving
 * it, so a normalized path can never address a different logical location than
 * the caller supplied.
 */
function normalizeRepositoryPath(value, field = 'path', { allowEmpty = false } = {}) {
  const raw = requireString(value, field);

  if (raw.includes(NULL_BYTE) || CONTROL_CHARACTERS.test(raw)) {
    fail(field, 'Value must not contain control characters.');
  }

  if (raw.includes('\\')) {
    fail(field, 'Value must use forward slashes as separators.');
  }

  const trimmed = raw.trim();

  if (trimmed === '') {
    if (allowEmpty) {
      return '';
    }

    fail(field, 'Value is required.');
  }

  if (trimmed.startsWith('/')) {
    fail(field, 'Value must be a relative repository path.');
  }

  if (trimmed.length > MAX_PATH_LENGTH) {
    fail(field, `Value must not exceed ${MAX_PATH_LENGTH} characters.`);
  }

  const segments = trimmed.split('/').filter((segment) => segment !== '');

  if (segments.length === 0) {
    if (allowEmpty) {
      return '';
    }

    fail(field, 'Value is required.');
  }

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      fail(field, 'Value must not contain path traversal segments.');
    }
  }

  return segments.join('/');
}

/**
 * Denies writes at or beneath `.github/workflows`.
 *
 * Matching is case-insensitive because GitHub resolves the directory
 * case-insensitively, so `.GitHub/Workflows` must be blocked exactly like the
 * canonical spelling.
 */
function assertWritablePath(normalizedPath, field = 'path') {
  const comparable = normalizedPath.toLowerCase();

  if (comparable === DENIED_PATH_PREFIX || comparable.startsWith(`${DENIED_PATH_PREFIX}/`)) {
    throw new GithubForbiddenError('Writes beneath .github/workflows are not permitted.', [
      { field, message: 'This path is blocked by server policy.' },
    ]);
  }

  return normalizedPath;
}

/**
 * Enforces the UTF-8 text-only write policy.
 *
 * A null byte or an unpaired surrogate cannot survive a UTF-8 round trip, so
 * either one is treated as the signal that a caller supplied binary data.
 * Binary writes are out of scope for this gateway.
 */
function assertTextContent(value, field = 'content') {
  const content = requireString(value, field);

  if (content.includes(NULL_BYTE)) {
    throw new UnsupportedContentError('Binary content is not supported.', [
      { field, message: 'Value must be UTF-8 text.' },
    ]);
  }

  if (LONE_SURROGATE.test(content)) {
    throw new UnsupportedContentError('Content is not valid UTF-8 text.', [
      { field, message: 'Value must be UTF-8 text.' },
    ]);
  }

  return content;
}

function assertContentSize(content, field = 'content') {
  if (content.length > MAX_CONTENT_LENGTH) {
    fail(field, `Value must not exceed ${MAX_CONTENT_LENGTH} characters.`);
  }

  return content;
}

/**
 * Validates a commit message.
 *
 * Line breaks are permitted after the subject line so callers can supply a
 * conventional body, but the subject itself stays single-line.
 */
function assertCommitMessage(value, field = 'message') {
  const message = requireString(value, field).trim();

  if (message.length < 1 || message.length > MAX_COMMIT_MESSAGE_LENGTH) {
    fail(field, `Value must be between 1 and ${MAX_COMMIT_MESSAGE_LENGTH} characters.`);
  }

  if (CONTROL_CHARACTERS_EXCEPT_NEWLINE.test(message)) {
    fail(field, 'Value must not contain control characters.');
  }

  const [subject] = message.split('\n');

  if (subject.trim() === '') {
    fail(field, 'The first line must not be empty.');
  }

  return message;
}

function assertPullRequestTitle(value, field = 'title') {
  const title = requireString(value, field).trim();

  if (title.length < 1 || title.length > MAX_PULL_REQUEST_TITLE_LENGTH) {
    fail(field, `Value must be between 1 and ${MAX_PULL_REQUEST_TITLE_LENGTH} characters.`);
  }

  if (CONTROL_CHARACTERS.test(title)) {
    fail(field, 'Value must not contain control characters.');
  }

  return title;
}

function assertPullRequestBody(value, field = 'body') {
  const body = requireString(value, field);

  if (body.length > MAX_PULL_REQUEST_BODY_LENGTH) {
    fail(field, `Value must not exceed ${MAX_PULL_REQUEST_BODY_LENGTH} characters.`);
  }

  if (CONTROL_CHARACTERS_EXCEPT_NEWLINE.test(body)) {
    fail(field, 'Value must not contain control characters.');
  }

  return body;
}

function assertPullRequestNumber(value, field = 'pullNumber') {
  const raw = typeof value === 'number' ? String(value) : requireString(value, field).trim();

  if (!/^\d+$/.test(raw)) {
    fail(field, 'Value must be a positive integer.');
  }

  const number = Number(raw);

  if (number < 1 || number > MAX_PULL_REQUEST_NUMBER) {
    fail(field, 'Value must be a positive integer.');
  }

  return number;
}

function assertMergeMethod(value, field = 'mergeMethod') {
  const method = requireString(value, field).trim();

  if (!MERGE_METHODS.includes(method)) {
    fail(field, `Value must be one of: ${MERGE_METHODS.join(', ')}.`);
  }

  return method;
}

function assertPullRequestState(value, field = 'state') {
  const state = requireString(value, field).trim();

  if (!PULL_REQUEST_STATES.includes(state)) {
    fail(field, `Value must be one of: ${PULL_REQUEST_STATES.join(', ')}.`);
  }

  return state;
}

module.exports = {
  OWNER,
  REPOSITORY,
  SHA,
  MAX_BRANCH_LENGTH,
  MAX_PATH_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_COMMIT_MESSAGE_LENGTH,
  MAX_PULL_REQUEST_TITLE_LENGTH,
  MAX_PULL_REQUEST_BODY_LENGTH,
  MERGE_METHODS,
  PULL_REQUEST_STATES,
  DENIED_PATH_PREFIX,
  assertOwner,
  assertRepositoryName,
  assertRef,
  assertBranchName,
  assertCommitSha,
  assertBlobSha,
  normalizeRepositoryPath,
  assertWritablePath,
  assertTextContent,
  assertContentSize,
  assertCommitMessage,
  assertPullRequestTitle,
  assertPullRequestBody,
  assertPullRequestNumber,
  assertMergeMethod,
  assertPullRequestState,
};
