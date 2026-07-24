'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  DESTRUCTIVE_OPERATIONS,
  MAX_OPERATIONS_PER_SCHEMA,
  PRODUCTION_OPERATIONS,
  PRODUCTION_URL,
  SCHEMA_FILES,
  extractBlock,
  parseImplementedRoutes,
  parseSchemaOperations,
  validateVercelActionRelease,
} = require('../../scripts/validate-vercel-gateway-release');

const ROOT = path.resolve(__dirname, '..', '..');
const [CORE_FILE, CONFIG_FILE] = SCHEMA_FILES;

const CORE_OPERATION_IDS = [
  'getVercelUser',
  'listVercelTeams',
  'getVercelTeam',
  'listVercelProjects',
  'createVercelProject',
  'getVercelProject',
  'updateVercelProject',
  'deleteVercelProject',
  'pauseVercelProject',
  'unpauseVercelProject',
  'rollbackVercelProject',
  'listVercelDeployments',
  'createVercelDeployment',
  'getVercelDeployment',
  'deleteVercelDeployment',
  'cancelVercelDeployment',
  'getVercelDeploymentEvents',
  'getVercelDeploymentLogs',
  'listVercelDeploymentFiles',
  'promoteVercelDeployment',
];

const CONFIG_OPERATION_IDS = [
  'listVercelEnvironmentVariables',
  'createVercelEnvironmentVariable',
  'updateVercelEnvironmentVariable',
  'deleteVercelEnvironmentVariable',
  'listVercelProjectDomains',
  'addVercelProjectDomain',
  'getVercelProjectDomain',
  'removeVercelProjectDomain',
  'verifyVercelProjectDomain',
  'listVercelAliases',
  'assignVercelAlias',
  'deleteVercelAlias',
  'getVercelDomainConfig',
  'listVercelDnsRecords',
  'createVercelDnsRecord',
  'updateVercelDnsRecord',
  'deleteVercelDnsRecord',
];

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
}

function operationsOf(relative) {
  return parseSchemaOperations(read(relative));
}

