'use strict';

const { sendCollection, sendResource, buildErrorBody, buildPaginationMeta } = require('../../src/utils/responses');

function mockResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('response envelopes', () => {
  it('builds a collection envelope with count and version', () => {
    const res = mockResponse();

    sendCollection(res, [{ key: 'a' }, { key: 'b' }]);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [{ key: 'a' }, { key: 'b' }],
      meta: { count: 2, version: 'v1' },
    });
  });

  it('includes pagination metadata when pagination is supplied', () => {
    const res = mockResponse();

    sendCollection(res, [{ key: 'a' }], { total: 74, page: 2, pageSize: 20 });

    expect(res.json).toHaveBeenCalledWith({
      data: [{ key: 'a' }],
      meta: { count: 1, total: 74, page: 2, pageSize: 20, totalPages: 4, version: 'v1' },
    });
  });

  it('returns 200 with an empty array for an empty collection', () => {
    const res = mockResponse();

    sendCollection(res, [], { total: 0, page: 1, pageSize: 20 });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      meta: { count: 0, total: 0, page: 1, pageSize: 20, totalPages: 0, version: 'v1' },
    });
  });

  it('builds a single-resource envelope', () => {
    const res = mockResponse();

    sendResource(res, { key: 'primary' });

    expect(res.json).toHaveBeenCalledWith({ data: { key: 'primary' }, meta: { version: 'v1' } });
  });

  it('rounds total pages up for a partial final page', () => {
    expect(buildPaginationMeta({ total: 21, page: 1, pageSize: 20 }).totalPages).toBe(2);
    expect(buildPaginationMeta({ total: 40, page: 1, pageSize: 20 }).totalPages).toBe(2);
  });

  it('builds an error envelope with a correlation ID', () => {
    const body = buildErrorBody({
      code: 'RESOURCE_NOT_FOUND',
      message: 'The requested resource was not found.',
      correlationId: 'abc-123',
    });

    expect(body).toEqual({
      error: { code: 'RESOURCE_NOT_FOUND', message: 'The requested resource was not found.' },
      meta: { correlationId: 'abc-123', version: 'v1' },
    });
  });

  it('omits an empty details array from the error envelope', () => {
    const body = buildErrorBody({ code: 'INTERNAL_SERVER_ERROR', message: 'x', details: [], correlationId: 'c' });

    expect(body.error).not.toHaveProperty('details');
  });

  it('includes details when present', () => {
    const details = [{ field: 'page', message: 'Value must be an integer.' }];
    const body = buildErrorBody({ code: 'VALIDATION_ERROR', message: 'x', details, correlationId: 'c' });

    expect(body.error.details).toEqual(details);
  });
});
