'use strict';

const fs = require('fs');
const path = require('path');
const routes = require('../src/services/heroku/herokuRoutes');
const generator = require('./generate-heroku-action-schemas');

function fullPath(file) {
  return path.join(__dirname, '..', file);
}

function read(file) {
  return fs.readFileSync(fullPath(file), 'utf8');
}

const required = [
  'src/routes/v1/heroku.js',
  'src/controllers/heroku.controller.js',
  'src/middleware/requireHerokuActionAuth.js',
  'src/middleware/validateHeroku.js',
  'src/services/heroku/herokuClient.js',
  'src/services/heroku/herokuPolicy.js',
  'src/services/heroku/herokuCatalogue.js',
  'src/services/heroku/herokuCatalogueExtensions.js',
  'src/services/heroku/herokuRoutes.js',
  'src/services/heroku/heroku.service.js',
  'src/config/heroku.js',
  'docs/HEROKU_GATEWAY_SPEC.md',
  'docs/HEROKU_GATEWAY_IMPLEMENTATION_PLAN.md',
  'docs/HEROKU_GATEWAY_RELEASE_CHECKLIST.md',
  'docs/openapi/zoro-heroku-action.yaml',
];

for (const file of required) {
  if (!fs.existsSync(fullPath(file))) throw new Error(`Missing Heroku gateway file: ${file}`);
}

const ids = routes.map((route) => route.operationId);
if (new Set(ids).size !== ids.length) throw new Error('Heroku operation IDs must be unique.');
if (routes.length < 110)
  throw new Error(`Expected full Heroku catalogue, found only ${routes.length} routes.`);

const app = read('src/app.js');
if (!app.includes("'/api/v1/heroku'")) throw new Error('Heroku gateway is not mounted.');
if (!app.includes('requireHerokuActionAuth'))
  throw new Error('Heroku gateway authentication is not mounted.');
if (!app.includes('HEROKU_JSON_BODY_LIMIT'))
  throw new Error('Heroku route-specific body limit is missing.');

const router = read('src/routes/v1/heroku.js');
if (!router.includes("'/operations/:operationId'"))
  throw new Error('Heroku GPT operation dispatcher is missing.');
if (!router.includes('validateHeroku')) throw new Error('Heroku validation middleware is missing.');

const policy = read('src/services/heroku/herokuPolicy.js');
for (const guard of [
  'deleteHerokuApp',
  'transferHerokuApp',
  'scaled to zero',
  'HEROKU_API_TOKEN',
  'ZORO_HEROKU_API_KEY',
  'filterCollection',
  '[REDACTED]',
]) {
  if (!policy.includes(guard)) throw new Error(`Missing Heroku policy guard: ${guard}`);
}

const generated = generator.outputs();
for (const [name, schema] of generated) {
  const idsInSchema = [];
  for (const pathItem of Object.values(schema.paths)) {
    for (const operation of Object.values(pathItem)) {
      if (operation && operation.operationId) idsInSchema.push(operation.operationId);
    }
  }
  if (name !== 'zoro-heroku-action.yaml' && idsInSchema.length > generator.MAX_OPERATIONS) {
    throw new Error(`Builder schema exceeds operation limit: ${name}`);
  }
}

const dispatchSchema = JSON.parse(read('docs/openapi/zoro-heroku-action.yaml'));
const dispatch = dispatchSchema.paths['/api/v1/heroku/operations/{operationId}'];
if (!dispatch || !dispatch.post) throw new Error('Heroku dispatcher OpenAPI operation is missing.');
if (dispatch.post.operationId !== 'executeHerokuOperation')
  throw new Error('Heroku dispatcher operation ID is invalid.');

process.stdout.write(`Heroku gateway release validation passed (${routes.length} routes).\n`);
