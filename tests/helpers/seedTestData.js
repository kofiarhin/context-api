'use strict';

const { seedAll } = require('../../src/seeds/runner');

/**
 * Applies the shipped seed set and fails loudly if it is not clean, so a data
 * problem surfaces as a seeding failure rather than a confusing endpoint
 * assertion further down a suite.
 */
async function seedTestData() {
  const result = await seedAll();

  if (!result.ok) {
    const detail =
      result.phase === 'validation'
        ? result.problems.join('; ')
        : Object.values(result.domains)
            .flatMap((domain) => domain.errors)
            .join('; ');

    throw new Error(`Seeding failed during ${result.phase}: ${detail}`);
  }

  return result;
}

module.exports = { seedTestData };
