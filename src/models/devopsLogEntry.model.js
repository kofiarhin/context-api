'use strict';

const { Schema, model } = require('mongoose');

const { DEVOPS_LOG_STATES } = require('../utils/enums');
const { applyBaseOptions } = require('./shared');

const referenceSchema = new Schema(
  {
    type: { type: String, required: true, trim: true, maxlength: 64 },
    reference: { type: String, required: true, trim: true, maxlength: 512 },
  },
  { _id: false }
);

/**
 * The append-only DevOps operations log.
 *
 * This model deliberately does **not** use `sharedFields()`. Every other domain
 * in this codebase is soft-deletable — `DELETE` flips `status` to `archived` and
 * a later `PATCH` can restore it. An audit log with a mutable status field and
 * an archive transition is not an audit log, so this schema carries its own
 * lifecycle `state` and no archive machinery at all.
 */
const devopsLogEntrySchema = new Schema(
  {
    entryId: { type: String, required: true, unique: true, trim: true, maxlength: 128 },
    // The dispatcher id that produced or is described by this entry, e.g.
    // "github.write". Free-form so an entry can also record work performed
    // outside the dispatcher.
    operationId: { type: String, required: true, trim: true, maxlength: 128 },
    operation: { type: String, trim: true, maxlength: 128, default: null },
    state: { type: String, enum: DEVOPS_LOG_STATES, required: true },
    summary: { type: String, required: true, trim: true, maxlength: 2000 },
    actor: { type: String, trim: true, maxlength: 128, default: null },
    projectId: { type: String, trim: true, maxlength: 128, default: null },
    taskId: { type: String, trim: true, maxlength: 128, default: null },
    correlationId: { type: String, trim: true, maxlength: 128, default: null },
    references: { type: [referenceSchema], default: () => [] },
    // Already redacted by devopsLog.service before it reaches Mongoose.
    details: { type: Schema.Types.Mixed, default: null },
    occurredAt: { type: Date, required: true, default: () => new Date() },
  },
  // Unknown fields are rejected rather than silently dropped, so a caller that
  // tries to smuggle an unmodelled `authorization` field gets an error instead
  // of a false sense that it was stored.
  { strict: 'throw' }
);

applyBaseOptions(devopsLogEntrySchema);

devopsLogEntrySchema.index({ occurredAt: -1, entryId: 1 });
devopsLogEntrySchema.index({ operationId: 1, state: 1, occurredAt: -1 });
devopsLogEntrySchema.index({ projectId: 1, occurredAt: -1 });

/**
 * Enforces append-only at the model layer.
 *
 * `devopsLog.service` exposes no update or delete method, but that is a
 * convention one future caller can bypass by reaching for the model directly.
 * These hooks make mutation fail loudly wherever it is attempted. `save()` on an
 * already-persisted document is blocked for the same reason.
 */
const MUTATION_HOOKS = [
  'updateOne',
  'updateMany',
  'replaceOne',
  'findOneAndUpdate',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];

function refuseMutation() {
  throw new Error('The DevOps operations log is append-only.');
}

for (const hook of MUTATION_HOOKS) {
  // `updateOne` and `deleteOne` exist as both document and query middleware.
  // Registering explicitly as query middleware keeps one consistent signature
  // for every hook in this list.
  devopsLogEntrySchema.pre(hook, { document: false, query: true }, refuseMutation);
}

devopsLogEntrySchema.pre('save', function refuseUpdateOnSave() {
  if (!this.isNew) {
    refuseMutation();
  }
});

module.exports = model('DevOpsLogEntry', devopsLogEntrySchema, 'devopsLogEntries');
module.exports.MUTATION_HOOKS = MUTATION_HOOKS;
