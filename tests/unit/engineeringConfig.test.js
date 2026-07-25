'use strict';

const { getEngineeringConfig } = require('../../src/config/engineering');

const KEY = 'e'.repeat(32);

describe('engineering gateway configuration', () => {
  test('reports an unconfigured gateway without throwing', () => {
    const config = getEngineeringConfig({}, {});

    expect(config.zoroEngineeringApiKey).toBeNull();
    expect(config.engineeringConfigured).toBe(false);
  });

  test('reads the bearer key from the explicit source', () => {
    const config = getEngineeringConfig({}, { ZORO_ENGINEERING_API_KEY: KEY });

    expect(config.zoroEngineeringApiKey).toBe(KEY);
    expect(config.engineeringConfigured).toBe(true);
  });

  test('rejects a bearer key that carries too little entropy', () => {
    expect(() => getEngineeringConfig({}, { ZORO_ENGINEERING_API_KEY: 'short' })).toThrow(
      /ZORO_ENGINEERING_API_KEY must be at least 32 characters/
    );
  });

  test('never echoes the key value in a configuration error', () => {
    try {
      getEngineeringConfig({}, { ZORO_ENGINEERING_API_KEY: 'short-secret-value' });
      throw new Error('expected a configuration error');
    } catch (error) {
      expect(error.message).not.toContain('short-secret-value');
    }
  });

  test('falls back to a value already present on the base environment', () => {
    const config = getEngineeringConfig({ zoroEngineeringApiKey: KEY }, {});

    expect(config.zoroEngineeringApiKey).toBe(KEY);
  });
});
