'use strict';

require('../githubRepository.patch');

const vercelDispatcher = require('../vercelDispatcher');
const herokuRoutes = require('../heroku/herokuRoutes');

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

function buildVercelOperations(category) {
  const baseClassification =
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
        baseClassification === CLASSIFICATIONS.WRITE && /^(promote|rollback)/.test(name)
          ? CLASSIFICATIONS.PRODUCTION_SENSITIVE
          : baseClassification,
      ...(category === 'destructive'
        ? { confirmationResourceType: 'vercel-resource', confirmationFrom: 'vercelResource' }
        : {}),
    };
  }

  return Object.freeze(operations);
}

function buildHerokuOperations() {
  const operations = {};
  for (const descriptor of herokuRoutes) {
    const classification =
      HEROKU_CLASSIFICATION[descriptor.classification] || CLASSIFICATIONS.PRODUCTION_SENSITIVE;
    operations[descriptor.operationId] = {
      target: 'heroku',
      method: 'execute',
      descriptor,
      classification,
      ...(classification === CLASSIFICATIONS.DESTRUCTIVE
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
    summary: 'Archive an engineering context record.',
    requiresDatabase: true,
    operations: ENGINEERING_ARCHIVE_OPERATIONS,
  },
  'github.read': {
    summary: 'Read repositories, contents, branches, and pull requests.',
    requiresDatabase: false,
    operations: GITHUB_READ_OPERATIONS,
  },
  'github.write': {
    summary: 'Create repositories and create or update branches, files, and pull requests.',
    requiresDatabase: false,
    operations: GITHUB_WRITE_OPERATIONS,
  },
  'github.review': {
    summary: 'Review, update, and merge pull requests.',
    requiresDatabase: false,
    operations: GITHUB_REVIEW_OPERATIONS,
  },
  'github.destructive': {
    summary: 'Delete repository files under exact confirmation.',
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
    summary: 'Delete Vercel resources under exact confirmation.',
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
  return Object.prototype.hasOwnProperty.call(DISPATCHERS, operationId)
    ? DISPATCHERS[operationId]
    : null;
}

function getOperation(dispatcher, name) {
  return dispatcher && Object.prototype.hasOwnProperty.call(dispatcher.operations, name)
    ? dispatcher.operations[name]
    : null;
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
