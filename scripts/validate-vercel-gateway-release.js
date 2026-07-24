'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PRODUCTION_URL = 'https://context-api-3b9dfadf403e.herokuapp.com';
const ROUTE_PREFIX = '/api/v1/vercel';
const ROUTES_FILE = 'src/routes/v1/vercel.js';
const SERVICE_FILE = 'src/services/vercel.service.js';

// A GPT Builder Action schema may declare at most 30 operations, which is why the Vercel
// contract is published as two disjoint schemas instead of one.
const MAX_OPERATIONS_PER_SCHEMA = 30;

const CORE_SCHEMA = 'docs/openapi/zoro-vercel-core-action.yaml';
const CONFIG_SCHEMA = 'docs/openapi/zoro-vercel-config-action.yaml';
const SCHEMA_FILES = [CORE_SCHEMA, CONFIG_SCHEMA];

const REQUIRED_FILES = [
  'docs/VERCEL_GATEWAY_SPEC.md',
  'docs/VERCEL_GATEWAY_IMPLEMENTATION_PLAN.md',
  ...SCHEMA_FILES,
  ROUTES_FILE,
  'src/controllers/vercel.controller.js',
  SERVICE_FILE,
  'src/services/vercelClient.js',
  'src/services/vercelPolicy.js',
  'src/services/vercelErrors.js',
  'src/services/vercelLogs.service.js',
  'src/services/vercelRedaction.js',
  'src/serializers/vercel.serializer.js',
  'src/middleware/requireVercelActionAuth.js',
  'src/middleware/validateVercel.js',
];

/**
 * The published Vercel Action contract, keyed by the implemented route each operation must map
 * to. Keying on the route rather than the operation ID means a rename cannot quietly drop an
 * operation out of its approval or confirmation requirement.
 *
 * `body` names the request body the operation has to declare: `ProductionBody` carries the
 * production approval payload, `DestructiveBody` carries the exact destructive confirmation
 * payload, `ObjectBody` is an ordinary write, and `null` means the operation takes no body.
 */