describe('Vercel Action schema split', () => {
  it('passes release validation', () => {
    expect(validateVercelActionRelease()).toEqual([]);
  });

  it('publishes exactly two schema files', () => {
    expect(SCHEMA_FILES).toEqual([
      'docs/openapi/zoro-vercel-core-action.yaml',
      'docs/openapi/zoro-vercel-config-action.yaml',
    ]);
    for (const relative of SCHEMA_FILES) {
      expect(fs.existsSync(path.join(ROOT, relative))).toBe(true);
    }
  });

  it('no longer ships the combined schema that exceeded the GPT Builder limit', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/openapi/zoro-vercel-action.yaml'))).toBe(false);
  });

  it.each(SCHEMA_FILES)('%s stays under the GPT Builder operation limit', (relative) => {
    const operations = operationsOf(relative);
    expect(operations.length).toBeGreaterThan(0);
    expect(operations.length).toBeLessThan(MAX_OPERATIONS_PER_SCHEMA);
  });

  it.each(SCHEMA_FILES)('%s has unique operation IDs', (relative) => {
    const ids = operationsOf(relative).map((operation) => operation.operationId);
    expect(ids).not.toContain(null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('splits the documented operation IDs without overlap', () => {
    const coreIds = operationsOf(CORE_FILE).map((operation) => operation.operationId);
    const configIds = operationsOf(CONFIG_FILE).map((operation) => operation.operationId);

    expect(coreIds.sort()).toEqual([...CORE_OPERATION_IDS].sort());
    expect(configIds.sort()).toEqual([...CONFIG_OPERATION_IDS].sort());
    expect(coreIds.filter((id) => configIds.includes(id))).toEqual([]);
  });

  it('covers every implemented Vercel route exactly once', () => {
    const implemented = parseImplementedRoutes(read('src/routes/v1/vercel.js'));
    const exposed = [...operationsOf(CORE_FILE), ...operationsOf(CONFIG_FILE)].map(
      (operation) => `${operation.method} ${operation.path}`
    );

    expect(new Set(exposed).size).toBe(exposed.length);
    expect([...exposed].sort()).toEqual([...implemented].sort());
  });

  it.each(SCHEMA_FILES)('%s targets the production Context API host', (relative) => {
    expect(read(relative)).toContain(`- url: ${PRODUCTION_URL}`);
  });

  it('declares the same ZORO_VERCEL_API_KEY bearer scheme in both schemas', () => {
    const [core, config] = SCHEMA_FILES.map((relative) =>
      extractBlock(read(relative), 'securitySchemes')
    );

    expect(core).toContain('scheme: bearer');
    expect(core).toContain('ZORO_VERCEL_API_KEY');
    expect(config).toBe(core);

    for (const relative of SCHEMA_FILES) {
      expect(read(relative)).toMatch(/^security:\r?\n\s+- bearerAuth: \[\]/m);
    }
  });

  it('requires approval or confirmation payloads on governed operations', () => {
    const operations = [...operationsOf(CORE_FILE), ...operationsOf(CONFIG_FILE)];
    const byId = new Map(operations.map((operation) => [operation.operationId, operation]));

    for (const id of PRODUCTION_OPERATIONS) {
      expect(byId.get(id)?.requestBody).toBe('ProductionBody');
    }

    for (const id of DESTRUCTIVE_OPERATIONS) {
      expect(byId.get(id)?.requestBody).toBe('DestructiveBody');
    }
  });

  it('keeps Preview-first deployment creation documented and ungated by approval', () => {
    const create = operationsOf(CORE_FILE).find(
      (operation) => operation.operationId === 'createVercelDeployment'
    );

    expect(create.requestBody).toBe('ObjectBody');
    expect(create.summary).toMatch(/Preview deployment by default/);
  });

  it('exposes no decrypted environment-variable read operation', () => {
    const operations = [...operationsOf(CORE_FILE), ...operationsOf(CONFIG_FILE)];
    for (const operation of operations) {
      expect(operation.operationId).not.toMatch(/decrypt|secret|plaintext|reveal/i);
    }

    expect(operationsOf(CONFIG_FILE).map((operation) => operation.path)).not.toContain(
      '/api/v1/vercel/projects/{project}/environment-variables/{variable}/value'
    );
  });

  it('adds no generic proxy operation', () => {
    const paths = [...operationsOf(CORE_FILE), ...operationsOf(CONFIG_FILE)].map(
      (operation) => operation.path
    );

    for (const value of paths) {
      expect(value.startsWith('/api/v1/vercel/')).toBe(true);
      expect(value).not.toMatch(/proxy|request|passthrough|\{path\}|\{method\}/i);
    }
  });
});

describe('Vercel Action schema readers', () => {
  it('reads operation IDs, request bodies, and summaries from schema text', () => {
    const operations = parseSchemaOperations(
      [
        'paths:',
        '  /api/v1/vercel/projects/{project}:',
        '    get:',
        '      operationId: getVercelProject',
        '      summary: Get a Vercel project',
        '    delete:',
        '      operationId: deleteVercelProject',
        '      summary: Delete a project',
        '      requestBody:',
        "        $ref: '#/components/requestBodies/DestructiveBody'",
        'components:',
        '  requestBodies:',
        '    ObjectBody:',
        '      required: true',
      ].join('\n')
    );

    expect(operations).toEqual([
      {
        path: '/api/v1/vercel/projects/{project}',
        method: 'GET',
        operationId: 'getVercelProject',
        summary: 'Get a Vercel project',
        requestBody: null,
      },
      {
        path: '/api/v1/vercel/projects/{project}',
        method: 'DELETE',
        operationId: 'deleteVercelProject',
        summary: 'Delete a project',
        requestBody: 'DestructiveBody',
      },
    ]);
  });

  it('converts Express parameters into OpenAPI path templates', () => {
    const routes = parseImplementedRoutes(
      [
        "router.get('/user', controller.getUser);",
        "router.patch('/deployments/:deployment/cancel', controller.cancelDeployment);",
        "app.get('/ignored', handler);",
      ].join('\n')
    );

    expect([...routes]).toEqual([
      'GET /api/v1/vercel/user',
      'PATCH /api/v1/vercel/deployments/{deployment}/cancel',
    ]);
  });

  it('extracts an indented block and stops at the next sibling key', () => {
    const block = extractBlock(
      [
        'components:',
        '  securitySchemes:',
        '    bearerAuth:',
        '      scheme: bearer',
        '  parameters:',
        '    Limit:',
      ].join('\n'),
      'securitySchemes'
    );

    expect(block).toBe('securitySchemes:\n  bearerAuth:\n    scheme: bearer');
    expect(extractBlock('components:\n', 'securitySchemes')).toBeNull();
  });
});

describe('Vercel Action release validation rules', () => {
  const patch = (relative, replacements) => {
    let content = read(relative);
    for (const [from, to] of replacements) {
      expect(content).toContain(from);
      content = content.replace(from, to);
    }
    return validateVercelActionRelease({ files: { [relative]: content } });
  };

  it('rejects a schema that drops a production approval payload', () => {
    const failures = patch(CORE_FILE, [
      [
        "        $ref: '#/components/requestBodies/ProductionBody'\n      responses:\n        '200':\n          $ref: '#/components/responses/Success'\n  /api/v1/vercel/projects/{project}/unpause:",
        "        $ref: '#/components/requestBodies/ObjectBody'\n      responses:\n        '200':\n          $ref: '#/components/responses/Success'\n  /api/v1/vercel/projects/{project}/unpause:",
      ],
    ]);

    expect(failures).toContain(
      `${CORE_FILE} operation pauseVercelProject must declare a production approval payload`
    );
  });

  it('rejects a schema that drops a destructive confirmation payload', () => {
    const failures = patch(CONFIG_FILE, [
      [
        "        - $ref: '#/components/parameters/Alias'\n      requestBody:\n        $ref: '#/components/requestBodies/DestructiveBody'",
        "        - $ref: '#/components/parameters/Alias'\n      requestBody:\n        $ref: '#/components/requestBodies/ObjectBody'",
      ],
    ]);

    expect(failures).toContain(
      `${CONFIG_FILE} operation deleteVercelAlias must declare an exact destructive confirmation payload`
    );
  });

  it('rejects a renamed operation ID even when the route still matches', () => {
    const failures = patch(CORE_FILE, [
      ['operationId: promoteVercelDeployment', 'operationId: shipVercelDeployment'],
    ]);

    expect(failures).toContain(
      `${CORE_FILE} must keep operation ID promoteVercelDeployment for POST /api/v1/vercel/deployments/{deployment}/promote, found shipVercelDeployment`
    );
  });

  it('rejects an operation ID reused across both schemas', () => {
    const failures = patch(CONFIG_FILE, [
      ['operationId: getVercelDomainConfig', 'operationId: getVercelUser'],
    ]);

    expect(failures).toContain(
      'operation ID getVercelUser is duplicated across both Vercel schemas'
    );
  });

  it('rejects an operation placed in the wrong schema', () => {
    const core = read(CORE_FILE).replace(
      '  /api/v1/vercel/user:',
      [
        '  /api/v1/vercel/aliases:',
        '    get:',
        '      operationId: listVercelAliases',
        '      summary: List aliases',
        '      responses:',
        "        '200':",
        "          $ref: '#/components/responses/Success'",
        '  /api/v1/vercel/user:',
      ].join('\n')
    );

    expect(validateVercelActionRelease({ files: { [CORE_FILE]: core } })).toContain(
      `${CORE_FILE} exposes GET /api/v1/vercel/aliases, which belongs to ${CONFIG_FILE}`
    );
  });

  it('rejects an operation that has no implemented route', () => {
    const core = read(CORE_FILE).replace(
      '  /api/v1/vercel/user:',
      [
        '  /api/v1/vercel/billing:',
        '    get:',
        '      operationId: getVercelBilling',
        '      summary: Read billing',
        '      responses:',
        "        '200':",
        "          $ref: '#/components/responses/Success'",
        '  /api/v1/vercel/user:',
      ].join('\n')
    );
    const failures = validateVercelActionRelease({ files: { [CORE_FILE]: core } });

    expect(failures).toContain(
      `${CORE_FILE} exposes GET /api/v1/vercel/billing (getVercelBilling) with no implemented route`
    );
    expect(failures).toContain(
      `${CORE_FILE} exposes GET /api/v1/vercel/billing, which is not part of the published Vercel contract`
    );
  });

  it('rejects a decrypted secret read operation', () => {
    const failures = patch(CONFIG_FILE, [
      ['operationId: listVercelEnvironmentVariables', 'operationId: listVercelEnvironmentSecrets'],
    ]);

    expect(failures).toContain(
      `${CONFIG_FILE} must not expose a decrypted secret read operation (GET /api/v1/vercel/projects/{project}/environment-variables)`
    );
  });

  it('rejects a schema that exceeds the GPT Builder operation limit', () => {
    const extra = Array.from({ length: MAX_OPERATIONS_PER_SCHEMA + 1 }, (_, index) =>
      [
        `  /api/v1/vercel/filler-${index}:`,
        '    get:',
        `      operationId: getVercelFiller${index}`,
        '      summary: Filler',
        '      responses:',
        "        '200':",
        "          $ref: '#/components/responses/Success'",
      ].join('\n')
    ).join('\n');
    const failures = validateVercelActionRelease({
      files: { [CONFIG_FILE]: read(CONFIG_FILE).replace('paths:\n', `paths:\n${extra}\n`) },
    });

    expect(
      failures.some((failure) =>
        failure.startsWith(
          `${CONFIG_FILE} declares 48 operations, exceeding the GPT Builder limit of ${MAX_OPERATIONS_PER_SCHEMA}`
        )
      )
    ).toBe(true);
  });

  it('rejects a schema missing an operation the contract requires', () => {
    const core = read(CORE_FILE).replace(
      [
        '  /api/v1/vercel/deployments/{deployment}/logs:',
        '    get:',
        '      operationId: getVercelDeploymentLogs',
      ].join('\n'),
      [
        '  /api/v1/vercel/deployments/{deployment}/unused:',
        '    get:',
        '      operationId: getVercelDeploymentLogs',
      ].join('\n')
    );
    const failures = validateVercelActionRelease({ files: { [CORE_FILE]: core } });

    expect(failures).toContain(
      `${CORE_FILE} is missing getVercelDeploymentLogs (GET /api/v1/vercel/deployments/{deployment}/logs)`
    );
    expect(failures).toContain(
      'implemented route GET /api/v1/vercel/deployments/{deployment}/logs is missing from the Vercel Action schemas'
    );
  });

  it('rejects a bearer scheme that diverges between the schemas', () => {
    const failures = patch(CONFIG_FILE, [
      [
        '      description: Vercel Gateway bearer token supplied as ZORO_VERCEL_API_KEY.',
        '      description: Vercel Gateway bearer token supplied as ZORO_VERCEL_API_KEY (configuration).',
      ],
    ]);

    expect(failures).toContain(
      'both Vercel Action schemas must declare an identical bearer authentication scheme'
    );
  });

  it('rejects a schema that drops bearer authentication', () => {
    const failures = patch(CORE_FILE, [
      ['security:\n  - bearerAuth: []\n', ''],
      ['      description: Vercel Gateway bearer token supplied as ZORO_VERCEL_API_KEY.\n', ''],
    ]);

    expect(failures).toContain(`${CORE_FILE} must apply bearer authentication to every operation`);
    expect(failures).toContain(
      `${CORE_FILE} bearerAuth must name the ZORO_VERCEL_API_KEY credential`
    );
  });

  it('rejects a schema that points away from the production host', () => {
    const failures = patch(CORE_FILE, [
      [`- url: ${PRODUCTION_URL}`, '- url: https://staging.example.com'],
    ]);

    expect(failures).toContain(
      `${CORE_FILE} must target the production Context API URL ${PRODUCTION_URL}`
    );
  });

  it('rejects a missing schema file', () => {
    expect(validateVercelActionRelease({ files: { [CORE_FILE]: null } })).toContain(
      `missing required file ${CORE_FILE}`
    );
  });
});
