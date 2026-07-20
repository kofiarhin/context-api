'use strict';

const { validateQuery, validateIdentifierParam, PAGINATION_DEFAULTS } = require('../../src/validation/common');
const schemas = require('../../src/validation/schemas');
const { ValidationError } = require('../../src/utils/errors');

const SCHEMA = {
  status: { type: 'enum', values: ['draft', 'active'] },
  project: { type: 'identifier', target: 'projectId' },
  updatedAfter: { type: 'isoDate' },
  query: { type: 'search', maxLength: 10 },
};

function expectValidationError(run, expectedFields) {
  try {
    run();
    throw new Error('Expected a ValidationError to be thrown.');
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.map((detail) => detail.field).sort()).toEqual(expectedFields.sort());
    return error;
  }
}

describe('validateIdentifierParam', () => {
  it.each(['context-api', 'primary', 'a.b_c:d-1', 'A1'])('accepts %s', (value) => {
    expect(validateIdentifierParam(value, 'key')).toBe(value);
  });

  it('trims surrounding whitespace', () => {
    expect(validateIdentifierParam('  context-api  ', 'key')).toBe('context-api');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['leading separator', '-leading'],
    ['path traversal', '../etc/passwd'],
    ['mongo operator', '$ne'],
    ['whitespace inside', 'has space'],
  ])('rejects %s', (_label, value) => {
    expectValidationError(() => validateIdentifierParam(value, 'key'), ['key']);
  });

  it('rejects an identifier longer than the maximum length', () => {
    expectValidationError(() => validateIdentifierParam('a'.repeat(129), 'key'), ['key']);
  });
});

describe('validateQuery', () => {
  it('returns defaults when no query is supplied', () => {
    const { filters, pagination } = validateQuery({}, SCHEMA);

    expect(filters).toEqual({});
    expect(pagination).toEqual({
      page: PAGINATION_DEFAULTS.page,
      pageSize: PAGINATION_DEFAULTS.pageSize,
      skip: 0,
      limit: 20,
    });
  });

  it('maps a public parameter onto its internal filter key', () => {
    const { filters } = validateQuery({ project: 'context-api' }, SCHEMA);

    expect(filters).toEqual({ projectId: 'context-api' });
  });

  it('parses an ISO-8601 date into a Date', () => {
    const { filters } = validateQuery({ updatedAfter: '2026-01-01T00:00:00.000Z' }, SCHEMA);

    expect(filters.updatedAfter).toBeInstanceOf(Date);
    expect(filters.updatedAfter.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects an unknown query parameter', () => {
    expectValidationError(() => validateQuery({ nope: 'x' }, SCHEMA), ['nope']);
  });

  it('rejects an invalid enum value', () => {
    expectValidationError(() => validateQuery({ status: 'archived' }, SCHEMA), ['status']);
  });

  it('rejects an unparseable date', () => {
    expectValidationError(() => validateQuery({ updatedAfter: 'last-tuesday' }, SCHEMA), [
      'updatedAfter',
    ]);
  });

  it('rejects a repeated parameter rather than picking one value', () => {
    expectValidationError(() => validateQuery({ status: ['draft', 'active'] }, SCHEMA), ['status']);
  });

  it('rejects a search value beyond its maximum length', () => {
    expectValidationError(() => validateQuery({ query: 'x'.repeat(11) }, SCHEMA), ['query']);
  });

  it('reports every problem in one error', () => {
    expectValidationError(() => validateQuery({ status: 'nope', unknown: '1', page: 'x' }, SCHEMA), [
      'unknown',
      'status',
      'page',
    ]);
  });

  describe('pagination boundaries', () => {
    it('accepts the maximum page size', () => {
      const { pagination } = validateQuery({ pageSize: '100' }, SCHEMA);
      expect(pagination.pageSize).toBe(100);
    });

    it('computes skip from page and page size', () => {
      const { pagination } = validateQuery({ page: '3', pageSize: '25' }, SCHEMA);
      expect(pagination.skip).toBe(50);
      expect(pagination.limit).toBe(25);
    });

    it.each(['0', '-1', '101', '1.5', 'many'])('rejects pageSize %s', (pageSize) => {
      expectValidationError(() => validateQuery({ pageSize }, SCHEMA), ['pageSize']);
    });

    it.each(['0', '-2', '10001'])('rejects page %s', (page) => {
      expectValidationError(() => validateQuery({ page }, SCHEMA), ['page']);
    });
  });
});

describe('domain query schemas', () => {
  it('allows only documented coding convention filters', () => {
    const { filters } = schemas.validateCodingConventionQuery({
      scope: 'project',
      technology: 'node',
      layer: 'backend',
      project: 'context-api',
      status: 'active',
    });

    expect(filters).toEqual({
      scope: 'project',
      technology: 'node',
      layer: 'backend',
      projectId: 'context-api',
      status: 'active',
    });
  });

  it('maps the instruction set client filter onto applicableClient', () => {
    const { filters } = schemas.validateInstructionSetQuery({ client: 'architect' });

    expect(filters).toEqual({ applicableClient: 'architect' });
  });

  it('rejects pagination on the profile endpoint, which returns a single record', () => {
    expectValidationError(() => schemas.validateProfileQuery({ page: '2' }), ['page']);
  });

  it('rejects a task status that is not a task lifecycle value', () => {
    expectValidationError(() => schemas.validateTaskQuery({ status: 'approved' }), ['status']);
  });
});
