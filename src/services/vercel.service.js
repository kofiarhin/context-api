'use strict';

const { getEnv } = require('../config/env');
const { createVercelClient } = require('./vercelClient');
const { createPolicy } = require('./vercelPolicy');
const serializer = require('../serializers/vercel.serializer');

function createService(options = {}) {
  const env = options.env || getEnv();
  const client = options.client || createVercelClient(env, options);
  const policy = options.policy || createPolicy(env);
  const encode = encodeURIComponent;

  const list = (payload, key, mapper) => {
    const values = Array.isArray(payload) ? payload : payload && payload[key] ? payload[key] : [];
    return {
      data: values.map(mapper),
      meta: {
        pagination: payload && payload.pagination ? payload.pagination : null,
      },
    };
  };

  return Object.freeze({
    async getUser() {
      return serializer.user(await client.request('GET', '/v2/user'));
    },
    async listTeams(input = {}) {
      return list(await client.request('GET', '/v2/teams', { query: input }), 'teams', serializer.team);
    },
    async getTeam({ teamId }) {
      if (env.vercelTeamId && teamId !== env.vercelTeamId) policy.assertProjectAllowed('__forbidden_team__');
      return serializer.team(await client.request('GET', `/v2/teams/${encode(teamId)}`, { query: { teamId: undefined } }));
    },
    async listProjects(input = {}) {
      const payload = await client.request('GET', '/v9/projects', { query: input });
      return list(payload, 'projects', serializer.project);
    },
    async getProject({ project }) {
      policy.assertProjectAllowed(project);
      return serializer.project(await client.request('GET', `/v9/projects/${encode(project)}`));
    },
    async createProject(input) {
      policy.assertProjectAllowed(input.name);
      if (input.gitRepository) policy.assertRepositoryAllowed(input.gitRepository.repo);
      return serializer.project(await client.request('POST', '/v10/projects', { body: input }));
    },
    async updateProject({ project, approval, ...changes }) {
      policy.assertProjectAllowed(project);
      const productionKeys = ['framework', 'buildCommand', 'installCommand', 'outputDirectory', 'rootDirectory', 'productionBranch'];
      if (productionKeys.some((key) => changes[key] !== undefined)) {
        policy.requireProductionApproval(approval, `project ${project}`);
      }
      return serializer.project(await client.request('PATCH', `/v9/projects/${encode(project)}`, { body: changes }));
    },
    async deleteProject({ project, confirmation }) {
      policy.assertProjectAllowed(project);
      const current = await client.request('GET', `/v9/projects/${encode(project)}`);
      policy.requireDestructiveConfirmation(confirmation, {
        resourceType: 'project',
        resourceId: current.id || project,
        expectedName: current.name,
      });
      await client.request('DELETE', `/v9/projects/${encode(project)}`);
      return { deleted: true, id: current.id || project, name: current.name };
    },
    async pauseProject({ project, approval }) {
      policy.assertProjectAllowed(project);
      policy.requireProductionApproval(approval, `project ${project}`);
      return serializer.project(await client.request('POST', `/v1/projects/${encode(project)}/pause`));
    },
    async unpauseProject({ project, approval }) {
      policy.assertProjectAllowed(project);
      policy.requireProductionApproval(approval, `project ${project}`);
      return serializer.project(await client.request('POST', `/v1/projects/${encode(project)}/unpause`));
    },
    async listDeployments(input = {}) {
      if (input.projectId) policy.assertProjectAllowed(input.projectId);
      const payload = await client.request('GET', '/v6/deployments', { query: input });
      return list(payload, 'deployments', serializer.deployment);
    },
    async getDeployment({ deployment }) {
      return serializer.deployment(await client.request('GET', `/v13/deployments/${encode(deployment)}`));
    },
    async createDeployment(input) {
      if (input.project) policy.assertProjectAllowed(input.project);
      if (input.target === 'production') policy.requireProductionApproval(input.approval, `deployment for ${input.project || input.name}`);
      const { approval, ...body } = input;
      if (!body.target) body.target = 'preview';
      return serializer.deployment(await client.request('POST', '/v13/deployments', { body }));
    },
    async cancelDeployment({ deployment }) {
      return serializer.deployment(await client.request('PATCH', `/v12/deployments/${encode(deployment)}/cancel`));
    },
    async deleteDeployment({ deployment, confirmation }) {
      const current = await client.request('GET', `/v13/deployments/${encode(deployment)}`);
      policy.requireDestructiveConfirmation(confirmation, {
        resourceType: 'deployment',
        resourceId: current.uid || current.id || deployment,
        expectedName: current.name,
      });
      await client.request('DELETE', `/v13/deployments/${encode(deployment)}`);
      return { deleted: true, id: current.uid || current.id || deployment, name: current.name };
    },
    async getDeploymentEvents({ deployment, ...query }) {
      const payload = await client.request('GET', `/v3/deployments/${encode(deployment)}/events`, { query });
      const events = Array.isArray(payload) ? payload : payload && payload.events ? payload.events : [];
      return { data: events.map((event) => serializer.compact({ id: event.id, type: event.type, created: event.created, payload: event.payload })), meta: {} };
    },
    async listDeploymentFiles({ deployment }) {
      const payload = await client.request('GET', `/v6/deployments/${encode(deployment)}/files`);
      return { data: (payload.files || payload || []).map((file) => serializer.compact({ name: file.name, type: file.type, uid: file.uid, size: file.size })), meta: {} };
    },
    async promoteDeployment({ project, deployment, approval }) {
      policy.assertProjectAllowed(project);
      policy.requireProductionApproval(approval, `deployment ${deployment}`);
      return serializer.compact(await client.request('POST', `/v10/projects/${encode(project)}/promote/${encode(deployment)}`));
    },
    async rollbackProject({ project, deployment, approval }) {
      policy.assertProjectAllowed(project);
      policy.requireProductionApproval(approval, `rollback ${project}`);
      return serializer.compact(await client.request('POST', `/v10/projects/${encode(project)}/rollback/${encode(deployment)}`));
    },
    async listEnvironmentVariables({ project, ...query }) {
      policy.assertProjectAllowed(project);
      const payload = await client.request('GET', `/v9/projects/${encode(project)}/env`, { query });
      return list(payload, 'envs', serializer.environmentVariable);
    },
    async createEnvironmentVariable({ project, approval, ...input }) {
      policy.assertProjectAllowed(project);
      policy.assertEnvironmentValueInput(input);
      if ((input.target || []).includes('production')) policy.requireProductionApproval(approval, `environment variable ${input.key}`);
      return serializer.environmentVariable(await client.request('POST', `/v10/projects/${encode(project)}/env`, { body: input }));
    },
    async updateEnvironmentVariable({ project, variable, approval, ...input }) {
      policy.assertProjectAllowed(project);
      if (input.value !== undefined) policy.assertEnvironmentValueInput(input);
      if ((input.target || []).includes('production')) policy.requireProductionApproval(approval, `environment variable ${variable}`);
      return serializer.environmentVariable(await client.request('PATCH', `/v9/projects/${encode(project)}/env/${encode(variable)}`, { body: input }));
    },
    async deleteEnvironmentVariable({ project, variable, confirmation }) {
      policy.assertProjectAllowed(project);
      policy.requireDestructiveConfirmation(confirmation, { resourceType: 'environment-variable', resourceId: variable });
      await client.request('DELETE', `/v9/projects/${encode(project)}/env/${encode(variable)}`);
      return { deleted: true, id: variable };
    },
    async listProjectDomains({ project }) {
      policy.assertProjectAllowed(project);
      const payload = await client.request('GET', `/v9/projects/${encode(project)}/domains`);
      return list(payload, 'domains', serializer.domain);
    },
    async getProjectDomain({ project, domain }) {
      policy.assertProjectAllowed(project);
      policy.assertDomainAllowed(domain);
      return serializer.domain(await client.request('GET', `/v9/projects/${encode(project)}/domains/${encode(domain)}`));
    },
    async addProjectDomain({ project, domain, approval, ...input }) {
      policy.assertProjectAllowed(project);
      policy.assertDomainAllowed(domain);
      if (input.production === true) policy.requireProductionApproval(approval, `domain ${domain}`);
      return serializer.domain(await client.request('POST', `/v10/projects/${encode(project)}/domains`, { body: { name: domain, ...input } }));
    },
    async verifyProjectDomain({ project, domain, approval }) {
      policy.assertProjectAllowed(project);
      policy.assertDomainAllowed(domain);
      policy.requireProductionApproval(approval, `domain ${domain}`);
      return serializer.domain(await client.request('POST', `/v9/projects/${encode(project)}/domains/${encode(domain)}/verify`));
    },
    async removeProjectDomain({ project, domain, confirmation }) {
      policy.assertProjectAllowed(project);
      policy.assertDomainAllowed(domain);
      policy.requireDestructiveConfirmation(confirmation, { resourceType: 'domain', resourceId: domain, expectedName: domain });
      await client.request('DELETE', `/v9/projects/${encode(project)}/domains/${encode(domain)}`);
      return { deleted: true, name: domain };
    },
    async listAliases(input = {}) {
      const payload = await client.request('GET', '/v4/aliases', { query: input });
      return list(payload, 'aliases', serializer.alias);
    },
    async assignAlias({ deployment, alias, approval }) {
      policy.assertDomainAllowed(alias);
      policy.requireProductionApproval(approval, `alias ${alias}`);
      return serializer.alias(await client.request('POST', `/v2/deployments/${encode(deployment)}/aliases`, { body: { alias } }));
    },
    async deleteAlias({ alias, confirmation }) {
      policy.assertDomainAllowed(alias);
      policy.requireDestructiveConfirmation(confirmation, { resourceType: 'alias', resourceId: alias, expectedName: alias });
      await client.request('DELETE', `/v2/aliases/${encode(alias)}`);
      return { deleted: true, alias };
    },
    async getDomainConfig({ domain }) {
      policy.assertDomainAllowed(domain);
      return serializer.compact(await client.request('GET', `/v6/domains/${encode(domain)}/config`));
    },
    async listDnsRecords({ domain, ...query }) {
      policy.assertDomainAllowed(domain);
      const payload = await client.request('GET', `/v4/domains/${encode(domain)}/records`, { query });
      return list(payload, 'records', serializer.dnsRecord);
    },
    async createDnsRecord({ domain, approval, ...input }) {
      policy.assertDomainAllowed(domain);
      policy.requireProductionApproval(approval, `DNS for ${domain}`);
      return serializer.dnsRecord(await client.request('POST', `/v2/domains/${encode(domain)}/records`, { body: input }));
    },
    async updateDnsRecord({ domain, record, approval, ...input }) {
      policy.assertDomainAllowed(domain);
      policy.requireProductionApproval(approval, `DNS record ${record}`);
      return serializer.dnsRecord(await client.request('PATCH', `/v1/domains/records/${encode(record)}`, { body: input }));
    },
    async deleteDnsRecord({ domain, record, confirmation }) {
      policy.assertDomainAllowed(domain);
      policy.requireDestructiveConfirmation(confirmation, { resourceType: 'dns-record', resourceId: record });
      await client.request('DELETE', `/v2/domains/${encode(domain)}/records/${encode(record)}`);
      return { deleted: true, id: record };
    },
  });
}

let singleton;
function service() {
  if (!singleton) singleton = createService();
  return singleton;
}

module.exports = new Proxy({}, {
  get(target, property) {
    if (property === 'createService') return createService;
    const value = service()[property];
    return typeof value === 'function' ? value.bind(service()) : value;
  },
});
