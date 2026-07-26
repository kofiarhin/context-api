'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  CLASSIFICATIONS,
  DISPATCHER_IDS,
  getDispatcher,
} = require('../src/services/zoro/zoroCatalogue');

const ROOT = path.resolve(__dirname, '..');
const PRODUCTION_URL = 'https://context-api-3b9dfadf403e.herokuapp.com';
const SCHEMA_FILE = 'docs/openapi/zoro-single-full-engineering-action.yaml';
const FULL_ROUTE_PATH = '/api/v1/zoro/operations/{operationId}';
const READ_ROUTE_PATH = '/api/v1/zoro/read/{operationId}';
const FULL_OPERATION_ID = 'executeZoroEngineeringOperation';
const READ_OPERATION_ID = 'executeZoroReadOperation';
const EXPECTED_OPERATION_IDS = Object.freeze([FULL_OPERATION_ID, READ_OPERATION_ID]);
const READ_DISPATCHER_IDS = Object.freeze(
  DISPATCHER_IDS.filter((id) =>
    Object.values(getDispatcher(id).operations).some(
      (operation) => operation.classification === CLASSIFICATIONS.READ
    )
  )
);

/**
 * A GPT Builder Action schema may declare at most 30 operations. The unified
 * engineering Action declares two: one complete consequential operation and one
 * server-enforced non-consequential read operation.
 */
const MAX_OPERATIONS_PER_SCHEMA = 30;
const EXPECTED_OPERATION_COUNT = EXPECTED_OPERATION_IDS.length;

// Compatibility aliases retained for callers that referenced the original
// single-operation validator constants.
const ROUTE_PATH = FULL_ROUTE_PATH;
const EXPECTED_OPERATION_ID = FULL_OPERATION_ID;

const REQUIRED_FILES = [
  SCHEMA_FILE,
  'src/routes/v1/zoro.js',
  'src/controllers/zoro.controller.js',
  'src/services/zoro/zoroDispatcher.js',
  'src/services/zoro/zoroCatalogue.js',
  'src/services/zoro/zoroPolicy.js',
  'src/services/zoro/zoroRedaction.js',
  'src/services/devopsLog.service.js',
  'src/models/devopsLogEntry.model.js',
  'src/serializers/devopsLog.serializer.js',
  'src/middleware/requireEngineeringActionAuth.js',
  'src/config/engineering.js',
];

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/**
 * Extracts every `operationId:` declared in the schema.
 *
 * Deliberately a text scan rather than a YAML parse: the repository ships no
 * YAML dependency, and the existing gateway validators use the same approach.
 */
function parseSchemaOperationIds(contents) {
  const matches = contents.match(/^\s*operationId:\s*(\S+)\s*$/gm) || [];

  return matches.map((line) => line.replace(/^\s*operationId:\s*/, '').trim());
}

