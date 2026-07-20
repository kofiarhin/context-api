'use strict';

const { Schema, model } = require('mongoose');

const { sharedFields, applyBaseOptions } = require('./shared');

const canonicalFileSchema = new Schema(
  {
    path: { type: String, required: true, trim: true, maxlength: 512 },
    responsibility: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const layoutEntrySchema = new Schema(
  {
    path: { type: String, required: true, trim: true, maxlength: 512 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const definitionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 128 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { _id: false }
);

const relationshipSchema = new Schema(
  {
    from: { type: String, required: true, trim: true, maxlength: 128 },
    to: { type: String, required: true, trim: true, maxlength: 128 },
    relationship: { type: String, required: true, trim: true, maxlength: 128 },
  },
  { _id: false }
);

const updateRoutingSchema = new Schema(
  {
    change: { type: String, required: true, trim: true, maxlength: 512 },
    destination: { type: String, required: true, trim: true, maxlength: 512 },
  },
  { _id: false }
);

const ideasHubContextSchema = new Schema({
  section: { type: String, required: true, unique: true, trim: true, maxlength: 128 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  canonicalFiles: { type: [canonicalFileSchema], default: () => [] },
  repositoryLayout: { type: [layoutEntrySchema], default: () => [] },
  lifecycleDefinitions: { type: [definitionSchema], default: () => [] },
  workflowDefinitions: { type: [definitionSchema], default: () => [] },
  sourceOfTruthRules: { type: [String], default: () => [] },
  recordRelationships: { type: [relationshipSchema], default: () => [] },
  updateRoutingRules: { type: [updateRoutingSchema], default: () => [] },
  ...sharedFields(),
});

applyBaseOptions(ideasHubContextSchema);

ideasHubContextSchema.index({ status: 1 });
ideasHubContextSchema.index({ updatedAt: -1, section: 1 });

module.exports = model('IdeasHubContext', ideasHubContextSchema, 'ideas_hub_context');
