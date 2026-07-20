'use strict';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Runs a bounded, lean collection query alongside its total count.
 *
 * Archived records are hidden unless the caller explicitly filters by status.
 */
async function paginate(Model, filter, sort, pagination) {
  const effectiveFilter = Object.prototype.hasOwnProperty.call(filter, 'status')
    ? filter
    : { ...filter, status: { $ne: 'archived' } };

  const [items, total] = await Promise.all([
    Model.find(effectiveFilter).sort(sort).skip(pagination.skip).limit(pagination.limit).lean(),
    Model.countDocuments(effectiveFilter),
  ]);

  return { items, total };
}

module.exports = { escapeRegExp, paginate };
