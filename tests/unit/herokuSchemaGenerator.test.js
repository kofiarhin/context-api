'use strict';

const routes = require('../../src/services/heroku/herokuRoutes');
const generator = require('../../scripts/generate-heroku-action-schemas');

describe('Heroku Action schema generator', () => {
  test('includes every registered route in the canonical schema', () => {
    const schema = generator.schemaFor(routes, 'test');
    expect(generator.countOperations(schema)).toBe(routes.length);
    const operationIds = Object.values(schema.paths).flatMap((pathItem) =>
      Object.values(pathItem).map((operation) => operation.operationId)
    );
    expect(new Set(operationIds).size).toBe(routes.length);
  });

  test('splits Builder schemas below the operation limit', () => {
    const outputs = generator.outputs();
    for (const [name, schema] of outputs) {
      if (name === 'zoro-heroku-action.yaml') continue;
      expect(generator.countOperations(schema)).toBeLessThanOrEqual(generator.MAX_OPERATIONS);
    }
  });

  test('uses production host and bearer security', () => {
    const schema = generator.schemaFor(routes.slice(0, 1), 'test');
    expect(schema.servers[0].url).toBe('https://context-api-3b9dfadf403e.herokuapp.com');
    expect(schema.components.securitySchemes.HerokuGatewayBearer).toEqual({
      type: 'http',
      scheme: 'bearer',
    });
  });
});
