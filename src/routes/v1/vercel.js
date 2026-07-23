'use strict';

const { Router } = require('express');
const controller = require('../../controllers/vercel.controller');
const { validateVercelQuery, validateVercelBody, validateVercelParams } = require('../../middleware/validateVercel');
const { RouteNotFoundError } = require('../../utils/errors');

const router = Router();

router.get('/user', controller.getUser);
router.get('/teams', validateVercelQuery, controller.listTeams);
router.get('/teams/:teamId', validateVercelParams, controller.getTeam);

router.get('/projects', validateVercelQuery, controller.listProjects);
router.post('/projects', validateVercelBody, controller.createProject);
router.get('/projects/:project', validateVercelParams, controller.getProject);
router.patch('/projects/:project', validateVercelParams, validateVercelBody, controller.updateProject);
router.delete('/projects/:project', validateVercelParams, validateVercelBody, controller.deleteProject);
router.post('/projects/:project/pause', validateVercelParams, validateVercelBody, controller.pauseProject);
router.post('/projects/:project/unpause', validateVercelParams, validateVercelBody, controller.unpauseProject);
router.post('/projects/:project/rollback', validateVercelParams, validateVercelBody, controller.rollbackProject);

router.get('/deployments', validateVercelQuery, controller.listDeployments);
router.post('/deployments', validateVercelBody, controller.createDeployment);
router.get('/deployments/:deployment', validateVercelParams, controller.getDeployment);
router.patch('/deployments/:deployment/cancel', validateVercelParams, controller.cancelDeployment);
router.delete('/deployments/:deployment', validateVercelParams, validateVercelBody, controller.deleteDeployment);
router.get('/deployments/:deployment/events', validateVercelParams, validateVercelQuery, controller.getDeploymentEvents);
router.get('/deployments/:deployment/files', validateVercelParams, controller.listDeploymentFiles);
router.post('/deployments/:deployment/promote', validateVercelParams, validateVercelBody, controller.promoteDeployment);

router.get('/projects/:project/environment-variables', validateVercelParams, validateVercelQuery, controller.listEnvironmentVariables);
router.post('/projects/:project/environment-variables', validateVercelParams, validateVercelBody, controller.createEnvironmentVariable);
router.patch('/projects/:project/environment-variables/:variable', validateVercelParams, validateVercelBody, controller.updateEnvironmentVariable);
router.delete('/projects/:project/environment-variables/:variable', validateVercelParams, validateVercelBody, controller.deleteEnvironmentVariable);

router.get('/projects/:project/domains', validateVercelParams, controller.listProjectDomains);
router.post('/projects/:project/domains', validateVercelParams, validateVercelBody, controller.addProjectDomain);
router.get('/projects/:project/domains/:domain', validateVercelParams, controller.getProjectDomain);
router.post('/projects/:project/domains/:domain/verify', validateVercelParams, validateVercelBody, controller.verifyProjectDomain);
router.delete('/projects/:project/domains/:domain', validateVercelParams, validateVercelBody, controller.removeProjectDomain);

router.get('/aliases', validateVercelQuery, controller.listAliases);
router.post('/deployments/:deployment/aliases', validateVercelParams, validateVercelBody, controller.assignAlias);
router.delete('/aliases/:alias', validateVercelParams, validateVercelBody, controller.deleteAlias);

router.get('/domains/:domain/config', validateVercelParams, controller.getDomainConfig);
router.get('/domains/:domain/dns', validateVercelParams, validateVercelQuery, controller.listDnsRecords);
router.post('/domains/:domain/dns', validateVercelParams, validateVercelBody, controller.createDnsRecord);
router.patch('/domains/:domain/dns/:record', validateVercelParams, validateVercelBody, controller.updateDnsRecord);
router.delete('/domains/:domain/dns/:record', validateVercelParams, validateVercelBody, controller.deleteDnsRecord);

router.use((req, res, next) => next(new RouteNotFoundError()));

module.exports = router;
