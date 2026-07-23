'use strict';

const schemas = require('../../src/validation/schemas');
const { ValidationError } = require('../../src/utils/errors');

function expectValidationError(run, field) {
  try {
    run();
    throw new Error('Expected validation to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.details.map((detail) => detail.field)).toContain(field);
  }
}

describe('optimized read query validation', () => {
  it('preserves offset detail reads and totals by default', () => {
    const { pagination } = schemas.validateProjectQuery({ page: '2', pageSize: '10' });

    expect(pagination).toMatchObject({
      mode: 'offset',
      page: 2,
      pageSize: 10,
      skip: 10,
      limit: 10,
      includeTotal: true,
      view: 'detail',
    });
  });

  it('defaults cursor reads to summaries without totals', () => {
    const { pagination } = schemas.validateProjectQuery({ limit: '5' });

    expect(pagination).toMatchObject({
      mode: 'cursor',
      limit: 5,
      cursor: null,
      includeTotal: false,
      view: 'summary',
    });
  });

  it('parses explicit read overrides and delta timestamps', () => {
    const { pagination } = schemas.validateTaskQuery({
      limit: '7',
      view: 'detail',
      includeTotal: 'true',
      updatedAfter: '2026-01-01T00:00:00.000Z',
    });

    expect(pagination.limit).toBe(7);
    expect(pagination.view).toBe('detail');
    expect(pagination.includeTotal).toBe(true);
    expect(pagination.updatedAfter).toBeInstanceOf(Date);
  });

  it('rejects mixed cursor and offset pagination', () => {
    expectValidationError(
      () => schemas.validateProjectQuery({ page: '1', limit: '5' }),
      'pagination'
    );
  });

  it('rejects invalid cursors and boolean flags', () => {
    expectValidationError(
      () => schemas.validateProjectQuery({ cursor: 'not valid', includeTotal: 'yes' }),
      'cursor'
    );
  });
});
