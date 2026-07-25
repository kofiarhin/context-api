'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { DISPATCHER_IDS } = require('../src/services/zoro/zoroCatalogue');

const ROOT = path.resolve(__dirname, '..');
const PRODUCTION_URL = 'https://context-api-3b9dfadf403e.herokuapp.com';
const SCHEMA_FILE = 'docs/openapi/zoro-single-full-engineering-action.yaml';
const ROUTE_PATH = '/api/v1/zoro/operations/{operationId}';
const EXPECTED_OPERATION_ID = 'executeZoroEngineeringOperation';

/**
 * A GPT Builder Action schema may declare at most 30 operations. The unified
 * engineering Action declares exactly one, which is the entire reason it exists:
 * the combined GitHub, Vercel, Heroku, context, and operations-log surface is far
 * larger than 30 and cannot be published directly.
 */
const MAX_OPERATIONS_PER_SCHEMA = 30;
const EXPECTED_OPERATION_COUNT = 1;

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

/**
 * Extracts the dispatcher ids from the path parameter enum.
 */
function parseDispatcherEnum(contents) {
  const block =
    /name:\s*operationId\s*\n\s*in:\s*path[\s\S]*?enum:\s*\n((?:\s*-\s*\S+\s*\n)+)/.exec(contents);

  if (!block) {
    return [];
  }

  return block[1]
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
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
      `${SCHEMA_FILE} must declare exactly ${EXPECTED_OPERATION_COUNT} operationId, found ${operationIds.length}.`
    );
  }

  if (operationIds.length > MAX_OPERATIONS_PER_SCHEMA) {
    problems.push(
      `${SCHEMA_FILE} declares ${operationIds.length} operations, exceeding the GPT Builder limit of ${MAX_OPERATIONS_PER_SCHEMA}.`
    );
  }

  if (operationIds.length > 0 && operationIds[0] !== EXPECTED_OPERATION_ID) {
    problems.push(
      `${SCHEMA_FILE} must declare operationId "${EXPECTED_OPERATION_ID}", found "${operationIds[0]}".`
    );
  }

  if (!schema.includes(ROUTE_PATH)) {
    problems.push(`${SCHEMA_FILE} must publish the ${ROUTE_PATH} route.`);
  }

  if (!schema.includes(PRODUCTION_URL)) {
    problems.push(`${SCHEMA_FILE} must target the production URL ${PRODUCTION_URL}.`);
  }

  // A generic proxy is explicitly out of scope; the schema must not offer a way
  // to name an arbitrary upstream method or path.
  for (const forbidden of ['upstreamPath', 'targetUrl', 'httpMethod']) {
    if (schema.includes(forbidden)) {
      problems.push(`${SCHEMA_FILE} must not expose a generic proxy field: ${forbidden}.`);
    }
  }

  const published = parseDispatcherEnum(schema);
  const missing = DISPATCHER_IDS.filter((id) => !published.includes(id));
  const extra = published.filter((id) => !DISPATCHER_IDS.includes(id));

  if (missing.length > 0) {
    problems.push(`${SCHEMA_FILE} omits implemented dispatcher ids: ${missing.join(', ')}.`);
  }

  if (extra.length > 0) {
    problems.push(`${SCHEMA_FILE} publishes unimplemented dispatcher ids: ${extra.join(', ')}.`);
  }

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
  SCHEMA_FILE,
  ROUTE_PATH,
  PRODUCTION_URL,
  REQUIRED_FILES,
  EXPECTED_OPERATION_ID,
  EXPECTED_OPERATION_COUNT,
  MAX_OPERATIONS_PER_SCHEMA,
};
