'use strict';

const vercelDispatcher = require('../vercelDispatcher');
const herokuRoutes = require('../heroku/herokuRoutes');

/**
 * The explicit operation catalogue behind the unified Zoro engineering Action.
 *
 * Two rules govern everything in this file:
 *
 * 1. **No generic proxy.** There is no method/path passthrough. A caller names a
 *    dispatcher and an operation from a closed list; anything else is a 404.
 *    Nothing here accepts an arbitrary URL, HTTP verb, or upstream path.
 * 2. **No re-entrant HTTP.** Each entry names a target service module and a
 *    method on it. The dispatcher calls that function in-process. The Context
 *    API never issues an HTTP request back into itself.
 *
 * Provider allowlists, self-protection, and content policy are *not* duplicated
 * here — they stay in `githubPolicy`, `vercelPolicy`, and `herokuPolicy`, which
 * the delegated services already enforce. This catalogue adds only the
 * dispatcher-level classification that drives approval and confirmation.
 */

/**
 * Operation classifications.
 *
 * `read` and `write` proceed on the bearer key alone. Everything else requires
 * explicit Kofi approval, and `destructive` additionally requires an exact
 * confirmation naming the resource.
 */
const CLASSIFICATIONS = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  MERGE: 'merge',
  PRODUCTION_SENSITIVE: 'production-sensitive',
  SECURITY_SENSITIVE: 'security-sensitive',
  BILLING: 'billing',
  ACCESS_ADMIN: 'access-admin',
  DESTRUCTIVE: 'destructive',
});

const APPROVAL_REQUIRED = Object.freeze(
  new Set([
    CLASSIFICATIONS.MERGE,
    CLASSIFICATIONS.PRODUCTION_SENSITIVE,
    CLASSIFICATIONS.SECURITY_SENSITIVE,
    CLASSIFICATIONS.BILLING,
    CLASSIFICATIONS.ACCESS_ADMIN,
    CLASSIFICATIONS.DESTRUCTIVE,
  ])
);

/**
 * Maps a Heroku route classification onto a dispatcher classification.
 *
 * `herokuRoutes` already labels every upstream operation; reusing those labels
 * keeps one source of truth rather than re-deriving risk per operation here.
 */
const HEROKU_CLASSIFICATION = Object.freeze({
  read: CLASSIFICATIONS.READ,
  'normal-write': CLASSIFICATIONS.WRITE,
  'production-sensitive': CLASSIFICATIONS.PRODUCTION_SENSITIVE,
  'security-sensitive': CLASSIFICATIONS.SECURITY_SENSITIVE,
  'billing-sensitive': CLASSIFICATIONS.BILLING,
  'access-admin': CLASSIFICATIONS.ACCESS_ADMIN,
  'private-space-admin': CLASSIFICATIONS.ACCESS_ADMIN,
  destructive: CLASSIFICATIONS.DESTRUCTIVE,
});

function contextRead(method) {
  return { target: 'contextRead', method, classification: CLASSIFICATIONS.READ };
}

function contextWrite(domain, action) {
  return {
    target: 'contextWrite',
    method: action,
    domain,
    classification: action === 'archive' ? CLASSIFICATIONS.DESTRUCTIVE : CLASSIFICATIONS.WRITE,
    ...(action === 'archive'
      ? { confirmationResourceType: domain, confirmationFrom: 'identifier' }
      : {}),
  };
}

/**
 * Context read operations.
 *
 * Each entry names a lister or single-resource getter already used by the direct
 * `/api/v1/*` routes, so the dispatcher returns the same shapes the direct
 * routes do.
 */
