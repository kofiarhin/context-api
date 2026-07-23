'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendResource, sendPagedCollection } = require('../utils/responses');
const vercelService = require('../services/vercel.service');

function input(req) {
  return {
    ...((req.validated || {}).query || {}),
    ...((req.validated || {}).body || {}),
    ...((req.validated || {}).params || {}),
  };
}

function resource(method, status = 200) {
  return asyncHandler(async (req, res) => {
    const result = await vercelService[method](input(req));
    sendResource(res, result, status);
  });
}

function collection(method) {
  return asyncHandler(async (req, res) => {
    const result = await vercelService[method](input(req));
    sendPagedCollection(res, result.data, result.meta || {});
  });
}

module.exports = {
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
