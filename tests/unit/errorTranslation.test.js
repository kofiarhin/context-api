'use strict';

const { translate } = require('../../src/middleware/errorHandler');
const {
  ValidationError,
  ResourceNotFoundError,
  DatabaseUnavailableError,
  InternalServerError,
} = require('../../src/utils/errors');

function namedError(name, extra = {}) {
  const error = new Error('raw driver detail: mongodb://user:secret@cluster0.internal:27017');
  error.name = name;
  Object.assign(error, extra);
  return error;
}

describe('error translation', () => {
  it('passes application errors through unchanged', () => {
    const original = new ResourceNotFoundError('Project "x" was not found.');

    expect(translate(original)).toBe(original);
  });

  it.each([
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoServerSelectionError',
    'MongoNotConnectedError',
    'MongoTopologyClosedError',
  ])('maps %s to DATABASE_UNAVAILABLE', (name) => {
    const translated = translate(namedError(name));

    expect(translated).toBeInstanceOf(DatabaseUnavailableError);
    expect(translated.statusCode).toBe(503);
    expect(translated.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('never forwards raw driver detail into the client-facing message', () => {
    const translated = translate(namedError('MongoServerSelectionError'));

    expect(translated.message).not.toContain('secret');
    expect(translated.message).not.toContain('cluster0.internal');
    expect(translated.message).toBe('The database is currently unavailable.');
  });

  it('maps a CastError to a validation error naming the field', () => {
    const translated = translate(namedError('CastError', { path: 'projectId' }));

    expect(translated).toBeInstanceOf(ValidationError);
    expect(translated.statusCode).toBe(400);
    expect(translated.details).toEqual([
      { field: 'projectId', message: 'Value is not a valid identifier.' },
    ]);
  });

  it('maps a schema validation error to field-level details without raw messages', () => {
    const translated = translate(
      namedError('ValidationError', {
        errors: { status: { message: 'raw mongoose text' }, key: { message: 'raw mongoose text' } },
      })
    );

    expect(translated).toBeInstanceOf(ValidationError);
    expect(translated.details.map((detail) => detail.field).sort()).toEqual(['key', 'status']);
    translated.details.forEach((detail) => {
      expect(detail.message).toBe('Value failed schema validation.');
    });
  });

  it('maps malformed JSON to a validation error', () => {
    const error = new Error('Unexpected token');
    error.type = 'entity.parse.failed';

    const translated = translate(error);

    expect(translated).toBeInstanceOf(ValidationError);
    expect(translated.details[0].field).toBe('body');
  });

  it('maps an oversized body to a validation error', () => {
    const error = new Error('too large');
    error.type = 'entity.too.large';

    expect(translate(error)).toBeInstanceOf(ValidationError);
  });

  it('falls back to a generic internal error for anything unrecognized', () => {
    const translated = translate(namedError('TypeError'));

    expect(translated).toBeInstanceOf(InternalServerError);
    expect(translated.statusCode).toBe(500);
    expect(translated.message).toBe('An unexpected error occurred.');
    expect(translated.message).not.toContain('secret');
  });
});
