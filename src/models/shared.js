'use strict';

const { Schema } = require('mongoose');

const { STATUSES, SOURCE_TYPES } = require('../utils/enums');

/**
 * Source traceability lets a client distinguish user-approved knowledge from
 * Ideas Hub derived or system-generated records (PRD FR-8).
 */
const sourceSchema = new Schema(
  {
    type: { type: String, enum: SOURCE_TYPES, required: true },
    reference: { type: String, trim: true, maxlength: 512 },
  },
  { _id: false }
);

function sharedFields(overrides = {}) {
  return {
    description: { type: String, trim: true, maxlength: 4000 },
    tags: { type: [String], default: () => [] },
    source: { type: sourceSchema, required: true },
    status: { type: String, enum: STATUSES, required: true, default: 'draft' },
    archivedAt: { type: Date, default: null },
    version: { type: Number, default: 1, min: 1 },
    ...overrides,
  };
}

/**
 * Applies timestamps, the shared cursor index, and safe serialization options.
 *
 * Serializers remain the authoritative allowlist; this is defence in depth so a
 * document that bypasses one can still never leak `_id` or `__v`.
 */
function applyBaseOptions(schema) {
  schema.set('timestamps', true);
  schema.index({ updatedAt: -1, _id: -1 });

  const transform = (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  };

  schema.set('toJSON', { versionKey: false, transform });
  schema.set('toObject', { versionKey: false, transform });

  return schema;
}

module.exports = { sourceSchema, sharedFields, applyBaseOptions };
