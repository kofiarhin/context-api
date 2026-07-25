'use strict';

const { AppError, ValidationError } = require('../../utils/errors');
const { APPROVAL_REQUIRED, CLASSIFICATIONS } = require('./zoroCatalogue');

const MIN_REASON_LENGTH = 8;
const APPROVER = 'Kofi';

/**
 * Approval fields the dispatcher understands.
 *
 * Closed on purpose: an unknown field is a typo (`approvedby`, `approver`) that
 * would otherwise pass validation while silently failing to authorise anything.
 */
const APPROVAL_FIELDS = new Set(['approvedBy', 'authority', 'reason', 'workKey']);
const CONFIRMATION_FIELDS = new Set(['confirmed', 'resourceType', 'resourceId', 'reason']);

function denied(message, details = []) {
  return new AppError('ZORO_OPERATION_FORBIDDEN', message, 403, details);
}

function isNonEmptyString(value, minLength = 1) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

/**
 * Requires explicit Kofi approval.
 *
 * Applied to merge, production-sensitive, security-sensitive, billing,
 * access-admin, and destructive operations. The evidence must name Kofi as the
 * approver, state the authority the approval rests on, and give a substantive
 * reason — a blank or one-word reason is treated as no approval at all, because
 * the audit trail is the point.
 */
function requireKofiApproval(approval, classification) {
  if (approval !== undefined && (!approval || typeof approval !== 'object' || Array.isArray(approval))) {
    throw new ValidationError('approval must be an object.');
  }

  if (approval) {
    for (const key of Object.keys(approval)) {
      if (!APPROVAL_FIELDS.has(key)) {
        throw new ValidationError(`Unknown approval field: ${key}.`);
      }
    }
  }

  if (!APPROVAL_REQUIRED.has(classification)) {
    return;
  }

  if (
    !approval ||
    approval.approvedBy !== APPROVER ||
    !isNonEmptyString(approval.authority) ||
    !isNonEmptyString(approval.reason, MIN_REASON_LENGTH)
  ) {
    throw denied(
      `Explicit ${APPROVER} approval evidence is required for ${classification} operations.`,
      [{ field: 'approval', message: 'approvedBy, authority, and reason are required.' }]
    );
  }
}

/**
 * Requires an exact, resource-naming confirmation for destructive operations.
 *
 * "Exact" means the caller must independently restate the resource type and
 * identifier it intends to destroy, and those must match what the request is
 * actually about. A generic `{ "confirmed": true }` is refused: the whole point
 * is to catch a request aimed at the wrong resource.
 */
function requireExactConfirmation(confirmation, expected) {
  if (
    confirmation !== undefined &&
    (!confirmation || typeof confirmation !== 'object' || Array.isArray(confirmation))
  ) {
    throw new ValidationError('confirmation must be an object.');
  }

  if (confirmation) {
    for (const key of Object.keys(confirmation)) {
      if (!CONFIRMATION_FIELDS.has(key)) {
        throw new ValidationError(`Unknown confirmation field: ${key}.`);
      }
    }
  }

  if (
    !confirmation ||
    confirmation.confirmed !== true ||
    !isNonEmptyString(confirmation.resourceType) ||
    !isNonEmptyString(String(confirmation.resourceId ?? '')) ||
    !isNonEmptyString(confirmation.reason, MIN_REASON_LENGTH)
  ) {
    throw denied('Exact destructive-operation confirmation is required.', [
      {
        field: 'confirmation',
        message: 'confirmed, resourceType, resourceId, and reason are required.',
      },
    ]);
  }

  if (expected.resourceType && confirmation.resourceType !== expected.resourceType) {
    throw denied('The confirmation resourceType does not match the requested resource.', [
      { field: 'confirmation.resourceType', message: `Expected "${expected.resourceType}".` },
    ]);
  }

  if (
    expected.resourceId !== undefined &&
    expected.resourceId !== null &&
    String(confirmation.resourceId) !== String(expected.resourceId)
  ) {
    throw denied('The confirmation resourceId does not match the requested resource.', [
      { field: 'confirmation.resourceId', message: 'Does not match the targeted resource.' },
    ]);
  }
}

/**
 * Requires an expected-state token for state-sensitive operations.
 *
 * A branch move, a file update or delete, and a merge all overwrite something
 * another actor may have changed since it was read. The catalogue names the
 * field carrying the expected SHA, ETag, or release; without it the request is
 * refused here rather than becoming a lost update upstream.
 */
function requireExpectedState(operation, parameters) {
  const field = operation.expectedState;

  if (!field) {
    return;
  }

  const value = parameters ? parameters[field] : undefined;

  if (!isNonEmptyString(String(value ?? ''))) {
    throw new ValidationError(
      `${field} is required for this operation so a concurrent change cannot be overwritten.`,
      [{ field, message: 'An expected SHA, ETag, or release identifier is required.' }]
    );
  }
}

/**
 * Derives what the confirmation must name, from the request itself.
 *
 * The expectation is computed from the actual target so the confirmation is
 * checked against the resource the call will really touch, not against a value
 * the caller also supplied in the confirmation block.
 */
function expectedConfirmation(operation, parameters = {}) {
  const resourceType = operation.confirmationResourceType || null;

  switch (operation.confirmationFrom) {
    case 'identifier':
      return { resourceType, resourceId: parameters.identifier ?? null };
    case 'path':
      return {
        resourceType,
        resourceId:
          parameters.owner && parameters.repo && parameters.path
            ? `${parameters.owner}/${parameters.repo}:${parameters.path}`
            : (parameters.path ?? null),
      };
    case 'vercelResource':
      return {
        resourceType,
        resourceId:
          parameters.project ??
          parameters.deployment ??
          parameters.variable ??
          parameters.domain ??
          parameters.alias ??
          parameters.record ??
          null,
      };
    case 'herokuResource':
      return {
        resourceType,
        resourceId: parameters.app ?? parameters.team ?? parameters.pipeline ?? null,
      };
    default:
      return { resourceType, resourceId: null };
  }
}

/**
 * Applies every dispatcher-level guard for one operation.
 *
 * Provider-side policy (GitHub workflow protection and content rules, Vercel
 * allowlists and destructive switch, Heroku allowlists, feature switches, and
 * Context API self-protection) is deliberately *not* reimplemented here. Those
 * checks run inside the services this dispatcher delegates to, and there is no
 * parameter on this path that can skip them.
 */
function enforce({ operation, parameters, approval, confirmation }) {
  requireKofiApproval(approval, operation.classification);
  requireExpectedState(operation, parameters);

  if (operation.classification === CLASSIFICATIONS.DESTRUCTIVE) {
    requireExactConfirmation(confirmation, expectedConfirmation(operation, parameters));
  }
}

module.exports = {
  enforce,
  requireKofiApproval,
  requireExactConfirmation,
  requireExpectedState,
  expectedConfirmation,
  denied,
  APPROVER,
  MIN_REASON_LENGTH,
  APPROVAL_FIELDS,
  CONFIRMATION_FIELDS,
};
