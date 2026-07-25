'use strict';

const { AppError, ValidationError } = require('../../utils/errors');
const { getZoroEngineeringConfig } = require('../../config/zoroEngineering');
const { APPROVAL_REQUIRED, CLASSIFICATIONS } = require('./zoroCatalogue');

const MIN_REASON_LENGTH = 8;
const APPROVER = 'Kofi';
const APPROVAL_FIELDS = new Set(['approvedBy', 'authority', 'reason', 'workKey']);
const CONFIRMATION_FIELDS = new Set(['confirmed', 'resourceType', 'resourceId', 'reason']);
const FULL_OPERATOR_AUTO_ALLOWED = new Set([
  CLASSIFICATIONS.WRITE,
  CLASSIFICATIONS.MERGE,
  CLASSIFICATIONS.PRODUCTION_SENSITIVE,
  CLASSIFICATIONS.SECURITY_SENSITIVE,
  CLASSIFICATIONS.BILLING,
  CLASSIFICATIONS.ACCESS_ADMIN,
]);

function denied(message, details = []) {
  return new AppError('ZORO_OPERATION_FORBIDDEN', message, 403, details);
}

function isNonEmptyString(value, minLength = 1) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function validateApprovalShape(approval) {
  if (approval !== undefined && (!approval || typeof approval !== 'object' || Array.isArray(approval))) {
    throw new ValidationError('approval must be an object.');
  }
  if (approval) {
    for (const key of Object.keys(approval)) {
      if (!APPROVAL_FIELDS.has(key)) throw new ValidationError(`Unknown approval field: ${key}.`);
    }
  }
}

function requireKofiApproval(approval, classification, options = {}) {
  validateApprovalShape(approval);

  if (options.fullOperatorMode && FULL_OPERATOR_AUTO_ALLOWED.has(classification)) return;
  if (!APPROVAL_REQUIRED.has(classification)) return;

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
    throw denied('Exact destructive-operation confirmation is required.');
  }

  if (expected.resourceType && confirmation.resourceType !== expected.resourceType) {
    throw denied('The confirmation resourceType does not match the requested resource.');
  }
  if (
    expected.resourceId !== undefined &&
    expected.resourceId !== null &&
    String(confirmation.resourceId) !== String(expected.resourceId)
  ) {
    throw denied('The confirmation resourceId does not match the requested resource.');
  }
}

function requireExpectedState(operation, parameters) {
  const field = operation.expectedState;
  if (!field) return;
  const value = parameters ? parameters[field] : undefined;
  if (!isNonEmptyString(String(value ?? ''))) {
    throw new ValidationError(
      `${field} is required for this operation so a concurrent change cannot be overwritten.`,
      [{ field, message: 'An expected SHA, ETag, or release identifier is required.' }]
    );
  }
}

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

function enforce({ operation, parameters, approval, confirmation, source = process.env }) {
  const config = getZoroEngineeringConfig(source);
  requireKofiApproval(approval, operation.classification, {
    fullOperatorMode: config.fullOperatorMode,
  });
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
  FULL_OPERATOR_AUTO_ALLOWED,
};
