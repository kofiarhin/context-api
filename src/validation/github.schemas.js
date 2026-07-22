'use strict';

const { ValidationError } = require('../utils/errors');
const policy = require('../services/githubPolicy');

/**
 * GitHub gateway request validation.
 *
 * These schemas are deliberately independent of the Mongoose-backed context
 * validators: nothing here touches a model, and every operation declares its
 * own allowlist so an unexpected field is a 400 rather than a value forwarded
 * to GitHub.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 100;
const MAX_PAGE = 10000;

function fail(details) {
  throw new ValidationError('Request validation failed.', details);
}

/**
 * Rejects fields outside the operation's allowlist.
 *
 * Unknown fields are reported together so a caller sees every mistake at once
 * rather than discovering them one request at a time.
 */
function assertKnownFields(source, allowed, kind) {
  const details = Object.keys(source)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ field: key, message: `Unknown ${kind} field.` }));

  if (details.length > 0) {
    fail(details);
  }
}

function requirePresent(source, fields) {
  const details = fields
    .filter((field) => source[field] === undefined || source[field] === '')
    .map((field) => ({ field, message: 'Value is required.' }));

  if (details.length > 0) {
    fail(details);
  }
}

function assertObjectBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    fail([{ field: 'body', message: 'Request body must be a JSON object.' }]);
  }

  return body;
}

function parseBoundedInteger(raw, field, { min, max, fallback }) {
  if (raw === undefined || raw === '') {
    return fallback;
  }

  if (!/^\d+$/.test(String(raw))) {
    fail([{ field, message: 'Value must be an integer.' }]);
  }

  const value = Number(raw);

  if (value < min || value > max) {
    fail([{ field, message: `Value must be between ${min} and ${max}.` }]);
  }

  return value;
}

function parseBoolean(raw, field, fallback) {
  if (raw === undefined) {
    return fallback;
  }

  if (typeof raw !== 'boolean') {
    fail([{ field, message: 'Value must be a boolean.' }]);
  }

  return raw;
}

function parsePagination(query) {
  return {
    page: parseBoundedInteger(query.page, 'page', {
      min: 1,
      max: MAX_PAGE,
      fallback: DEFAULT_PAGE,
    }),
    perPage: parseBoundedInteger(query.perPage, 'perPage', {
      min: 1,
      max: MAX_PER_PAGE,
      fallback: DEFAULT_PER_PAGE,
    }),
  };
}

function parseRepositoryTarget(source) {
  return {
    owner: policy.assertOwner(source.owner),
    repo: policy.assertRepositoryName(source.repo),
  };
}

const querySchemas = {
  listRepositories(query) {
    assertKnownFields(query, ['page', 'perPage'], 'query');

    return parsePagination(query);
  },

  getContent(query) {
    assertKnownFields(query, ['owner', 'repo', 'path', 'ref'], 'query');
    requirePresent(query, ['owner', 'repo']);

    const target = parseRepositoryTarget(query);
    const path =
      query.path === undefined
        ? ''
        : policy.normalizeRepositoryPath(query.path, 'path', { allowEmpty: true });

    return {
      ...target,
      path,
      ref: query.ref === undefined || query.ref === '' ? null : policy.assertRef(query.ref),
    };
  },

  listBranches(query) {
    assertKnownFields(query, ['owner', 'repo', 'page', 'perPage'], 'query');
    requirePresent(query, ['owner', 'repo']);

    return { ...parseRepositoryTarget(query), ...parsePagination(query) };
  },

  pullRequestRepository(query) {
    assertKnownFields(query, ['owner', 'repo'], 'query');
    requirePresent(query, ['owner', 'repo']);

    return parseRepositoryTarget(query);
  },
};

