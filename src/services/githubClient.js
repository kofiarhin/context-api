'use strict';

const { getEnv } = require('../config/env');
const { GithubUnavailableError } = require('../utils/errors');

/**
 * GitHub App installation client.
 *
 * `octokit` ships as ESM, so this CommonJS module loads it through a cached
 * dynamic import. The installation client is created once and reused: Octokit
 * owns the short-lived installation token lifecycle, so nothing here caches,
 * inspects, or exposes a token.
 */

let octokitModulePromise = null;
let installationClientPromise = null;

function loadOctokit() {
  if (!octokitModulePromise) {
    octokitModulePromise = import('octokit');
  }

  return octokitModulePromise;
}

async function createInstallationClient(env) {
  const { App } = await loadOctokit();

  const app = new App({
    appId: env.githubAppId,
    privateKey: env.githubPrivateKey,
  });

  return app.getInstallationOctokit(env.githubInstallationId);
}

/**
 * Returns the shared installation-authenticated Octokit client.
 *
 * The promise is cached so concurrent requests share one construction, and it
 * is cleared on failure so a transient GitHub or credential problem does not
 * permanently poison the process with a rejected promise.
 */
async function getInstallationClient(options = {}) {
  const env = options.env || getEnv();

  if (!env.githubAppId || !env.githubInstallationId || !env.githubPrivateKey) {
    throw new GithubUnavailableError('The GitHub gateway is not configured.');
  }

  if (!installationClientPromise) {
    installationClientPromise = createInstallationClient(env).catch((error) => {
      installationClientPromise = null;
      throw error;
    });
  }

  return installationClientPromise;
}

function resetInstallationClient() {
  installationClientPromise = null;
  octokitModulePromise = null;
}

module.exports = { getInstallationClient, resetInstallationClient };
