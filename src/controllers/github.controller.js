'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendResource, sendPagedCollection } = require('../utils/responses');
const githubService = require('../services/github.service');

/**
 * GitHub gateway controllers.
 *
 * Controllers stay thin by design: they read already-validated input, call one
 * service method, and emit the shared envelope. No Octokit call, policy check,
 * or serialization decision belongs here.
 */

const listRepositories = asyncHandler(async (req, res) => {
  const { data, meta } = await githubService.listRepositories(req.validated.query);

  sendPagedCollection(res, data, meta);
});

const getContent = asyncHandler(async (req, res) => {
  const content = await githubService.getContent(req.validated.query);

  sendResource(res, content);
});

const listBranches = asyncHandler(async (req, res) => {
  const { data, meta } = await githubService.listBranches(req.validated.query);

  sendPagedCollection(res, data, meta);
});

const createBranch = asyncHandler(async (req, res) => {
  const branch = await githubService.createBranch(req.validated.body);

  sendResource(res, branch, 201);
});

const updateBranch = asyncHandler(async (req, res) => {
  const branch = await githubService.updateBranch({
    ...req.validated.body,
    branch: req.validated.params.branch,
  });

  sendResource(res, branch);
});

const createFile = asyncHandler(async (req, res) => {
  const result = await githubService.createFile(req.validated.body);

  sendResource(res, result, 201);
});

const updateFile = asyncHandler(async (req, res) => {
  const result = await githubService.updateFile(req.validated.body);

  sendResource(res, result);
});

const deleteFile = asyncHandler(async (req, res) => {
  const result = await githubService.deleteFile(req.validated.body);

  sendResource(res, result);
});

const createPullRequest = asyncHandler(async (req, res) => {
  const pullRequest = await githubService.createPullRequest(req.validated.body);

  sendResource(res, pullRequest, 201);
});

const getPullRequest = asyncHandler(async (req, res) => {
  const pullRequest = await githubService.getPullRequest({
    ...req.validated.query,
    pullNumber: req.validated.params.pullNumber,
  });

  sendResource(res, pullRequest);
});

const updatePullRequest = asyncHandler(async (req, res) => {
  const pullRequest = await githubService.updatePullRequest({
    ...req.validated.body,
    pullNumber: req.validated.params.pullNumber,
  });

  sendResource(res, pullRequest);
});

const mergePullRequest = asyncHandler(async (req, res) => {
  const result = await githubService.mergePullRequest({
    ...req.validated.body,
    pullNumber: req.validated.params.pullNumber,
  });

  sendResource(res, result);
});

module.exports = {
  listRepositories,
  getContent,
  listBranches,
  createBranch,
  updateBranch,
  createFile,
  updateFile,
  deleteFile,
  createPullRequest,
  getPullRequest,
  updatePullRequest,
  mergePullRequest,
};