const ENGINEERING_READ_OPERATIONS = Object.freeze({
  getProfile: contextRead('getProfile'),
  listProjects: contextRead('listProjects'),
  getProject: contextRead('getProject'),
  listTasks: contextRead('listTasks'),
  getTask: contextRead('getTask'),
  listCodingConventions: contextRead('listCodingConventions'),
  getCodingConvention: contextRead('getCodingConvention'),
  listInstructionSets: contextRead('listInstructionSets'),
  getInstructionSet: contextRead('getInstructionSet'),
  listIdeasHubSections: contextRead('listIdeasHubSections'),
  getIdeasHubSection: contextRead('getIdeasHubSection'),
  listGlossaryEntries: contextRead('listGlossaryEntries'),
  getGlossaryEntry: contextRead('getGlossaryEntry'),
  listLearnings: contextRead('listLearnings'),
  getLearning: contextRead('getLearning'),
});

const WRITABLE_DOMAINS = Object.freeze([
  ['Profile', 'profile'],
  ['Project', 'projects'],
  ['Task', 'tasks'],
  ['CodingConvention', 'codingConventions'],
  ['InstructionSet', 'instructionSets'],
  ['IdeasHubSection', 'ideasHub'],
  ['GlossaryEntry', 'glossary'],
  ['Learning', 'learnings'],
]);

function buildDomainOperations(action) {
  const operations = {};

  for (const [suffix, domain] of WRITABLE_DOMAINS) {
    operations[`${action}${suffix}`] = contextWrite(domain, action);
  }

  return Object.freeze(operations);
}

const ENGINEERING_WRITE_OPERATIONS = Object.freeze({
  ...buildDomainOperations('create'),
  ...buildDomainOperations('update'),
});

const ENGINEERING_ARCHIVE_OPERATIONS = buildDomainOperations('archive');

const GITHUB_READ_OPERATIONS = Object.freeze({
  listRepositories: {
    target: 'github',
    method: 'listRepositories',
    collection: true,
    classification: CLASSIFICATIONS.READ,
  },
  getContent: { target: 'github', method: 'getContent', classification: CLASSIFICATIONS.READ },
  listBranches: {
    target: 'github',
    method: 'listBranches',
    collection: true,
    classification: CLASSIFICATIONS.READ,
  },
  getPullRequest: {
    target: 'github',
    method: 'getPullRequest',
    classification: CLASSIFICATIONS.READ,
  },
});

const GITHUB_WRITE_OPERATIONS = Object.freeze({
  // Classified security-sensitive rather than write: it is the only operation
  // that uses the account-level user token instead of the App installation, and
  // it creates a persistent account-level resource. In restricted mode that
  // keeps it behind explicit Kofi approval; Full Operator mode stands that
  // approval down, but never the owner allowlist or the enabled switch.
  createRepository: {
    target: 'github',
    method: 'createRepository',
    status: 201,
    classification: CLASSIFICATIONS.SECURITY_SENSITIVE,
  },
  createBranch: {
    target: 'github',
    method: 'createBranch',
    status: 201,
    classification: CLASSIFICATIONS.WRITE,
  },
  // Moving a branch pointer is state-sensitive: without the expected current
  // SHA a concurrent push would be silently overwritten.
  updateBranch: {
    target: 'github',
    method: 'updateBranch',
    classification: CLASSIFICATIONS.WRITE,
    expectedState: 'expectedCurrentSha',
  },
  createFile: {
    target: 'github',
    method: 'createFile',
    status: 201,
    classification: CLASSIFICATIONS.WRITE,
  },
  updateFile: {
    target: 'github',
    method: 'updateFile',
    classification: CLASSIFICATIONS.WRITE,
    expectedState: 'sha',
  },
  createPullRequest: {
    target: 'github',
    method: 'createPullRequest',
    status: 201,
    classification: CLASSIFICATIONS.WRITE,
  },
  updatePullRequest: {
    target: 'github',
    method: 'updatePullRequest',
    classification: CLASSIFICATIONS.WRITE,
  },
});

