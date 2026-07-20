'use strict';

const { Schema, model } = require('mongoose');

const { PROJECT_LIFECYCLE_STATES } = require('../utils/enums');
const { sharedFields, applyBaseOptions } = require('./shared');

const milestoneSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 128 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, required: true, trim: true, maxlength: 64 },
    targetDate: { type: Date, default: null },
  },
  { _id: false }
);

const contextReferenceSchema = new Schema(
  {
    type: { type: String, required: true, trim: true, maxlength: 64 },
    reference: { type: String, required: true, trim: true, maxlength: 512 },
  },
  { _id: false }
);

const projectSchema = new Schema({
  projectId: { type: String, required: true, unique: true, trim: true, maxlength: 128 },
  slug: { type: String, required: true, unique: true, trim: true, maxlength: 128 },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  summary: { type: String, trim: true, maxlength: 2000 },
  lifecycleState: {
    type: String,
    enum: PROJECT_LIFECYCLE_STATES,
    required: true,
    default: 'ideation',
  },
  repositoryUrl: { type: String, trim: true, maxlength: 512, default: null },
  liveUrl: { type: String, trim: true, maxlength: 512, default: null },
  technologyStack: { type: [String], default: () => [] },
  currentFocus: { type: String, trim: true, maxlength: 2000, default: null },
  milestones: { type: [milestoneSchema], default: () => [] },
  architectureSummary: { type: String, trim: true, maxlength: 4000, default: null },
  relatedContextReferences: { type: [contextReferenceSchema], default: () => [] },
  ...sharedFields(),
});

applyBaseOptions(projectSchema);

projectSchema.index({ lifecycleState: 1 });
projectSchema.index({ technologyStack: 1 });
projectSchema.index({ updatedAt: -1, projectId: 1 });

module.exports = model('Project', projectSchema, 'projects');
