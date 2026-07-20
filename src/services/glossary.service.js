'use strict';

const GlossaryEntry = require('../models/glossaryEntry.model');
const { normalizeTerm } = require('../models/glossaryEntry.model');
const { PUBLISHED_STATUSES } = require('../utils/enums');
const { AmbiguousResourceError } = require('../utils/errors');
const { escapeRegExp, paginate } = require('./queryHelpers');

const SORT = { updatedAt: -1, normalizedKey: 1 };

function buildFilter(filters = {}) {
  const filter = {};

  if (filters.scope) {
    filter.scope = filters.scope;
  }

  if (filters.status) {
    filter.status = filters.status;
  }

  if (filters.query) {
    const pattern = new RegExp(escapeRegExp(filters.query), 'i');
    filter.$or = [{ term: pattern }, { aliases: pattern }, { definition: pattern }];
  }

  return filter;
}

async function listGlossaryEntries(filters, pagination) {
  return paginate(GlossaryEntry, buildFilter(filters), SORT, pagination);
}

/**
 * Resolves a term to a single entry.
 *
 * The normalized key is authoritative and checked first. Aliases are only
 * consulted when no key matches, and an alias shared by several published
 * entries raises an explicit conflict rather than returning an arbitrary one.
 */
async function getGlossaryEntryByTerm(rawTerm) {
  const normalized = normalizeTerm(rawTerm);

  if (!normalized) {
    return null;
  }

  const byKey = await GlossaryEntry.findOne({
    normalizedKey: normalized,
  }).lean();

  if (byKey) {
    return byKey;
  }

  const byAlias = await GlossaryEntry.find({
    aliases: normalized,
    status: { $in: PUBLISHED_STATUSES },
  })
    .sort(SORT)
    .lean();

  if (byAlias.length > 1) {
    throw new AmbiguousResourceError(
      `The alias "${normalized}" matches more than one glossary entry.`,
      byAlias.map((entry) => ({
        field: 'term',
        message: `Matches "${entry.normalizedKey}".`,
      }))
    );
  }

  return byAlias[0] || null;
}

module.exports = {
  listGlossaryEntries,
  getGlossaryEntryByTerm,
  buildFilter,
  SORT,
};