const GITHUB_REVIEW_OPERATIONS = Object.freeze({
  getPullRequest: {
    target: 'github',
    method: 'getPullRequest',
    classification: CLASSIFICATIONS.READ,
  },
  updatePullRequest: {
    target: 'github',
    method: 'updatePullRequest',
    classification: CLASSIFICATIONS.WRITE,
  },
  // Merging is the one review action that changes a protected branch, so it
  // carries both Kofi approval and an expected head SHA.
  mergePullRequest: {
    target: 'github',
    method: 'mergePullRequest',
    classification: CLASSIFICATIONS.MERGE,
    expectedState: 'expectedHeadSha',
  },
});

const GITHUB_DESTRUCTIVE_OPERATIONS = Object.freeze({
  deleteFile: {
    target: 'github',
    method: 'deleteFile',
    classification: CLASSIFICATIONS.DESTRUCTIVE,
    expectedState: 'sha',
    confirmationResourceType: 'file',
    confirmationFrom: 'path',
  },
});

/**
 * Reuses the existing Vercel dispatcher catalogue verbatim.
 *
 * The Vercel gateway already publishes a closed read/write/destructive
 * catalogue. Re-listing those operations here would create a second list to keep
 * in sync, so the unified dispatcher derives its Vercel surface from the same
 * frozen object the direct `/api/v1/vercel/{read,write,destructive}` routes use.
 */
function buildVercelOperations(category) {
  const classification =
    category === 'read'
      ? CLASSIFICATIONS.READ
      : category === 'destructive'
        ? CLASSIFICATIONS.DESTRUCTIVE
        : CLASSIFICATIONS.WRITE;

  const operations = {};

  for (const name of Object.keys(vercelDispatcher.CATALOG[category])) {
    operations[name] = {
      target: 'vercel',
      category,
      method: name,
      classification:
        classification === CLASSIFICATIONS.WRITE && /^(promote|rollback)/.test(name)
          ? CLASSIFICATIONS.PRODUCTION_SENSITIVE
          : classification,
      ...(category === 'destructive'
        ? { confirmationResourceType: 'vercel-resource', confirmationFrom: 'vercelResource' }
        : {}),
    };
  }

  return Object.freeze(operations);
}

/**
 * Derives the Heroku surface from the existing route descriptors.
 *
 * `heroku.execute` is a single dispatcher covering every Heroku operation
 * because `heroku.service.execute` is already descriptor-driven and
 * `herokuPolicy.enforce` already applies per-classification switches, allowlists,
 * and Context API self-protection.
 */
function buildHerokuOperations() {
  const operations = {};

  for (const descriptor of herokuRoutes) {
    operations[descriptor.operationId] = {
      target: 'heroku',
      method: 'execute',
      descriptor,
      classification:
        HEROKU_CLASSIFICATION[descriptor.classification] || CLASSIFICATIONS.PRODUCTION_SENSITIVE,
      ...(HEROKU_CLASSIFICATION[descriptor.classification] === CLASSIFICATIONS.DESTRUCTIVE
        ? { confirmationResourceType: 'heroku-resource', confirmationFrom: 'herokuResource' }
        : {}),
    };
  }

  return Object.freeze(operations);
}

const OPSLOG_READ_OPERATIONS = Object.freeze({
  listOperationsLog: {
    target: 'opslog',
    method: 'listEntries',
    collection: true,
    classification: CLASSIFICATIONS.READ,
  },
  getOperationsLogEntry: {
    target: 'opslog',
    method: 'getEntryById',
    classification: CLASSIFICATIONS.READ,
  },
});

const OPSLOG_WRITE_OPERATIONS = Object.freeze({
  appendOperationsLogEntry: {
    target: 'opslog',
    method: 'appendEntry',
    status: 201,
    classification: CLASSIFICATIONS.WRITE,
  },
});

/**
 * The fifteen dispatcher ids exposed by the unified Action.
 *
 * `requiresDatabase` marks the dispatchers backed by MongoDB. The unified route
 * is mounted ahead of the global database guard — like the provider gateways —
 * so a Mongo outage cannot take GitHub, Vercel, or Heroku work offline; the
 * database-backed dispatchers assert availability individually instead.
 */