function routeSection(contents, routePath) {
  const marker = `  ${routePath}:`;
  const start = contents.indexOf(marker);

  if (start === -1) {
    return '';
  }

  const nextPath = contents.indexOf('\n  /', start + marker.length);
  const components = contents.indexOf('\ncomponents:', start + marker.length);
  const candidates = [nextPath, components].filter((index) => index !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : contents.length;

  return contents.slice(start, end);
}

/**
 * Extracts the dispatcher ids from one route's path-parameter enum.
 */
function parseDispatcherEnumForRoute(contents, routePath) {
  const section = routeSection(contents, routePath);
  const pattern =
    /name:\s*operationId\s*\n\s*in:\s*path[\s\S]*?enum:\s*\n((?:\s*-\s*\S+\s*\n?)+)/;
  const block = pattern.exec(section);

  if (!block) {
    return [];
  }

  return block[1]
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
}

function parseDispatcherEnum(contents) {
  return parseDispatcherEnumForRoute(contents, FULL_ROUTE_PATH);
}

function hasConsequentialFlag(contents, operationId, expected) {
  return new RegExp(
    `operationId:\\s*${operationId}\\s*\\n\\s*x-openai-isConsequential:\\s*${expected}\\b`
  ).test(contents);
}

function comparePublishedIds(problems, label, published, expected) {
  const missing = expected.filter((id) => !published.includes(id));
  const extra = published.filter((id) => !expected.includes(id));

  if (missing.length > 0) {
    problems.push(`${label} omits implemented dispatcher ids: ${missing.join(', ')}.`);
  }

  if (extra.length > 0) {
    problems.push(`${label} publishes unsupported dispatcher ids: ${extra.join(', ')}.`);
  }
}

function validateEngineeringActionRelease() {
  const problems = [];

  for (const relative of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(ROOT, relative))) {
      problems.push(`Missing required file: ${relative}.`);
    }
  }

  if (problems.length > 0) {
    return problems;
  }

  const schema = read(SCHEMA_FILE);
  const operationIds = parseSchemaOperationIds(schema);

  if (operationIds.length !== EXPECTED_OPERATION_COUNT) {
    problems.push(
      `${SCHEMA_FILE} must declare exactly ${EXPECTED_OPERATION_COUNT} operationIds, ` +
        `found ${operationIds.length}.`
    );
  }

  if (operationIds.length > MAX_OPERATIONS_PER_SCHEMA) {
    problems.push(
      `${SCHEMA_FILE} declares ${operationIds.length} operations, exceeding the GPT Builder ` +
        `limit of ${MAX_OPERATIONS_PER_SCHEMA}.`
    );
  }

  const missingOperationIds = EXPECTED_OPERATION_IDS.filter((id) => !operationIds.includes(id));
  const extraOperationIds = operationIds.filter((id) => !EXPECTED_OPERATION_IDS.includes(id));

  if (missingOperationIds.length > 0) {
    problems.push(`${SCHEMA_FILE} omits operationIds: ${missingOperationIds.join(', ')}.`);
  }

  if (extraOperationIds.length > 0) {
    problems.push(
      `${SCHEMA_FILE} publishes unexpected operationIds: ${extraOperationIds.join(', ')}.`
    );
  }

  for (const routePath of [FULL_ROUTE_PATH, READ_ROUTE_PATH]) {
    if (!schema.includes(routePath)) {
      problems.push(`${SCHEMA_FILE} must publish the ${routePath} route.`);
    }
  }

  if (!schema.includes(PRODUCTION_URL)) {
    problems.push(`${SCHEMA_FILE} must target the production URL ${PRODUCTION_URL}.`);
  }

  if (!hasConsequentialFlag(schema, FULL_OPERATION_ID, true)) {
    problems.push(`${FULL_OPERATION_ID} must set x-openai-isConsequential: true.`);
  }

  if (!hasConsequentialFlag(schema, READ_OPERATION_ID, false)) {
    problems.push(`${READ_OPERATION_ID} must set x-openai-isConsequential: false.`);
  }

  // A generic proxy is explicitly out of scope; the schema must not offer a way
  // to name an arbitrary upstream method or path.
  for (const forbidden of ['upstreamPath', 'targetUrl', 'httpMethod']) {
    if (schema.includes(forbidden)) {
      problems.push(`${SCHEMA_FILE} must not expose a generic proxy field: ${forbidden}.`);
    }
  }

  comparePublishedIds(
    problems,
    `${SCHEMA_FILE} full route`,
    parseDispatcherEnumForRoute(schema, FULL_ROUTE_PATH),
    DISPATCHER_IDS
  );
  comparePublishedIds(
    problems,
    `${SCHEMA_FILE} read route`,
    parseDispatcherEnumForRoute(schema, READ_ROUTE_PATH),
    READ_DISPATCHER_IDS
  );

  return problems;
}

if (require.main === module) {
  const problems = validateEngineeringActionRelease();

  if (problems.length > 0) {
    process.stderr.write(
      `Unified engineering Action release check failed:\n- ${problems.join('\n- ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write('Unified engineering Action release check passed.\n');
}

module.exports = {
  validateEngineeringActionRelease,
  parseSchemaOperationIds,
  parseDispatcherEnum,
  parseDispatcherEnumForRoute,
  hasConsequentialFlag,
  SCHEMA_FILE,
  ROUTE_PATH,
  FULL_ROUTE_PATH,
  READ_ROUTE_PATH,
  PRODUCTION_URL,
  EXPECTED_OPERATION_ID,
  EXPECTED_OPERATION_IDS,
  FULL_OPERATION_ID,
  READ_OPERATION_ID,
  READ_DISPATCHER_IDS,
  EXPECTED_OPERATION_COUNT,
  MAX_OPERATIONS_PER_SCHEMA,
};
