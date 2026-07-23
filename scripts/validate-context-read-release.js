'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const schemaPath = path.join(ROOT, 'docs', 'openapi', 'zoro-context-read-action.yaml');
const docsPath = path.join(ROOT, 'docs', 'CONTEXT_READ_MODEL.md');
const productionUrl = 'https://context-api-3b9dfadf403e.herokuapp.com';
const expectedOperationIds = ['resolveContext', 'listProjectsOptimized', 'listTasksOptimized'];

function fail(message) {
  process.stderr.write(`Context read release validation failed: ${message}\n`);
  process.exitCode = 1;
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing required file ${path.relative(ROOT, filePath)}`);
    return '';
  }

  return fs.readFileSync(filePath, 'utf8');
}

const schema = readRequired(schemaPath);
const docs = readRequired(docsPath);

if (schema) {
  if (!schema.includes(`- url: ${productionUrl}`)) {
    fail(`Action schema must use production URL ${productionUrl}`);
  }

  const operationIds = [...schema.matchAll(/^\s+operationId:\s+(\S+)\s*$/gm)].map(
    (match) => match[1]
  );

  if (operationIds.length !== expectedOperationIds.length) {
    fail(`expected ${expectedOperationIds.length} operation IDs, found ${operationIds.length}`);
  }

  if (new Set(operationIds).size !== operationIds.length) {
    fail('operation IDs must be unique');
  }

  for (const operationId of expectedOperationIds) {
    if (!operationIds.includes(operationId)) {
      fail(`missing operation ID ${operationId}`);
    }
  }

  for (const parameter of ['cursor', 'limit', 'view', 'includeTotal', 'updatedAfter']) {
    if (!schema.includes(`name: ${parameter}`)) {
      fail(`missing optimized read parameter ${parameter}`);
    }
  }

  if (schema.includes('bearerAuth')) {
    fail('read-only context Action must not declare GitHub bearer authentication');
  }
}

if (docs) {
  for (const requiredText of [
    '/api/v1/context/resolve',
    'Cursor mode',
    'Optional totals',
    'Conditional requests',
  ]) {
    if (!docs.includes(requiredText)) {
      fail(`read-model documentation is missing ${requiredText}`);
    }
  }
}

if (!process.exitCode) {
  process.stdout.write('Context read release validation passed.\n');
}
