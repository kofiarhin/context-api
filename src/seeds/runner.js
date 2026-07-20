'use strict';

const { REGISTRY, identityOf, identityLabel } = require('./registry');
const { validateSeedData } = require('./validate');

/**
 * Normalizes a value for comparison so an unchanged record is detected reliably.
 *
 * Mongoose array dirty-checking is not dependable for this, so seed idempotency
 * is decided by an explicit value comparison instead.
 */
function normalizeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .filter((key) => key !== '_id' && key !== '__v')
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = normalizeValue(value[key]);
        return accumulator;
      }, {});
  }

  return value === undefined ? null : value;
}

/**
 * Compares only the fields the seed record declares, so database-managed fields
 * such as timestamps never make a record look changed.
 */
function isUnchanged(record, existing) {
  return Object.keys(record).every(
    (key) => JSON.stringify(normalizeValue(record[key])) === JSON.stringify(normalizeValue(existing[key]))
  );
}

function emptyResult() {
  return { inserted: 0, updated: 0, unchanged: 0, failed: 0, errors: [] };
}

async function seedDomain(domain) {
  const result = emptyResult();

  for (const record of domain.records) {
    const filter = identityOf(domain, record);

    try {
      const existing = await domain.Model.findOne(filter);

      if (!existing) {
        await domain.Model.create(record);
        result.inserted += 1;
        continue;
      }

      if (isUnchanged(record, existing.toObject())) {
        result.unchanged += 1;
        continue;
      }

      existing.set(record);
      await existing.save();
      result.updated += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(`${domain.name} (${identityLabel(domain, record)}): ${error.message}`);
    }
  }

  return result;
}

/**
 * Validates the full seed set, then upserts every record by its stable identity.
 *
 * Nothing is written when validation fails, so a bad reference cannot leave the
 * database half-seeded.
 */
async function seedAll(registry = REGISTRY) {
  const problems = validateSeedData(registry);

  if (problems.length > 0) {
    return { ok: false, phase: 'validation', problems, domains: {} };
  }

  const domains = {};
  let failed = 0;

  for (const domain of registry) {
    const result = await seedDomain(domain);
    domains[domain.name] = result;
    failed += result.failed;
  }

  return { ok: failed === 0, phase: 'write', problems: [], domains };
}

/**
 * Destructive. Kept out of the default seed command and only reachable through
 * an explicit reset flag (SPEC §12).
 */
async function resetAll(registry = REGISTRY) {
  const cleared = [];

  for (const domain of registry) {
    await domain.Model.deleteMany({});
    cleared.push(domain.name);
  }

  return cleared;
}

function summarize(result) {
  return Object.values(result.domains).reduce(
    (totals, domain) => ({
      inserted: totals.inserted + domain.inserted,
      updated: totals.updated + domain.updated,
      unchanged: totals.unchanged + domain.unchanged,
      failed: totals.failed + domain.failed,
    }),
    { inserted: 0, updated: 0, unchanged: 0, failed: 0 }
  );
}

module.exports = { seedAll, resetAll, seedDomain, summarize, isUnchanged, normalizeValue };
