'use strict';

/**
 * Response allowlist for DevOps log entries.
 *
 * Fields are mapped one by one, never spread, so a future internal column cannot
 * leak into an agent-visible response.
 */

function toIso(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value == null ? null : value;
}

function serializeReference(reference) {
  if (!reference) {
    return null;
  }

  return { type: reference.type, reference: reference.reference };
}

function serializeDevOpsLogEntry(doc) {
  return {
    entryId: doc.entryId,
    operationId: doc.operationId,
    operation: doc.operation ?? null,
    state: doc.state,
    summary: doc.summary,
    actor: doc.actor ?? null,
    projectId: doc.projectId ?? null,
    taskId: doc.taskId ?? null,
    correlationId: doc.correlationId ?? null,
    references: (Array.isArray(doc.references) ? doc.references : [])
      .map(serializeReference)
      .filter(Boolean),
    details: doc.details ?? null,
    occurredAt: toIso(doc.occurredAt),
    createdAt: toIso(doc.createdAt),
  };
}

module.exports = { serializeDevOpsLogEntry };
