'use strict';

const { Router } = require('express');

const controller = require('../../controllers/context.controller');
const { validateQuery, validateParam } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = Router();

router.get('/profile', validateQuery(schemas.validateProfileQuery), controller.getProfile);

router.get(
  '/coding-conventions',
  validateQuery(schemas.validateCodingConventionQuery),
  controller.listCodingConventions
);
router.get('/coding-conventions/:key', validateParam('key'), controller.getCodingConvention);

router.get('/projects', validateQuery(schemas.validateProjectQuery), controller.listProjects);
router.get('/projects/:projectId', validateParam('projectId'), controller.getProject);

router.get(
  '/instruction-sets',
  validateQuery(schemas.validateInstructionSetQuery),
  controller.listInstructionSets
);
router.get('/instruction-sets/:key', validateParam('key'), controller.getInstructionSet);

router.get('/ideas-hub', validateQuery(schemas.validateIdeasHubQuery), controller.listIdeasHubSections);
router.get('/ideas-hub/:section', validateParam('section'), controller.getIdeasHubSection);

router.get('/glossary', validateQuery(schemas.validateGlossaryQuery), controller.listGlossaryEntries);
router.get('/glossary/:term', validateParam('term'), controller.getGlossaryEntry);

router.get('/learnings', validateQuery(schemas.validateLearningQuery), controller.listLearnings);
router.get('/learnings/:learningId', validateParam('learningId'), controller.getLearning);

router.get('/tasks', validateQuery(schemas.validateTaskQuery), controller.listTasks);
router.get('/tasks/:taskId', validateParam('taskId'), controller.getTask);

module.exports = router;