const DISPATCHERS = Object.freeze({
  'health.check': {
    summary: 'Report Context API and database availability.',
    requiresDatabase: false,
    defaultOperation: 'check',
    operations: Object.freeze({
      check: { target: 'health', method: 'check', classification: CLASSIFICATIONS.READ },
    }),
  },
  'context.resolve': {
    summary: 'Resolve a bounded context package for one client, project, or task.',
    requiresDatabase: true,
    defaultOperation: 'resolve',
    operations: Object.freeze({
      resolve: {
        target: 'contextResolver',
        method: 'resolve',
        classification: CLASSIFICATIONS.READ,
      },
    }),
  },
  'engineering.read': {
    summary: 'Read structured engineering context records.',
    requiresDatabase: true,
    operations: ENGINEERING_READ_OPERATIONS,
  },
  'engineering.write': {
    summary: 'Create or update structured engineering context records.',
    requiresDatabase: true,
    operations: ENGINEERING_WRITE_OPERATIONS,
  },
  'engineering.archive': {
    summary: 'Archive an engineering context record (soft delete).',
    requiresDatabase: true,
    operations: ENGINEERING_ARCHIVE_OPERATIONS,
  },
  'github.read': {
    summary: 'Read repositories, contents, branches, and pull requests.',
    requiresDatabase: false,
    operations: GITHUB_READ_OPERATIONS,
  },
  'github.write': {
    summary: 'Create or update branches, files, and pull requests.',
    requiresDatabase: false,
    operations: GITHUB_WRITE_OPERATIONS,
  },
  'github.review': {
    summary: 'Review, update, and merge pull requests.',
    requiresDatabase: false,
    operations: GITHUB_REVIEW_OPERATIONS,
  },
  'github.destructive': {
    summary: 'Delete repository files under explicit approval and confirmation.',
    requiresDatabase: false,
    operations: GITHUB_DESTRUCTIVE_OPERATIONS,
  },
  'vercel.read': {
    summary: 'Read Vercel projects, deployments, environment variables, and domains.',
    requiresDatabase: false,
    operations: buildVercelOperations('read'),
  },
  'vercel.write': {
    summary: 'Create or update Vercel projects, deployments, and configuration.',
    requiresDatabase: false,
    operations: buildVercelOperations('write'),
  },
  'vercel.destructive': {
    summary: 'Delete Vercel resources under explicit approval and confirmation.',
    requiresDatabase: false,
    operations: buildVercelOperations('destructive'),
  },
  'heroku.execute': {
    summary: 'Execute an allowlisted Heroku Platform API operation.',
    requiresDatabase: false,
    operations: buildHerokuOperations(),
  },
  'opslog.read': {
    summary: 'Read the append-only DevOps operations log.',
    requiresDatabase: true,
    operations: OPSLOG_READ_OPERATIONS,
  },
  'opslog.write': {
    summary: 'Append one entry to the DevOps operations log.',
    requiresDatabase: true,
    operations: OPSLOG_WRITE_OPERATIONS,
  },
});

const DISPATCHER_IDS = Object.freeze(Object.keys(DISPATCHERS));

function getDispatcher(operationId) {
  if (!Object.prototype.hasOwnProperty.call(DISPATCHERS, operationId)) {
    return null;
  }

  return DISPATCHERS[operationId];
}

function getOperation(dispatcher, name) {
  if (!dispatcher || !Object.prototype.hasOwnProperty.call(dispatcher.operations, name)) {
    return null;
  }

  return dispatcher.operations[name];
}

module.exports = {
  DISPATCHERS,
  DISPATCHER_IDS,
  CLASSIFICATIONS,
  APPROVAL_REQUIRED,
  HEROKU_CLASSIFICATION,
  WRITABLE_DOMAINS,
  getDispatcher,
  getOperation,
};