const bodySchemas = {
  createBranch(body) {
    assertObjectBody(body);
    assertKnownFields(body, ['owner', 'repo', 'branch', 'baseRef'], 'body');
    requirePresent(body, ['owner', 'repo', 'branch']);

    return {
      ...parseRepositoryTarget(body),
      branch: policy.assertBranchName(body.branch),
      baseRef:
        body.baseRef === undefined || body.baseRef === ''
          ? null
          : policy.assertRef(body.baseRef, 'baseRef'),
    };
  },

  updateBranch(body) {
    assertObjectBody(body);
    assertKnownFields(body, ['owner', 'repo', 'expectedCurrentSha', 'newSha'], 'body');
    requirePresent(body, ['owner', 'repo', 'expectedCurrentSha', 'newSha']);

    return {
      ...parseRepositoryTarget(body),
      expectedCurrentSha: policy.assertCommitSha(body.expectedCurrentSha, 'expectedCurrentSha'),
      newSha: policy.assertCommitSha(body.newSha, 'newSha'),
    };
  },

  createFile(body) {
    assertObjectBody(body);
    assertKnownFields(body, ['owner', 'repo', 'branch', 'path', 'content', 'message'], 'body');
    requirePresent(body, ['owner', 'repo', 'branch', 'path', 'message']);

    if (body.content === undefined) {
      fail([{ field: 'content', message: 'Value is required.' }]);
    }

    const path = policy.assertWritablePath(policy.normalizeRepositoryPath(body.path));

    return {
      ...parseRepositoryTarget(body),
      branch: policy.assertBranchName(body.branch),
      path,
      content: policy.assertContentSize(policy.assertTextContent(body.content)),
      message: policy.assertCommitMessage(body.message),
    };
  },

  updateFile(body) {
    assertObjectBody(body);
    assertKnownFields(
      body,
      ['owner', 'repo', 'branch', 'path', 'sha', 'content', 'message'],
      'body'
    );
    requirePresent(body, ['owner', 'repo', 'branch', 'path', 'sha', 'message']);

    if (body.content === undefined) {
      fail([{ field: 'content', message: 'Value is required.' }]);
    }

    const path = policy.assertWritablePath(policy.normalizeRepositoryPath(body.path));

    return {
      ...parseRepositoryTarget(body),
      branch: policy.assertBranchName(body.branch),
      path,
      sha: policy.assertBlobSha(body.sha),
      content: policy.assertContentSize(policy.assertTextContent(body.content)),
      message: policy.assertCommitMessage(body.message),
    };
  },

  deleteFile(body) {
    assertObjectBody(body);
    assertKnownFields(body, ['owner', 'repo', 'branch', 'path', 'sha', 'message'], 'body');
    requirePresent(body, ['owner', 'repo', 'branch', 'path', 'sha', 'message']);

    const path = policy.assertWritablePath(policy.normalizeRepositoryPath(body.path));

    return {
      ...parseRepositoryTarget(body),
      branch: policy.assertBranchName(body.branch),
      path,
      sha: policy.assertBlobSha(body.sha),
      message: policy.assertCommitMessage(body.message),
    };
  },

  createPullRequest(body) {
    assertObjectBody(body);
    assertKnownFields(
      body,
      ['owner', 'repo', 'title', 'body', 'head', 'base', 'draft', 'maintainerCanModify'],
      'body'
    );
    requirePresent(body, ['owner', 'repo', 'title', 'head', 'base']);

    return {
      ...parseRepositoryTarget(body),
      title: policy.assertPullRequestTitle(body.title),
      body: body.body === undefined ? '' : policy.assertPullRequestBody(body.body),
      head: policy.assertRef(body.head, 'head'),
      base: policy.assertRef(body.base, 'base'),
      // Draft by default: a pull request opened by an agent should not be
      // review-ready until a human has looked at it.
      draft: parseBoolean(body.draft, 'draft', true),
      maintainerCanModify: parseBoolean(body.maintainerCanModify, 'maintainerCanModify', true),
    };
  },

  updatePullRequest(body) {
    assertObjectBody(body);
    assertKnownFields(
      body,
      ['owner', 'repo', 'title', 'body', 'state', 'base', 'maintainerCanModify'],
      'body'
    );
    requirePresent(body, ['owner', 'repo']);

    const target = parseRepositoryTarget(body);
    const changes = {};

    if (body.title !== undefined) {
      changes.title = policy.assertPullRequestTitle(body.title);
    }

    if (body.body !== undefined) {
      changes.body = policy.assertPullRequestBody(body.body);
    }

    if (body.state !== undefined) {
      changes.state = policy.assertPullRequestState(body.state);
    }

    if (body.base !== undefined) {
      changes.base = policy.assertRef(body.base, 'base');
    }

    if (body.maintainerCanModify !== undefined) {
      changes.maintainerCanModify = parseBoolean(
        body.maintainerCanModify,
        'maintainerCanModify',
        true
      );
    }

    if (Object.keys(changes).length === 0) {
      fail([{ field: 'body', message: 'At least one mutable property is required.' }]);
    }

    return { ...target, changes };
  },

  mergePullRequest(body) {
    assertObjectBody(body);
    assertKnownFields(
      body,
      ['owner', 'repo', 'expectedHeadSha', 'mergeMethod', 'commitTitle', 'commitMessage'],
      'body'
    );
    // `mergeMethod` is deliberately required rather than defaulted: a merge is
    // irreversible, so the strategy must be an explicit caller decision.
    requirePresent(body, ['owner', 'repo', 'expectedHeadSha', 'mergeMethod']);

    return {
      ...parseRepositoryTarget(body),
      expectedHeadSha: policy.assertCommitSha(body.expectedHeadSha, 'expectedHeadSha'),
      mergeMethod: policy.assertMergeMethod(body.mergeMethod),
      commitTitle:
        body.commitTitle === undefined
          ? undefined
          : policy.assertPullRequestTitle(body.commitTitle, 'commitTitle'),
      commitMessage:
        body.commitMessage === undefined
          ? undefined
          : policy.assertPullRequestBody(body.commitMessage, 'commitMessage'),
    };
  },
};

const paramSchemas = {
  branch(value) {
    return policy.assertBranchName(value, 'branch');
  },

  pullNumber(value) {
    return policy.assertPullRequestNumber(value, 'pullNumber');
  },
};

module.exports = {
  querySchemas,
  bodySchemas,
  paramSchemas,
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
};
