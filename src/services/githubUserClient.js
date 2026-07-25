'use strict';

const { getEnv } = require('../config/env');
const { GithubUnavailableError } = require('../utils/errors');

/**
 * Account-level GitHub client, used only to create repositories.
 *
 * A GitHub App installation cannot create a repository in a user account, so
 * that one operation needs a user token. Everything else — contents, branches,
 * files, pull requests, merges — keeps using the installation client in
 * `githubClient.js`, which holds no long-lived credential.
 *
 * The separation is the point: this client is constructed only when repository
 * creation is enabled, and the token it is built with is never returned,
 * logged, attached to a request, or included in an error. Like the installation
 * client it is loaded through a cached dynamic `import()` because `octokit`
 * ships as ESM.
 */

let octokitModulePromise = null;
let userClientPromise = null;

function loadOctokit() {
  if (!octokitModulePromise) {
    octokitModulePromise = import('octokit');
  }

  return octokitModulePromise;
}

async function createUserClient(env) {
  const { Octokit } = await loadOctokit();

  return new Octokit({ auth: env.githubUserAccessToken });
}

/**
 * Returns the shared user-authenticated Octokit client.
 *
 * Fails closed: if repository creation is disabled or the token is absent the
 * client is never built, so a misconfiguration surfaces as a clear gateway
 * error rather than an unauthenticated call to GitHub.
 *
 * The promise is cached so concurrent requests share one construction, and it
 * is cleared on failure so a transient problem does not permanently poison the
 * process with a rejected promise.
 */
async function getUserClient(options = {}) {
  const env = options.env || getEnv();

  if (!env.githubRepositoryCreationEnabled) {
    throw new GithubUnavailableError('GitHub repository creation is disabled.');
  }

  if (!env.githubUserAccessToken || !env.githubAllowedOwner) {
    throw new GithubUnavailableError('GitHub repository creation is not configured.');
  }

  if (!userClientPromise) {
    userClientPromise = createUserClient(env).catch((error) => {
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
