'use strict';

const fs = require('fs');
const path = require('path');
const catalogue = require('../src/services/heroku/herokuCatalogue');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs', 'openapi');
const SERVER = 'https://context-api-3b9dfadf403e.herokuapp.com';

function schemaFor(routes, title) {
  const paths = {};
  for (const route of routes) {
    const openapiPath = `/api/v1/heroku${route.route.replace(/:([A-Za-z]+)/g, '{$1}')}`;
    paths[openapiPath] ||= {};
    const parameters = [...route.route.matchAll(/:([A-Za-z]+)/g)].map((match) => ({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string', minLength: 1 },
    }));
    paths[openapiPath][route.method.toLowerCase()] = {
      operationId: route.operationId,
      summary: `${route.classification}: ${route.operationId}`,
      security: [{ HerokuGatewayBearer: [] }],
      parameters,
      ...(route.method === 'GET' ? {} : {
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
      }),
      responses: {
        '200': { description: 'Successful normalized Heroku response' },
        '202': { description: 'Heroku accepted an asynchronous operation' },
        '400': { description: 'Invalid request' },
        '401': { description: 'Missing or invalid gateway bearer key' },
        '403': { description: 'Policy or approval denied the operation' },
        '409': { description: 'Resource conflict' },
        '412': { description: 'Stale resource precondition' },
        '429': { description: 'Rate limited' },
        '502': { description: 'Heroku unavailable' },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: { title, version: '1.0.0' },
    servers: [{ url: SERVER }],
    components: {
      securitySchemes: {
        HerokuGatewayBearer: { type: 'http', scheme: 'bearer' },
      },
    },
    paths,
  };
}

function group(route) {
  if (/Pipeline|ReviewApp|Build|Slug|Release|Source/.test(route.operationId)) return 'deploy';
  if (/Config|Domain|Sni|Addon/.test(route.operationId)) return 'config';
  if (/Collaborator|Team|Webhook|Space|Account/.test(route.operationId)) return 'admin';
  return 'runtime';
}

function outputs() {
  const files = new Map();
  files.set('zoro-heroku-action.yaml', schemaFor(catalogue, 'Context API Full Heroku Gateway'));
  for (const name of ['runtime', 'deploy', 'config', 'admin']) {
    files.set(`zoro-heroku-${name}-action.yaml`, schemaFor(catalogue.filter((route) => group(route) === name), `Context API Heroku ${name}`));
  }
  return files;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  fs.mkdirSync(OUTPUT, { recursive: true });
  for (const [name, schema] of outputs()) {
    const destination = path.join(OUTPUT, name);
    const expected = serialize(schema);
    if (check) {
      if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== expected) {
        throw new Error(`Heroku Action schema is missing or stale: ${name}`);
      }
    } else {
      fs.writeFileSync(destination, expected);
    }
  }
  console.log(check ? 'Heroku Action schemas are current.' : 'Heroku Action schemas generated.');
}

if (require.main === module) main();
module.exports = { schemaFor, group, outputs, serialize };
