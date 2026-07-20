'use strict';

const { Schema, model } = require('mongoose');

const { SCOPES } = require('../utils/enums');
const { sharedFields, applyBaseOptions } = require('./shared');

/**
 * Produces the lookup key for a term. Used by both seeds and request handling so
 * "Shared Understanding", "shared-understanding", and "SHARED_UNDERSTANDING"
 * all resolve to the same entry.
 */
function normalizeTerm(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const glossaryEntrySchema = new Schema({
  term: { type: String, required: true, trim: true, maxlength: 200 },
  normalizedKey: { type: String, required: true, unique: true, trim: true, maxlength: 200 },
  definition: { type: String, required: true, trim: true, maxlength: 4000 },
  aliases: { type: [String], default: () => [] },
  scope: { type: String, enum: SCOPES, required: true, default: 'global' },
  relatedTerms: { type: [String], default: () => [] },
  ...sharedFields(),
});

applyBaseOptions(glossaryEntrySchema);

glossaryEntrySchema.index({ aliases: 1 });
glossaryEntrySchema.index({ scope: 1, status: 1 });
glossaryEntrySchema.index({ updatedAt: -1, normalizedKey: 1 });

const GlossaryEntry = model('GlossaryEntry', glossaryEntrySchema, 'glossary_entries');

GlossaryEntry.normalizeTerm = normalizeTerm;

module.exports = GlossaryEntry;
module.exports.normalizeTerm = normalizeTerm;
