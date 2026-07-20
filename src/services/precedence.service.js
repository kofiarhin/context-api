'use strict';

const STATUS_RANK = {
  active: 3,
  approved: 3,
  draft: 2,
  superseded: 1,
  archived: 0,
};

function statusRank(status) {
  return STATUS_RANK[status] ?? 0;
}

function scopeRank(scope) {
  return scope === 'project' ? 1 : 0;
}

function timestamp(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Orders conflicting context records by the precedence rules in SPEC §8.2.
 *
 * 1. project scope before global scope
 * 2. approved or active before draft
 * 3. higher explicit priority
 * 4. higher version
 * 5. most recently updated
 *
 * Comparison is total and deterministic: every tier falls through to the next,
 * and the final tier is a timestamp, so two records never compare as equal
 * unless they are genuinely indistinguishable.
 */
function comparePrecedence(a, b) {
  return (
    scopeRank(b.scope) - scopeRank(a.scope) ||
    statusRank(b.status) - statusRank(a.status) ||
    (b.priority ?? 0) - (a.priority ?? 0) ||
    (b.version ?? 0) - (a.version ?? 0) ||
    timestamp(b.updatedAt) - timestamp(a.updatedAt)
  );
}

function sortByPrecedence(records) {
  return [...records].sort(comparePrecedence);
}

/**
 * Selects the single effective record from a conflicting set.
 *
 * Returns the winner plus the records it outranked, so a caller can surface the
 * conflict rather than silently discarding it (SPEC §8.2, §18).
 */
function resolve(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { selected: null, overridden: [] };
  }

  const [selected, ...overridden] = sortByPrecedence(records);

  return { selected, overridden };
}

module.exports = { comparePrecedence, sortByPrecedence, resolve, STATUS_RANK };
