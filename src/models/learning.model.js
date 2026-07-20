'use strict';

const { Schema, model } = require('mongoose');

const { LEARNING_CATEGORIES, REVIEW_STATUSES } = require('../utils/enums');
const { sharedFields, applyBaseOptions } = require('./shared');

const evidenceSchema = new Schema(
  {
    type: { type: String, required: true, trim: true, maxlength: 64 },
    reference: { type: String, required: true, trim: true, maxlength: 512 },
    note: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const learningSchema = new Schema({
  learningId: { type: String, required: true, unique: true, trim: true, maxlength: 128 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  content: { type: String, required: true, trim: true, maxlength: 8000 },
  category: { type: String, enum: LEARNING_CATEGORIES, required: true },
  // Null for learnings that apply across every project.
  projectId: { type: String, trim: true, maxlength: 128, default: null },
  evidence: { type: [evidenceSchema], default: () => [] },
  reviewStatus: { type: String, enum: REVIEW_STATUSES, required: true, default: 'unreviewed' },
  // Stable learningId this record replaces.
  supersedes: { type: String, trim: true, maxlength: 128, default: null },
  ...sharedFields(),
});

applyBaseOptions(learningSchema);

learningSchema.index({ category: 1, projectId: 1, status: 1 });
learningSchema.index({ updatedAt: -1, learningId: 1 });

/**
 * Guards PRD §7.8: an unreviewed observation must not be published as durable
 * approved knowledge.
 */
learningSchema.path('status').validate(function validateReviewedBeforePublished(value) {
  if (value === 'approved' || value === 'active') {
    return this.reviewStatus === 'reviewed';
  }

  return true;
}, 'A learning may only be approved or active once reviewStatus is "reviewed".');

module.exports = model('Learning', learningSchema, 'learnings');
