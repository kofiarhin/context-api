'use strict';

const { Schema, model } = require('mongoose');

const { WORKFLOW_STAGES } = require('../utils/enums');
const { sharedFields, applyBaseOptions } = require('./shared');

/**
 * Structured alternative to a flat instruction list. Kept explicit rather than a
 * mixed object so responses stay predictable for clients.
 */
const contentSchema = new Schema(
  {
    format: { type: String, enum: ['markdown', 'text'], required: true },
    body: { type: String, required: true, maxlength: 20000 },
  },
  { _id: false }
);

const instructionSetSchema = new Schema({
  key: { type: String, required: true, trim: true, maxlength: 128 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  instructions: { type: [String], default: () => [] },
  content: { type: contentSchema, default: null },
  workflowStage: { type: String, enum: WORKFLOW_STAGES, required: true },
  applicableClients: { type: [String], default: () => [] },
  ...sharedFields(),
});

applyBaseOptions(instructionSetSchema);

// A key may exist at several versions; each version is stored once.
instructionSetSchema.index({ key: 1, version: -1 }, { unique: true });
instructionSetSchema.index({ status: 1 });
instructionSetSchema.index({ workflowStage: 1 });
instructionSetSchema.index({ applicableClients: 1 });

module.exports = model('InstructionSet', instructionSetSchema, 'instruction_sets');
