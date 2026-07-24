'use strict';

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, compact(item)])
  );
}

// `GET /v2/user` wraps the account in a `user` envelope; accept either shape.
function user(value = {}) {
  const source =
    value && typeof value.user === 'object' && value.user !== null ? value.user : value;
  return compact({
    id: source.id,
    username: source.username,
    name: source.name,
    email: source.email,
  });
}

function team(value = {}) {
  return compact({ id: value.id, slug: value.slug, name: value.name, createdAt: value.createdAt });
}

function project(value = {}) {
  return compact({
    id: value.id,
    name: value.name,
    accountId: value.accountId,
    framework: value.framework,
    nodeVersion: value.nodeVersion,
    rootDirectory: value.rootDirectory,
    buildCommand: value.buildCommand,
    installCommand: value.installCommand,
    outputDirectory: value.outputDirectory,
    productionDeploymentsFastLane: value.productionDeploymentsFastLane,
    paused: value.paused,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    link: value.link && {
      type: value.link.type,
      repo: value.link.repo,
      repoId: value.link.repoId,
      org: value.link.org,
      productionBranch: value.link.productionBranch,
    },
  });
}

function deployment(value = {}) {
  return compact({
    id: value.uid || value.id,
    name: value.name,
    url: value.url,
    projectId: value.projectId,
    state: value.state || value.readyState,
    target: value.target,
    createdAt: value.createdAt,
    buildingAt: value.buildingAt,
    ready: value.ready,
    meta: value.meta && {
      githubCommitSha: value.meta.githubCommitSha,
      githubCommitRef: value.meta.githubCommitRef,
      githubRepo: value.meta.githubRepo,
      githubOrg: value.meta.githubOrg,
    },
  });
}

function environmentVariable(value = {}) {
  return compact({
    id: value.id,
    key: value.key,
    type: value.type,
    target: value.target,
    gitBranch: value.gitBranch,
    customEnvironmentIds: value.customEnvironmentIds,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    valueConfigured: Boolean(value.value || value.encryptedValue || value.createdAt),
  });
}

function domain(value = {}) {
  return compact({
    name: value.name,
    apexName: value.apexName,
    projectId: value.projectId,
    verified: value.verified,
    redirect: value.redirect,
    redirectStatusCode: value.redirectStatusCode,
    gitBranch: value.gitBranch,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  });
}

function alias(value = {}) {
  return compact({
    uid: value.uid,
    alias: value.alias,
    deploymentId: value.deploymentId,
    projectId: value.projectId,
    redirect: value.redirect,
    created: value.created,
  });
}

function dnsRecord(value = {}) {
  return compact({
    id: value.id,
    slug: value.slug,
    name: value.name,
    type: value.type,
    value: value.value,
    ttl: value.ttl,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  });
}

module.exports = { user, team, project, deployment, environmentVariable, domain, alias, dnsRecord, compact };
