'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendResource } = require('../utils/responses');
const serializers = require('../serializers');
const contextResolverService = require('../services/contextResolver.service');

function sourceReference(type, identifier, source) {
  return {
    type,
    identifier,
    source: serializers.serializeSource(source),
  };
}

const resolveContext = asyncHandler(async (req, res) => {
  const resolved = await contextResolverService.resolveContext(req.validated.filters);
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

  sendResource(res, {
    resolvedFor: resolved.resolvedFor,
    revision: resolved.revision,
    profile,
    project,
    task,
    instructionSets,
    codingConventions,
    references,
  });
});

module.exports = { resolveContext };
