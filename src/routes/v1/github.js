'use strict';

const { Router } = require('express');

const controller = require('../../controllers/github.controller');
const {
  validateGithubQuery,
  validateGithubBody,
  validateGithubDeleteFile,
  validateGithubParam,
} = require('../../middleware/validateGithub');
const { RouteNotFoundError } = require('../../utils/errors');

const router = Router();

router.get('/repositories', validateGithubQuery('listRepositories'), controller.listRepositories);
router.get('/contents', validateGithubQuery('getContent'), controller.getContent);

router.get('/branches', validateGithubQuery('listBranches'), controller.listBranches);
router.post('/branches', validateGithubBody('createBranch'), controller.createBranch);
router.patch(
  '/branches/:branch',
  validateGithubParam('branch'),
  validateGithubBody('updateBranch'),
  controller.updateBranch
);

router.post('/files', validateGithubBody('createFile'), controller.createFile);
router.patch('/files', validateGithubBody('updateFile'), controller.updateFile);
router.delete('/files', validateGithubDeleteFile, controller.deleteFile);

router.post(
  '/pull-requests',
  validateGithubBody('createPullRequest'),
  controller.createPullRequest
);
router.get(
  '/pull-requests/:pullNumber',
  validateGithubParam('pullNumber'),
  validateGithubQuery('pullRequestRepository'),
  controller.getPullRequest
);
router.patch(
  '/pull-requests/:pullNumber',
  validateGithubParam('pullNumber'),
  validateGithubBody('updatePullRequest'),
  controller.updatePullRequest
);
router.post(
  '/pull-requests/:pullNumber/merge',
  validateGithubParam('pullNumber'),
  validateGithubBody('mergePullRequest'),
  controller.mergePullRequest
);

/**
 * Terminates the GitHub namespace.
 *
 * Without this, an unmatched `/api/v1/github/*` path would fall through to the
 * context router and hit the MongoDB availability guard, so an unknown GitHub
 * route could report DATABASE_UNAVAILABLE instead of a 404.
 */
router.use((req, res, next) => {
  next(new RouteNotFoundError());
});

module.exports = router;
