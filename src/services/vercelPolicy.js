'use strict';

const { ValidationError, VercelForbiddenError } = require('../utils/errors');

function normalizeList(values = []) {
  return new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean));
}

function assertAllowed(value, allowlist, label) {
  if (!value || !allowlist || allowlist.size === 0) return;
  if (!allowlist.has(String(value).trim().toLowerCase())) {
    throw new VercelForbiddenError(`${label} is not allowed by gateway policy.`);
  }
}

function requireProductionApproval(approval, resource) {
  if (
    !approval ||
    approval.confirmed !== true ||
    approval.scope !== 'production' ||
    typeof approval.reason !== 'string' ||
    approval.reason.trim().length < 8
  ) {
    throw new VercelForbiddenError(
      `Explicit production approval is required${resource ? ` for ${resource}` : ''}.`
    );
  }
}

function requireDestructiveConfirmation(env, confirmation, expected) {
  if (!env.vercelAllowDestructiveOperations) {
    throw new VercelForbiddenError('Destructive Vercel operations are disabled.');
  }

  if (
    !confirmation ||
    confirmation.confirmed !== true ||
    confirmation.resourceType !== expected.resourceType ||
    String(confirmation.resourceId || '') !== String(expected.resourceId || '') ||
    typeof confirmation.reason !== 'string' ||
    confirmation.reason.trim().length < 8
  ) {
    throw new VercelForbiddenError('Exact destructive-operation confirmation is required.');
  }

  if (expected.expectedName && confirmation.expectedName !== expected.expectedName) {
    throw new VercelForbiddenError('The destructive confirmation does not match resource state.');
  }
}

function assertEnvironmentValueInput(input) {
  if (!input || typeof input.value !== 'string' || input.value.length === 0) {
    throw new ValidationError('Environment variable value is required.');
  }
}

function createPolicy(env) {
  const projectAllowlist = normalizeList(env.vercelProjectAllowlist);
  const domainAllowlist = normalizeList(env.vercelDomainAllowlist);
  const repositoryAllowlist = normalizeList(env.vercelRepositoryAllowlist);

  return Object.freeze({
    assertProjectAllowed(project) {
      assertAllowed(project, projectAllowlist, 'Project');
    },
    assertDomainAllowed(domain) {
      assertAllowed(domain, domainAllowlist, 'Domain');
    },
    assertRepositoryAllowed(repository) {
      assertAllowed(repository, repositoryAllowlist, 'Repository');
    },
    requireProductionApproval,
    requireDestructiveConfirmation(confirmation, expected) {
      requireDestructiveConfirmation(env, confirmation, expected);
    },
    assertEnvironmentValueInput,
  });
}

module.exports = {
  createPolicy,
  normalizeList,
  requireProductionApproval,
  requireDestructiveConfirmation,
};
