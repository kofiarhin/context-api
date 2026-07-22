'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const schemaPath = path.join(ROOT, 'docs', 'openapi', 'zoro-action.yaml');
const specPath = path.join(ROOT, 'docs', 'GITHUB_GATEWAY_SPEC.md');
const planPath = path.join(ROOT, 'docs', 'GITHUB_GATEWAY_IMPLEMENTATION_PLAN.md');
const productionUrl = 'https://context-api-3b9dfadf403e.herokuapp.com';
const expectedGithubOperationIds = [
  'listGithubRepositories',
  'getGithubContent',
  'listGithubBranches',
  'createGithubBranch',
  'updateGithubBranch',
  'createGithubFile',
  'updateGithubFile',
  'deleteGithubFile',
  'createGithubPullRequest',
  'getGithubPullRequest',
  'updateGithubPullRequest',
  'mergeGithubPullRequest',
];

function fail(message) {
  process.stderr.write(`GitHub gateway release validation failed: ${message}\n`);
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
readRequired(specPath);
readRequired(planPath);

if (schema) {
  if (!schema.includes(`- url: ${productionUrl}`)) {
    fail(`Action schema must use production URL ${productionUrl}`);
  }

  if (schema.includes('https://context-api.herokuapp.com')) {
    fail('Action schema still contains the placeholder Heroku hostname');
  }

  const operationIds = [...schema.matchAll(/^\s+operationId:\s+(\S+)\s*$/gm)].map(
    (match) => match[1]
  );
  const uniqueOperationIds = new Set(operationIds);

  if (operationIds.length !== 27) {
    fail(`expected 27 operation IDs, found ${operationIds.length}`);
  }

  if (uniqueOperationIds.size !== operationIds.length) {
    fail('operation IDs must be unique');
  }

  for (const operationId of expectedGithubOperationIds) {
    if (!uniqueOperationIds.has(operationId)) {
      fail(`missing GitHub operation ID ${operationId}`);
    }
  }

  if (!schema.includes('security: [{ bearerAuth: [] }]')) {
    fail('GitHub operations must declare bearer authentication');
  }
}

if (!process.exitCode) {
  process.stdout.write('GitHub gateway release validation passed.\n');
}
