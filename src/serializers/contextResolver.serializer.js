'use strict';

const serializers = require('./index');

/**
 * Builds the resolved-context response body.
 *
 * This lives outside the controller because two callers need byte-identical
 * output: the direct `GET /api/v1/context/resolve` route and the unified
 * dispatcher's `context.resolve` operation. Duplicating the shape would let the
 * two drift, and the dispatcher is explicitly forbidden from re-entering the app
 * over HTTP to reuse the controller.
 */
function sourceReference(type, identifier, source) {
  return {
    type,
    identifier,
    source: serializers.serializeSource(source),
  };
}

function serializeResolvedContext(resolved) {
  const profile = resolved.profile ? serializers.serializeProfileSummary(resolved.profile) : null;
  const project = resolved.project ? serializers.serializeProjectSummary(resolved.project) : null;
  const task = resolved.task ? serializers.serializeTaskSummary(resolved.task) : null;
  const instructionSets = resolved.instructionSets.map(serializers.serializeInstructionSetSummary);
  const codingConventions = resolved.codingConventions.map(
    serializers.serializeCodingConventionSummary
  );

  const references = [
    profile && sourceReference('profile', profile.key, resolved.profile.source),
    project && sourceReference('project', project.projectId, resolved.project.source),
    task && sourceReference('task', task.taskId, resolved.task.source),
    ...resolved.instructionSets.map((entry) =>
      sourceReference('instruction-set', entry.key, entry.source)
    ),
    ...resolved.codingConventions.map((entry) =>
      sourceReference('coding-convention', entry.key, entry.source)
    ),
  ].filter(Boolean);

  return {
    resolvedFor: resolved.resolvedFor,
    revision: resolved.revision,
    profile,
    project,
    task,
    instructionSets,
    codingConventions,
    references,
  };
}

module.exports = { serializeResolvedContext, sourceReference };
