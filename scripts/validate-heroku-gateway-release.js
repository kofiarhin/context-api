'use strict';

const fs = require('fs');
const path = require('path');
const catalogue = require('../src/services/heroku/herokuCatalogue');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

const required = [
  'src/routes/v1/heroku.js',
  'src/controllers/heroku.controller.js',
  'src/middleware/requireHerokuActionAuth.js',
  'src/services/heroku/herokuClient.js',
  'src/services/heroku/herokuPolicy.js',
  'src/services/heroku/herokuCatalogue.js',
  'src/services/heroku/heroku.service.js',
  'src/config/heroku.js',
  'docs/HEROKU_GATEWAY_SPEC.md',
  'docs/HEROKU_GATEWAY_IMPLEMENTATION_PLAN.md',
];

for (const file of required) {
  if (!fs.existsSync(path.join(__dirname, '..', file))) throw new Error(`Missing Heroku gateway file: ${file}`);
}

const ids = catalogue.map((route) => route.operationId);
if (new Set(ids).size !== ids.length) throw new Error('Heroku operation IDs must be unique.');
if (catalogue.length < 100) throw new Error(`Expected full Heroku catalogue, found only ${catalogue.length} routes.`);

const app = read('src/app.js');
if (!app.includes("'/api/v1/heroku'")) throw new Error('Heroku gateway is not mounted.');
if (!app.includes('requireHerokuActionAuth')) throw new Error('Heroku gateway authentication is not mounted.');

const policy = read('src/services/heroku/herokuPolicy.js');
for (const guard of ['deleteHerokuApp', 'transferHerokuApp', 'scaled to zero', 'HEROKU_API_TOKEN', 'ZORO_HEROKU_API_KEY']) {
  if (!policy.includes(guard)) throw new Error(`Missing Heroku self-protection guard: ${guard}`);
}

console.log(`Heroku gateway release validation passed (${catalogue.length} routes).`);
