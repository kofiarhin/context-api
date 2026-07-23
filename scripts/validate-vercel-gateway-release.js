'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requiredFiles = [
  'docs/VERCEL_GATEWAY_SPEC.md',
  'docs/VERCEL_GATEWAY_IMPLEMENTATION_PLAN.md',
  'docs/openapi/zoro-vercel-action.yaml',
  'src/routes/v1/vercel.js',
  'src/controllers/vercel.controller.js',
  'src/services/vercel.service.js',
  'src/services/vercelClient.js',
  'src/services/vercelPolicy.js',
  'src/services/vercelErrors.js',
  'src/services/vercelLogs.service.js',
  'src/services/vercelRedaction.js',
  'src/serializers/vercel.serializer.js',
  'src/middleware/requireVercelActionAuth.js',
  'src/middleware/validateVercel.js',
];
const expectedOperations = [
  'getVercelUser',
  'listVercelTeams',
  'listVercelProjects',
  'createVercelProject',
  'getVercelProject',
  'updateVercelProject',
  'deleteVercelProject',
  'listVercelDeployments',
  'createVercelDeployment',
  'getVercelDeployment',
  'getVercelDeploymentEvents',
  'getVercelDeploymentLogs',
  'listVercelDeploymentFiles',
  'promoteVercelDeployment',
  'rollbackVercelProject',
  'listVercelEnvironmentVariables',
  'createVercelEnvironmentVariable',
  'updateVercelEnvironmentVariable',
  'deleteVercelEnvironmentVariable',
  'listVercelProjectDomains',
  'addVercelProjectDomain',
  'removeVercelProjectDomain',
  'listVercelAliases',
  'getVercelDomainConfig',
  'listVercelDnsRecords',
  'createVercelDnsRecord',
  'updateVercelDnsRecord',
  'deleteVercelDnsRecord',
];

let failed = false;
function fail(message) {
  failed = true;
  process.stderr.write(`Vercel gateway release validation failed: ${message}\n`);
}

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(ROOT, relative))) {
    fail(`missing required file ${relative}`);
  }
}

const schemaPath = path.join(ROOT, 'docs/openapi/zoro-vercel-action.yaml');
if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  if (!schema.includes('- url: https://context-api-3b9dfadf403e.herokuapp.com')) {
    fail('Action schema must target the production Context API URL');
  }
  if (!schema.includes('bearerAuth')) {
    fail('Action schema must declare bearer authentication');
  }
  if (/operationId:\s+\S*(decrypt|secretValue)/i.test(schema)) {
    fail('Action schema must not expose decrypted-value operations');
  }

  const ids = [...schema.matchAll(/^\s+operationId:\s+(\S+)\s*$/gm)].map(
    (match) => match[1]
  );
  if (new Set(ids).size !== ids.length) {
    fail('operation IDs must be unique');
  }
  for (const id of expectedOperations) {
    if (!ids.includes(id)) {
      fail(`missing operation ID ${id}`);
    }
  }
}

const servicePath = path.join(ROOT, 'src/services/vercel.service.js');
if (fs.existsSync(servicePath)) {
  const service = fs.readFileSync(servicePath, 'utf8');
  if (/getProjectEnv|decrypt/i.test(service)) {
    fail('service must not include decrypted environment-variable reads');
  }
  if (!service.includes("body.target = 'preview'")) {
    fail('deployment creation must default to Preview');
  }
  if (!service.includes('requireProductionApproval')) {
    fail('production approval policy is not enforced');
  }
  if (!service.includes('requireDestructiveConfirmation')) {
    fail('destructive confirmation policy is not enforced');
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  process.stdout.write('Vercel gateway release validation passed.\n');
}
