'use strict';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Runs a bounded, lean collection query alongside its total count.
 *
 * `lean()` is used throughout because responses are built by serializers, so
 * hydrated Mongoose documents would be wasted work.
 */
async function paginate(Model, filter, sort, pagination) {
  const [items, total] = await Promise.all([
    Model.find(filter).sort(sort).skip(pagination.skip).limit(pagination.limit).lean(),
    Model.countDocuments(filter),
  ]);

  return { items, total };
}

module.exports = { escapeRegExp, paginate };