const CONTRACT = {
  [CORE_SCHEMA]: {
    'GET /api/v1/vercel/user': { operationId: 'getVercelUser', body: null },
    'GET /api/v1/vercel/teams': { operationId: 'listVercelTeams', body: null },
    'GET /api/v1/vercel/teams/{teamId}': { operationId: 'getVercelTeam', body: null },
    'GET /api/v1/vercel/projects': { operationId: 'listVercelProjects', body: null },
    'POST /api/v1/vercel/projects': { operationId: 'createVercelProject', body: 'ObjectBody' },
    'GET /api/v1/vercel/projects/{project}': { operationId: 'getVercelProject', body: null },
    'PATCH /api/v1/vercel/projects/{project}': {
      operationId: 'updateVercelProject',
      body: 'ObjectBody',
    },
    'DELETE /api/v1/vercel/projects/{project}': {
      operationId: 'deleteVercelProject',
      body: 'DestructiveBody',
    },
    'POST /api/v1/vercel/projects/{project}/pause': {
      operationId: 'pauseVercelProject',
      body: 'ProductionBody',
    },
    'POST /api/v1/vercel/projects/{project}/unpause': {
      operationId: 'unpauseVercelProject',
      body: 'ProductionBody',
    },
    'POST /api/v1/vercel/projects/{project}/rollback': {
      operationId: 'rollbackVercelProject',
      body: 'ProductionBody',
    },
    'GET /api/v1/vercel/deployments': { operationId: 'listVercelDeployments', body: null },
    'POST /api/v1/vercel/deployments': {
      operationId: 'createVercelDeployment',
      body: 'ObjectBody',
    },
    'GET /api/v1/vercel/deployments/{deployment}': {
      operationId: 'getVercelDeployment',
      body: null,
    },
    'DELETE /api/v1/vercel/deployments/{deployment}': {
      operationId: 'deleteVercelDeployment',
      body: 'DestructiveBody',
    },
    'PATCH /api/v1/vercel/deployments/{deployment}/cancel': {
      operationId: 'cancelVercelDeployment',
      body: null,
    },
    'GET /api/v1/vercel/deployments/{deployment}/events': {
      operationId: 'getVercelDeploymentEvents',
      body: null,
    },
    'GET /api/v1/vercel/deployments/{deployment}/logs': {
      operationId: 'getVercelDeploymentLogs',
      body: null,
    },
    'GET /api/v1/vercel/deployments/{deployment}/files': {
      operationId: 'listVercelDeploymentFiles',
      body: null,
    },
    'POST /api/v1/vercel/deployments/{deployment}/promote': {
      operationId: 'promoteVercelDeployment',
      body: 'ProductionBody',
    },
  },
  [CONFIG_SCHEMA]: {
    'GET /api/v1/vercel/projects/{project}/environment-variables': {
      operationId: 'listVercelEnvironmentVariables',
      body: null,
    },
    'POST /api/v1/vercel/projects/{project}/environment-variables': {
      operationId: 'createVercelEnvironmentVariable',
      body: 'ObjectBody',
    },
    'PATCH /api/v1/vercel/projects/{project}/environment-variables/{variable}': {
      operationId: 'updateVercelEnvironmentVariable',
      body: 'ObjectBody',
    },
    'DELETE /api/v1/vercel/projects/{project}/environment-variables/{variable}': {
      operationId: 'deleteVercelEnvironmentVariable',
      body: 'DestructiveBody',
    },
    'GET /api/v1/vercel/projects/{project}/domains': {
      operationId: 'listVercelProjectDomains',
      body: null,
    },
    'POST /api/v1/vercel/projects/{project}/domains': {
      operationId: 'addVercelProjectDomain',
      body: 'ObjectBody',
    },
    'GET /api/v1/vercel/projects/{project}/domains/{domain}': {
      operationId: 'getVercelProjectDomain',
      body: null,
    },
    'DELETE /api/v1/vercel/projects/{project}/domains/{domain}': {
      operationId: 'removeVercelProjectDomain',
      body: 'DestructiveBody',
    },
    'POST /api/v1/vercel/projects/{project}/domains/{domain}/verify': {
      operationId: 'verifyVercelProjectDomain',
      body: 'ProductionBody',
    },
    'GET /api/v1/vercel/aliases': { operationId: 'listVercelAliases', body: null },
    'POST /api/v1/vercel/deployments/{deployment}/aliases': {
      operationId: 'assignVercelAlias',
      body: 'ProductionBody',
    },
    'DELETE /api/v1/vercel/aliases/{alias}': {
      operationId: 'deleteVercelAlias',
      body: 'DestructiveBody',
    },
    'GET /api/v1/vercel/domains/{domain}/config': {
      operationId: 'getVercelDomainConfig',
      body: null,
    },
    'GET /api/v1/vercel/domains/{domain}/dns': { operationId: 'listVercelDnsRecords', body: null },
    'POST /api/v1/vercel/domains/{domain}/dns': {
      operationId: 'createVercelDnsRecord',
      body: 'ProductionBody',
    },
    'PATCH /api/v1/vercel/domains/{domain}/dns/{record}': {
      operationId: 'updateVercelDnsRecord',
      body: 'ProductionBody',
    },
    'DELETE /api/v1/vercel/domains/{domain}/dns/{record}': {
      operationId: 'deleteVercelDnsRecord',
      body: 'DestructiveBody',
    },
  },
};

const REQUIRED_BODY_LABELS = {
  ObjectBody: 'a JSON request body',
  ProductionBody: 'a production approval payload',
  DestructiveBody: 'an exact destructive confirmation payload',
};

function contractEntries() {
  return SCHEMA_FILES.flatMap((relative) =>
    Object.entries(CONTRACT[relative]).map(([route, entry]) => ({ ...entry, route, relative }))
  );
}

function operationIdsRequiring(body) {
  return new Set(
    contractEntries()
      .filter((entry) => entry.body === body)
      .map((entry) => entry.operationId)
  );
}

// Operations that reach Production and therefore must ship an approval payload.
const PRODUCTION_OPERATIONS = operationIdsRequiring('ProductionBody');

// Operations that remove a resource and therefore must ship an exact confirmation payload.
const DESTRUCTIVE_OPERATIONS = operationIdsRequiring('DestructiveBody');

// Guards against an operation that would return a decrypted environment-variable value. Only
// operation IDs are inspected, because prose legitimately states that values are never decrypted.
const SECRET_READ_PATTERN = /decrypt|secret|plaintext|reveal/i;
const HTTP_METHODS = ['get', 'post', 'patch', 'delete', 'put', 'head', 'options'];

