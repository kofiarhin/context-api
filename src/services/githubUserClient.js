'use strict';

const { getZoroEngineeringConfig } = require('../config/zoroEngineering');
const { GithubUnavailableError } = require('../utils/errors');

let octokitModulePromise = null;
let userClientPromise = null;

function loadOctokit() {
  if (!octokitModulePromise) octokitModulePromise = import('octokit');
  return octokitModulePromise;
}

async function getUserClient(options = {}) {
  const config = options.config || getZoroEngineeringConfig(options.source || process.env);

  if (!config.githubUserAccessToken) {
    throw new GithubUnavailableError('GitHub repository creation is not configured.');
  }

  if (!userClientPromise) {
    userClientPromise = loadOctokit()
      .then(({ Octokit }) => new Octokit({ auth: config.githubUserAccessToken }))
      .catch((error) => {
        userClientPromise = null;
        throw error;
      });
  }

  return userClientPromise;
}

function resetUserClient() {
  userClientPromise = null;
  octokitModulePromise = null;
}

module.exports = { getUserClient, resetUserClient };
