'use strict';

const fs = require('fs');
const path = require('path');
const catalogue = require('../src/services/heroku/herokuRoutes');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs', 'openapi');
const SERVER = 'https://context-api-3b9dfadf403e.herokuapp.com';
const MAX_OPERATIONS = 30;

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
      ...(route.method === 'GET'
        ? {}
        : {
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: { type: 'object', additionalProperties: true },
                },
              },
            },
          }),
      responses: {
        '200': { description: 'Successful normalized Heroku response' },
        '201': { description: 'Heroku resource created' },
        '202': { description: 'Heroku accepted an asynchronous operation' },
        '204': { description: 'Heroku operation completed without a response body' },
        '400': { description: 'Invalid request' },
        '401': { description: 'Missing or invalid gateway bearer key' },
        '402': { description: 'Billing verification required' },
        '403': { description: 'Policy or approval denied the operation' },
        '404': { description: 'Resource not found' },
        '409': { description: 'Resource conflict' },
        '412': { description: 'Stale resource precondition' },
        '422': { description: 'Heroku rejected the request' },
        '429': { description: 'Rate limited' },
        '502': { description: 'Heroku unavailable' },
        '504': { description: 'Heroku request timed out' },
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

function chunks(values, size = MAX_OPERATIONS) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function outputs() {
  const files = new Map();
  files.set('zoro-heroku-action.yaml', schemaFor(catalogue, 'Context API Full Heroku Gateway'));

  for (const name of ['runtime', 'deploy', 'config', 'admin']) {
    const grouped = catalogue.filter((route) => group(route) === name);
    chunks(grouped).forEach((routes, index) => {
      const suffix = index === 0 ? '' : `-${index + 1}`;
      files.set(
        `zoro-heroku-${name}${suffix}-action.yaml`,
        schemaFor(routes, `Context API Heroku ${name} ${index + 1}`)
      );
    });
  }

  return files;
}

function countOperations(schema) {
  return Object.values(schema.paths).reduce(
    (count, pathItem) => count + Object.keys(pathItem).filter((key) => ['get', 'post', 'patch', 'delete'].includes(key)).length,
    0
  );
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  fs.mkdirSync(OUTPUT, { recursive: true });

  for (const [name, schema] of outputs()) {
    if (name !== 'zoro-heroku-action.yaml' && countOperations(schema) > MAX_OPERATIONS) {
      throw new Error(`Heroku Builder schema exceeds ${MAX_OPERATIONS} operations: ${name}`);
    }

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
module.exports = { schemaFor, group, chunks, outputs, serialize, countOperations, MAX_OPERATIONS };