function readFile(relative) {
  const absolute = path.join(ROOT, relative);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
}

/**
 * Minimal line-based reader for the hand-maintained Action schemas. A YAML parser is not a
 * dependency of this project, and the schemas are deliberately written in a flat, predictable
 * shape so this reader stays trivial.
 */
function parseSchemaOperations(text) {
  const operations = [];
  let section = null;
  let currentPath = null;
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const topLevel = /^([A-Za-z][\w-]*):/.exec(line);
    if (topLevel) {
      section = topLevel[1];
      currentPath = null;
      current = null;
      continue;
    }

    if (section !== 'paths') continue;

    const pathMatch = /^ {2}(\/\S*):\s*$/.exec(line);
    if (pathMatch) {
      currentPath = pathMatch[1];
      current = null;
      continue;
    }

    const methodMatch = /^ {4}([a-z]+):\s*$/.exec(line);
    if (methodMatch && HTTP_METHODS.includes(methodMatch[1]) && currentPath) {
      current = { path: currentPath, method: methodMatch[1].toUpperCase(), lines: [] };
      operations.push(current);
      continue;
    }

    if (current) current.lines.push(line);
  }

  return operations.map((operation) => {
    const body = operation.lines.join('\n');
    const operationId = /operationId:\s*(\S+)/.exec(body);
    const summary = /summary:\s*(.+)/.exec(body);
    const requestBody = /requestBodies\/(\w+)/.exec(body);
    return {
      path: operation.path,
      method: operation.method,
      operationId: operationId ? operationId[1] : null,
      summary: summary ? summary[1].trim() : '',
      requestBody: requestBody ? requestBody[1] : null,
    };
  });
}

function extractBlock(text, key) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return null;

  const indent = lines[start].length - lines[start].trimStart().length;
  const block = [lines[start].trim()];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    const lineIndent = line.length - line.trimStart().length;
    if (lineIndent <= indent) break;
    block.push(line.slice(indent));
  }

  return block.join('\n');
}

function parseImplementedRoutes(text) {
  const routes = new Set();
  const pattern = /router\.(get|post|patch|delete|put)\(\s*'([^']+)'/g;
  let match = pattern.exec(text);
  while (match) {
    const routePath = match[2].replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    routes.add(`${match[1].toUpperCase()} ${ROUTE_PREFIX}${routePath === '/' ? '' : routePath}`);
    match = pattern.exec(text);
  }

  return routes;
}

/**
 * @param {{ files?: Record<string, string|null> }} [options] Repository contents to substitute for
 *   the files on disk. Tests use this to prove each rule actually fails when it is violated.
 */
