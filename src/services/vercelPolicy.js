'use strict';

const { getVercelConfig, parseBranch } = require('../config/vercel');
const { ValidationError, VercelConflictError, VercelForbiddenError } = require('../utils/errors');

// The gateway's own deployment vocabulary. `preview` is deliberately not part of
// Vercel's create-deployment contract — see `normalizeDeploymentTarget`.
const DEPLOYMENT_TARGETS = ['preview', 'production'];

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

/**
 * Resolves the deployment target the caller asked for (SPEC §13.1).
 *
 * The returned value is the gateway's vocabulary, not Vercel's. `POST
 * /v13/deployments` accepts only `production` (and `staging`) and rejects the
 * literal `preview`: upstream, a Preview deployment is one that omits `target`
 * altogether. Callers keep saying `preview` because that is the contract Zoro is
 * published against; the service performs the translation.
 */
function normalizeDeploymentTarget(target) {
  if (target === undefined || target === null || target === '') return 'preview';
  if (typeof target !== 'string') throw new ValidationError('target must be a string.');

  const value = target.trim().toLowerCase();
  if (!DEPLOYMENT_TARGETS.includes(value)) {
    throw new ValidationError(`target must be one of: ${DEPLOYMENT_TARGETS.join(', ')}.`);
  }

  return value;
}

/**
 * Every field of a create-deployment body that can name a Git branch. All of them
 * are checked, because refusing only `gitSource.ref` would leave the production
 * branch reachable through commit metadata.
 */
function deploymentBranches(body = {}) {
  const candidates = [
    body.gitSource && body.gitSource.ref,
    body.gitSource && body.gitSource.branch,
    body.gitMetadata && body.gitMetadata.commitRef,
    body.meta && body.meta.githubCommitRef,
    body.branch,
  ];

  return [...new Set(candidates.map((value) => parseBranch(value)).filter(Boolean))];
}

/**
 * Requires a Git-connected Preview deployment to name the branch it deploys.
 *
 * Omitting the ref does not mean "no branch": it lets Vercel choose, and Vercel
 * chooses the project's production branch, producing exactly the Production
 * deployment a Preview request must never create. Refusing here also makes the
 * production-branch check meaningful, because an unnamed branch cannot be
 * compared against anything.
 *
 * File uploads and redeploys of an existing deployment name no Git source and are
 * deliberately unaffected.
 */
function assertPreviewBranchNamed(body = {}, branches = []) {
  if (branches.length > 0) return;
  if (!body.gitSource && !body.gitMetadata) return;

  throw new ValidationError(
    'A Preview deployment from a Git source must name the branch to deploy, for example gitSource.ref. Vercel would otherwise deploy the production branch.'
  );
}

/**
 * Refuses a Preview deployment of the production branch.
 *
 * Vercel treats a deployment of the production branch as a Production deployment
 * regardless of the requested target, so allowing it would turn an unapproved
 * Preview request into a production release. Comparison is case-insensitive: a
 * differently cased branch name is never a legitimate way to reach Preview.
 *
 * A `null` production branch means the gateway could not determine one, and this
 * check cannot fire — `assertPreviewDeploymentResult` is the backstop.
 */
function assertPreviewBranchAllowed(branches = [], productionBranch) {
  const production = parseBranch(productionBranch);
  if (!production) return;

  const matched = branches.find(
    (branch) => String(branch).toLowerCase() === production.toLowerCase()
  );

  if (matched) {
    throw new VercelForbiddenError(
      `A Preview deployment must not use the production branch "${production}". Deploy another branch, or request target "production" with explicit production approval.`
    );
  }
}

/**
 * Rejects an upstream deployment that came back as Production for a Preview
 * request.
 *
 * The branch guard cannot cover every route into Production — project settings,
 * custom environments, and upstream contract changes can all promote a request
 * the gateway believed was a Preview — so the result is verified rather than
 * assumed. The deployment identifier is surfaced so the caller can cancel or
 * delete it deliberately; the gateway does not silently issue that write itself.
 */
function assertPreviewDeploymentResult(payload = {}) {
  const target = typeof payload.target === 'string' ? payload.target.trim().toLowerCase() : null;
  if (target !== 'production' && payload.production !== true) return;

  const deployment = payload.uid || payload.id || null;

  throw new VercelConflictError(
    'Vercel returned a Production deployment for a Preview request, which the gateway never received production approval for.',
    [
      {
        field: 'target',
        message: `The upstream deployment target is "${target || 'production'}".`,
      },
      ...(deployment
        ? [
            {
              field: 'deployment',
              message: `Cancel or delete deployment ${deployment} before retrying.`,
            },
          ]
        : []),
    ]
  );
}

function assertEnvironmentValueInput(input) {
  if (!input || typeof input.value !== 'string' || input.value.length === 0) {
    throw new ValidationError('Environment variable value is required.');
  }
}

function createPolicy(baseEnv = {}, options = {}) {
  const env = getVercelConfig(baseEnv, options.source || process.env);
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
    normalizeDeploymentTarget,
    deploymentBranches,
    assertPreviewBranchNamed,
    assertPreviewBranchAllowed,
    assertPreviewDeploymentResult,
    configuredProductionBranch() {
      return env.vercelProductionBranch || null;
    },
  });
}

module.exports = {
  createPolicy,
  normalizeList,
  requireProductionApproval,
  requireDestructiveConfirmation,
  normalizeDeploymentTarget,
  deploymentBranches,
  assertPreviewBranchNamed,
  assertPreviewBranchAllowed,
  assertPreviewDeploymentResult,
  DEPLOYMENT_TARGETS,
};
