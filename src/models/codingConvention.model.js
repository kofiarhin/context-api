'use strict';

const { Schema, model } = require('mongoose');

const { SCOPES } = require('../utils/enums');
const { sharedFields, applyBaseOptions } = require('./shared');

const codingConventionSchema = new Schema({
  key: { type: String, required: true, unique: true, trim: true, maxlength: 128 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  rules: { type: [String], default: () => [] },
  scope: { type: String, enum: SCOPES, required: true, default: 'global' },
  technology: { type: [String], default: () => [] },
  layer: { type: [String], default: () => [] },
  // Stable project identifier, required only when the convention is project-scoped.
  projectId: { type: String, trim: true, maxlength: 128, default: null },
  priority: { type: Number, default: 0 },
  ...sharedFields(),
});

applyBaseOptions(codingConventionSchema);

codingConventionSchema.index({ scope: 1, status: 1 });
codingConventionSchema.index({ technology: 1 });
codingConventionSchema.index({ layer: 1 });
codingConventionSchema.index({ projectId: 1, scope: 1, status: 1 });
codingConventionSchema.index({ updatedAt: -1, key: 1 });

codingConventionSchema.path('projectId').validate(function validateProjectScope(value) {
  if (this.scope === 'project') {
    return typeof value === 'string' && value.trim().length > 0;
  }

  return true;
}, 'projectId is required when scope is "project".');

module.exports = model('CodingConvention', codingConventionSchema, 'coding_conventions');
