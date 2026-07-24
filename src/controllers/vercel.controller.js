'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendResource, sendPagedCollection } = require('../utils/responses');
const vercelService = require('../services/vercel.service');
const vercelLogsService = require('../services/vercelLogs.service');
const vercelDispatcher = require('../services/vercelDispatcher');

function input(req) {
  return {
    ...((req.validated || {}).query || {}),
    ...((req.validated || {}).body || {}),
    ...((req.validated || {}).params || {}),
  };
}

function resource(method, status = 200, service = vercelService) {
  return asyncHandler(async (req, res) => {
    const result = await service[method](input(req));
    sendResource(res, result, status);
  });
}

function collection(method, service = vercelService) {
  return asyncHandler(async (req, res) => {
    const result = await service[method](input(req));
    sendPagedCollection(res, result.data, result.meta || {});
  });
}

function dispatch(category) {
  return asyncHandler(async (req, res) => {
    const outcome = await vercelDispatcher.dispatch(category, input(req));
    sendResource(res, outcome.result, outcome.status);
  });
}

module.exports = {
  dispatchRead: dispatch('read'),
  dispatchWrite: dispatch('write'),
  dispatchDestructive: dispatch('destructive'),
  getUser: resource('getUser'),
  listTeams: collection('listTeams'),
  getTeam: resource('getTeam'),
  listProjects: collection('listProjects'),
  getProject: resource('getProject'),
  createProject: resource('createProject', 201),
  updateProject: resource('updateProject'),
  deleteProject: resource('deleteProject'),
  pauseProject: resource('pauseProject'),
  unpauseProject: resource('unpauseProject'),
  listDeployments: collection('listDeployments'),
  getDeployment: resource('getDeployment'),
  createDeployment: resource('createDeployment', 201),
  cancelDeployment: resource('cancelDeployment'),
  deleteDeployment: resource('deleteDeployment'),
  getDeploymentEvents: collection('getDeploymentEvents'),
  getDeploymentLogs: collection('getDeploymentLogs', vercelLogsService),
  listDeploymentFiles: collection('listDeploymentFiles'),
  promoteDeployment: resource('promoteDeployment'),
  rollbackProject: resource('rollbackProject'),
  listEnvironmentVariables: collection('listEnvironmentVariables'),
  createEnvironmentVariable: resource('createEnvironmentVariable', 201),
  updateEnvironmentVariable: resource('updateEnvironmentVariable'),
  deleteEnvironmentVariable: resource('deleteEnvironmentVariable'),
  listProjectDomains: collection('listProjectDomains'),
  getProjectDomain: resource('getProjectDomain'),
  addProjectDomain: resource('addProjectDomain', 201),
  verifyProjectDomain: resource('verifyProjectDomain'),
  removeProjectDomain: resource('removeProjectDomain'),
  listAliases: collection('listAliases'),
  assignAlias: resource('assignAlias', 201),
  deleteAlias: resource('deleteAlias'),
  getDomainConfig: resource('getDomainConfig'),
  listDnsRecords: collection('listDnsRecords'),
  createDnsRecord: resource('createDnsRecord', 201),
  updateDnsRecord: resource('updateDnsRecord'),
  deleteDnsRecord: resource('deleteDnsRecord'),
};
