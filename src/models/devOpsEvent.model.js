'use strict';

const { randomUUID } = require('node:crypto');
const { Schema, model } = require('mongoose');

const EVENT_STAGES = [
  'discovery',
  'planning',
  'implementation',
  'review',
  'verification',
  'preview',
  'deployment',
  'production',
  'operations',
  'incident',
  'rollback',
  'security',
  'completion',
];

const EVENT_STATUSES = [
  'proposed',
  'approved',
  'queued',
  'running',
  'blocked',
  'failed',
  'passed',
  'deployed',
  'rolled-back',
  'resolved',
  'completed',
];

const EVENT_PROVIDERS = ['context-api', 'github', 'vercel', 'heroku', 'manual'];
const EVENT_ENVIRONMENTS = ['local', 'test', 'preview', 'staging', 'production'];

const checkSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 300 },
    status: {
      type: String,
      required: true,
      enum: ['passed', 'failed', 'skipped', 'not-run'],
    },
    details: { type: String, trim: true, maxlength: 4000, default: null },
  },
  { _id: false }
);

const evidenceSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'commit',
        'pull-request',
        'workflow-run',
        'deployment',
        'release',
        'health-check',
        'log',
        'request',
        'document',
      ],
    },
    reference: { type: String, required: true, trim: true, maxlength: 2000 },
    sha: { type: String, trim: true, maxlength: 128, default: null },
    notes: { type: String, trim: true, maxlength: 2000, default: null },
  },
  { _id: false }
);

const devOpsEventSchema = new Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      default: randomUUID,
      immutable: true,
    },
    kind: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
    incidentId: { type: String, trim: true, maxlength: 200, default: null, immutable: true },
    runId: { type: String, trim: true, maxlength: 200, default: null, immutable: true },
    workKey: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    projectId: { type: String, trim: true, maxlength: 200, default: null, immutable: true },
    taskId: { type: String, trim: true, maxlength: 200, default: null, immutable: true },
    stage: { type: String, required: true, enum: EVENT_STAGES, immutable: true },
    status: { type: String, required: true, enum: EVENT_STATUSES, immutable: true },
    provider: { type: String, enum: EVENT_PROVIDERS, default: 'manual', immutable: true },
    environment: {
      type: String,
      enum: EVENT_ENVIRONMENTS,
      default: null,
      immutable: true,
    },
    summary: { type: String, required: true, trim: true, maxlength: 4000, immutable: true },
    repository: { type: String, trim: true, maxlength: 300, default: null, immutable: true },
    branch: { type: String, trim: true, maxlength: 300, default: null, immutable: true },
    commitSha: { type: String, trim: true, maxlength: 128, default: null, immutable: true },
    pullRequest: { type: Number, min: 1, default: null, immutable: true },
    release: { type: String, trim: true, maxlength: 300, default: null, immutable: true },
    deploymentId: { type: String, trim: true, maxlength: 500, default: null, immutable: true },
    deploymentUrl: { type: String, trim: true, maxlength: 2000, default: null, immutable: true },
    requestId: { type: String, trim: true, maxlength: 200, default: null, immutable: true },
    correlationId: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
      immutable: true,
    },
    variableName: { type: String, trim: true, maxlength: 300, default: null, immutable: true },
    actor: { type: String, trim: true, maxlength: 300, default: null, immutable: true },
    reason: { type: String, trim: true, maxlength: 2000, default: null, immutable: true },
    checks: { type: [checkSchema], default: () => [], immutable: true },
    evidence: { type: [evidenceSchema], default: () => [], immutable: true },
    metadata: { type: Schema.Types.Mixed, default: () => ({}), immutable: true },
    occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: 'throw',
  }
);

devOpsEventSchema.index({ occurredAt: -1, eventId: -1 });
devOpsEventSchema.index({ workKey: 1, occurredAt: -1, eventId: -1 });
devOpsEventSchema.index({ runId: 1, occurredAt: -1, eventId: -1 });
devOpsEventSchema.index({ incidentId: 1, occurredAt: 1, eventId: 1 });
devOpsEventSchema.index({ release: 1, occurredAt: -1 });
devOpsEventSchema.index({ deploymentId: 1, occurredAt: -1 });

module.exports = model('DevOpsEvent', devOpsEventSchema, 'devops_events');
module.exports.EVENT_STAGES = EVENT_STAGES;
module.exports.EVENT_STATUSES = EVENT_STATUSES;
module.exports.EVENT_PROVIDERS = EVENT_PROVIDERS;
module.exports.EVENT_ENVIRONMENTS = EVENT_ENVIRONMENTS;
