'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendCollection, sendResource } = require('../utils/responses');
const { ResourceNotFoundError } = require('../utils/errors');
const serializers = require('../serializers');

const profileService = require('../services/profile.service');
const codingConventionService = require('../services/codingConvention.service');
const projectService = require('../services/project.service');
const instructionSetService = require('../services/instructionSet.service');
const ideasHubService = require('../services/ideasHub.service');
const glossaryService = require('../services/glossary.service');
const learningService = require('../services/learning.service');
const taskService = require('../services/task.service');

/**
 * Builds a collection handler from a service lister and explicit serializers.
 *
 * Offset reads preserve the original detail representation unless `view=summary`
 * is requested. Cursor reads default to summary projections and omit total counts
 * unless `includeTotal=true` is supplied.
 */
function createListHandler(list, detailSerializer, summarySerializer = detailSerializer) {
  return asyncHandler(async (req, res) => {
    const { filters, pagination } = req.validated;
    const result = await list(filters, pagination);
    const serializer = pagination.view === 'summary' ? summarySerializer : detailSerializer;
    const mode = result.mode || pagination.mode;
    const responsePagination =
      mode === 'cursor'
        ? {
            mode,
            limit: result.limit || pagination.limit,
            hasNextPage: Boolean(result.hasNextPage),
            nextCursor: result.nextCursor || null,
            total: result.total,
          }
        : {
            mode: 'offset',
            total: result.total,
            page: result.page || pagination.page,
            pageSize: result.pageSize || pagination.pageSize,
          };

    sendCollection(res, result.items.map(serializer), responsePagination);
  });
}

function createResourceHandler(paramName, get, serializer, describe) {
  return asyncHandler(async (req, res) => {
    const identifier = req.validated.params[paramName];
    const record = await get(identifier);

    if (!record) {
      throw new ResourceNotFoundError(`${describe} "${identifier}" was not found.`);
    }

    sendResource(res, serializer(record));
  });
}

const getProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getActiveProfile();

  if (!profile) {
    throw new ResourceNotFoundError('No active profile was found.');
  }

  sendResource(res, serializers.serializeProfile(profile));
});

module.exports = {
  getProfile,

  listCodingConventions: createListHandler(
    codingConventionService.listCodingConventions,
    serializers.serializeCodingConvention,
    serializers.serializeCodingConventionSummary
  ),
  getCodingConvention: createResourceHandler(
    'key',
    codingConventionService.getCodingConventionByKey,
    serializers.serializeCodingConvention,
    'Coding convention'
  ),

  listProjects: createListHandler(
    projectService.listProjects,
    serializers.serializeProject,
    serializers.serializeProjectSummary
  ),
  getProject: createResourceHandler(
    'projectId',
    projectService.getProjectById,
    serializers.serializeProject,
    'Project'
  ),

  listInstructionSets: createListHandler(
    instructionSetService.listInstructionSets,
    serializers.serializeInstructionSet,
    serializers.serializeInstructionSetSummary
  ),
  getInstructionSet: createResourceHandler(
    'key',
    instructionSetService.getInstructionSetByKey,
    serializers.serializeInstructionSet,
    'Instruction set'
  ),

  listIdeasHubSections: createListHandler(
    ideasHubService.listIdeasHubSections,
    serializers.serializeIdeasHubContext,
    serializers.serializeIdeasHubContextSummary
  ),
  getIdeasHubSection: createResourceHandler(
    'section',
    ideasHubService.getIdeasHubSection,
    serializers.serializeIdeasHubContext,
    'Ideas Hub section'
  ),

  listGlossaryEntries: createListHandler(
    glossaryService.listGlossaryEntries,
    serializers.serializeGlossaryEntry,
    serializers.serializeGlossaryEntrySummary
  ),
  getGlossaryEntry: createResourceHandler(
    'term',
    glossaryService.getGlossaryEntryByTerm,
    serializers.serializeGlossaryEntry,
    'Glossary term'
  ),

  listLearnings: createListHandler(
    learningService.listLearnings,
    serializers.serializeLearning,
    serializers.serializeLearningSummary
  ),
  getLearning: createResourceHandler(
    'learningId',
    learningService.getLearningById,
    serializers.serializeLearning,
    'Learning'
  ),

  listTasks: createListHandler(
    taskService.listTasks,
    serializers.serializeTask,
    serializers.serializeTaskSummary
  ),
  getTask: createResourceHandler('taskId', taskService.getTaskById, serializers.serializeTask, 'Task'),
};
