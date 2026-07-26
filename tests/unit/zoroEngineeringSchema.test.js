'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  validateEngineeringActionRelease,
  parseSchemaOperationIds,
  parseDispatcherEnum,
  parseDispatcherEnumForRoute,
  hasConsequentialFlag,
  SCHEMA_FILE,
  FULL_ROUTE_PATH,
  READ_ROUTE_PATH,
  PRODUCTION_URL,
  EXPECTED_OPERATION_IDS,
  FULL_OPERATION_ID,
  READ_OPERATION_ID,
  READ_DISPATCHER_IDS,
  EXPECTED_OPERATION_COUNT,
  MAX_OPERATIONS_PER_SCHEMA,
} = require('../../scripts/validate-engineering-action-release');
const { DISPATCHER_IDS } = require('../../src/services/zoro/zoroCatalogue');

const ROOT = path.resolve(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(ROOT, SCHEMA_FILE), 'utf8');

describe('unified engineering Action schema', () => {
  it('declares exactly the complete and read-only operationIds', () => {
    const operationIds = parseSchemaOperationIds(schema);

    expect(operationIds).toHaveLength(EXPECTED_OPERATION_COUNT);
    expect(operationIds).toEqual(EXPECTED_OPERATION_IDS);
  });

  it('stays within the 30-operation GPT Builder ceiling', () => {
    expect(parseSchemaOperationIds(schema).length).toBeLessThanOrEqual(MAX_OPERATIONS_PER_SCHEMA);
  });

  it('publishes both routes against the production host', () => {
    expect(schema).toContain(FULL_ROUTE_PATH);
    expect(schema).toContain(READ_ROUTE_PATH);
    expect(schema).toContain(PRODUCTION_URL);
  });

  it('marks only the server-enforced read operation as non-consequential', () => {
    expect(hasConsequentialFlag(schema, FULL_OPERATION_ID, true)).toBe(true);
    expect(hasConsequentialFlag(schema, READ_OPERATION_ID, false)).toBe(true);
  });

  it('publishes every implemented dispatcher through the complete route', () => {
    expect(parseDispatcherEnum(schema).sort()).toEqual([...DISPATCHER_IDS].sort());
  });

  it('publishes only dispatchers containing read operations through the read route', () => {
    expect(parseDispatcherEnumForRoute(schema, READ_ROUTE_PATH).sort()).toEqual(
      [...READ_DISPATCHER_IDS].sort()
    );
  });

  it('never exposes a generic method or path proxy field', () => {
    for (const forbidden of ['upstreamPath', 'targetUrl', 'httpMethod']) {
      expect(schema).not.toContain(forbidden);
    }
  });

  it('documents the bearer scheme without embedding any provider credential', () => {
    expect(schema).toContain('ZORO_ENGINEERING_API_KEY');
    expect(schema).not.toContain('GITHUB_PRIVATE_KEY');
    expect(schema).not.toContain('VERCEL_TOKEN');
    expect(schema).not.toContain('HEROKU_API_TOKEN');
  });

  it('passes the full release check', () => {
    expect(validateEngineeringActionRelease()).toEqual([]);
  });
});