function validateVercelActionRelease(options = {}) {
  const overrides = options.files || {};
  const read = (relative) =>
    Object.prototype.hasOwnProperty.call(overrides, relative)
      ? overrides[relative]
      : readFile(relative);

  const failures = [];
  const fail = (message) => failures.push(message);

  for (const relative of REQUIRED_FILES) {
    if (read(relative) === null) fail(`missing required file ${relative}`);
  }

  const routesSource = read(ROUTES_FILE);
  const implementedRoutes = routesSource ? parseImplementedRoutes(routesSource) : new Set();
  if (routesSource && implementedRoutes.size === 0) {
    fail(`no routes could be read from ${ROUTES_FILE}`);
  }

  const schemas = new Map();
  const securitySchemeBlocks = new Map();
  const exposedRoutes = new Set();

  for (const relative of SCHEMA_FILES) {
    const schema = read(relative);
    if (schema === null) continue;

    if (!schema.includes(`- url: ${PRODUCTION_URL}`)) {
      fail(`${relative} must target the production Context API URL ${PRODUCTION_URL}`);
    }

    if (!/^security:\r?\n\s+- bearerAuth: \[\]\s*$/m.test(schema)) {
      fail(`${relative} must apply bearer authentication to every operation`);
    }

    const securityScheme = extractBlock(schema, 'securitySchemes');
    if (!securityScheme || !/bearerAuth:/.test(securityScheme)) {
      fail(`${relative} must declare a bearerAuth security scheme`);
    } else {
      if (!/scheme: bearer/.test(securityScheme)) {
        fail(`${relative} bearerAuth must use the HTTP bearer scheme`);
      }
      if (!/ZORO_VERCEL_API_KEY/.test(securityScheme)) {
        fail(`${relative} bearerAuth must name the ZORO_VERCEL_API_KEY credential`);
      }
      securitySchemeBlocks.set(relative, securityScheme);
    }

    const operations = parseSchemaOperations(schema);
    schemas.set(relative, operations);

    if (operations.length === 0) {
      fail(`${relative} declares no operations`);
    }

    if (operations.length > MAX_OPERATIONS_PER_SCHEMA) {
      fail(
        `${relative} declares ${operations.length} operations, exceeding the GPT Builder limit of ${MAX_OPERATIONS_PER_SCHEMA}`
      );
    }

    const ids = operations.map((operation) => operation.operationId);
    if (ids.some((id) => !id)) {
      fail(`${relative} has an operation without an operationId`);
    }

    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      fail(`${relative} operation IDs must be unique within the file`);
    }

    const contract = CONTRACT[relative];

    for (const operation of operations) {
      const route = `${operation.method} ${operation.path}`;
      exposedRoutes.add(route);

      if (routesSource && !implementedRoutes.has(route)) {
        fail(`${relative} exposes ${route} (${operation.operationId}) with no implemented route`);
      }

      if (SECRET_READ_PATTERN.test(operation.operationId || '')) {
        fail(`${relative} must not expose a decrypted secret read operation (${route})`);
      }

      const expected = contract[route];
      if (!expected) {
        const owner = SCHEMA_FILES.find(
          (candidate) => candidate !== relative && CONTRACT[candidate][route]
        );
        fail(
          owner
            ? `${relative} exposes ${route}, which belongs to ${owner}`
            : `${relative} exposes ${route}, which is not part of the published Vercel contract`
        );
        continue;
      }

      if (operation.operationId !== expected.operationId) {
        fail(
          `${relative} must keep operation ID ${expected.operationId} for ${route}, found ${operation.operationId}`
        );
      }

      if ((operation.requestBody || null) !== expected.body) {
        fail(
          `${relative} operation ${expected.operationId} must declare ${
            REQUIRED_BODY_LABELS[expected.body] || 'no request body'
          }`
        );
      }
    }

    const declaredRoutes = new Set(
      operations.map((operation) => `${operation.method} ${operation.path}`)
    );
    for (const [route, expected] of Object.entries(contract)) {
      if (!declaredRoutes.has(route)) {
        fail(`${relative} is missing ${expected.operationId} (${route})`);
      }
    }
  }

  if (securitySchemeBlocks.size === SCHEMA_FILES.length) {
    const [first, ...rest] = [...securitySchemeBlocks.values()];
    if (rest.some((block) => block !== first)) {
      fail('both Vercel Action schemas must declare an identical bearer authentication scheme');
    }
  }

  if (schemas.size === SCHEMA_FILES.length) {
    const [coreFile, configFile] = SCHEMA_FILES;
    const coreIds = new Set(schemas.get(coreFile).map((operation) => operation.operationId));
    for (const operation of schemas.get(configFile)) {
      if (coreIds.has(operation.operationId)) {
        fail(`operation ID ${operation.operationId} is duplicated across both Vercel schemas`);
      }
    }

    for (const route of implementedRoutes) {
      if (!exposedRoutes.has(route)) {
        fail(`implemented route ${route} is missing from the Vercel Action schemas`);
      }
    }
  }

  const service = read(SERVICE_FILE);
  if (service) {
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

  return failures;
}

function main() {
  const failures = validateVercelActionRelease();
  for (const failure of failures) {
    process.stderr.write(`Vercel gateway release validation failed: ${failure}\n`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Vercel gateway release validation passed.\n');
}

if (require.main === module) main();

module.exports = {
  CONFIG_SCHEMA,
  CONTRACT,
  CORE_SCHEMA,
  DESTRUCTIVE_OPERATIONS,
  MAX_OPERATIONS_PER_SCHEMA,
  PRODUCTION_OPERATIONS,
  PRODUCTION_URL,
  SCHEMA_FILES,
  contractEntries,
  extractBlock,
  parseImplementedRoutes,
  parseSchemaOperations,
  validateVercelActionRelease,
};
