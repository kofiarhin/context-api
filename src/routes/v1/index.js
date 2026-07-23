'use strict';

const { Router } = require('express');

const controller = require('../../controllers/context.controller');
const contextResolverController = require('../../controllers/contextResolver.controller');
const crudController = require('../../controllers/crud.controller');
const { validateQuery, validateParam, validateBody } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = Router();

router.get(
  '/context/resolve',
  validateQuery(schemas.validateContextResolverQuery),
  contextResolverController.resolveContext
);

router.post('/profile', validateBody('profile', 'create'), crudController.create('profile'));
router.get('/profile', validateQuery(schemas.validateProfileQuery), controller.getProfile);
router.patch('/profile', validateBody('profile', 'patch'), crudController.patch('profile'));
router.delete('/profile', crudController.remove('profile'));

function registerCollection({
  path,
  domainName,
  paramName,
  queryValidator,
  listHandler,
  getHandler,
}) {
  router.post(path, validateBody(domainName, 'create'), crudController.create(domainName));
  router.get(path, validateQuery(queryValidator), listHandler);
  router.get(`${path}/:${paramName}`, validateParam(paramName), getHandler);
  router.patch(
    `${path}/:${paramName}`,
    validateParam(paramName),
    validateBody(domainName, 'patch'),
    crudController.patch(domainName, paramName)
  );
  router.delete(
    `${path}/:${paramName}`,
    validateParam(paramName),
    crudController.remove(domainName, paramName)
  );
}

registerCollection({
  path: '/coding-conventions',
  domainName: 'codingConventions',
  paramName: 'key',
  queryValidator: schemas.validateCodingConventionQuery,
  listHandler: controller.listCodingConventions,
  getHandler: controller.getCodingConvention,
});

registerCollection({
  path: '/projects',
  domainName: 'projects',
  paramName: 'projectId',
  queryValidator: schemas.validateProjectQuery,
  listHandler: controller.listProjects,
  getHandler: controller.getProject,
});

registerCollection({
  path: '/tasks',
  domainName: 'tasks',
  paramName: 'taskId',
  queryValidator: schemas.validateTaskQuery,
  listHandler: controller.listTasks,
  getHandler: controller.getTask,
});

registerCollection({
  path: '/instruction-sets',
  domainName: 'instructionSets',
  paramName: 'key',
  queryValidator: schemas.validateInstructionSetQuery,
  listHandler: controller.listInstructionSets,
  getHandler: controller.getInstructionSet,
});

registerCollection({
  path: '/ideas-hub',
  domainName: 'ideasHub',
  paramName: 'section',
  queryValidator: schemas.validateIdeasHubQuery,
  listHandler: controller.listIdeasHubSections,
  getHandler: controller.getIdeasHubSection,
});

registerCollection({
  path: '/glossary',
  domainName: 'glossary',
  paramName: 'term',
  queryValidator: schemas.validateGlossaryQuery,
  listHandler: controller.listGlossaryEntries,
  getHandler: controller.getGlossaryEntry,
});

registerCollection({
  path: '/learnings',
  domainName: 'learnings',
  paramName: 'learningId',
  queryValidator: schemas.validateLearningQuery,
  listHandler: controller.listLearnings,
  getHandler: controller.getLearning,
});

module.exports = router;
