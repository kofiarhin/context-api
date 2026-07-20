'use strict';

const { Schema, model } = require('mongoose');

const { TASK_STATUSES, TASK_PRIORITIES } = require('../utils/enums');
const { sourceSchema, applyBaseOptions } = require('./shared');

const taskSchema = new Schema({
  taskId: { type: String, required: true, unique: true, trim: true, maxlength: 128 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 4000 },
  projectId: { type: String, required: true, trim: true, maxlength: 128 },
  status: { type: String, enum: TASK_STATUSES, required: true, default: 'backlog' },
  priority: { type: String, enum: TASK_PRIORITIES, required: true, default: 'medium' },
  acceptanceCriteria: { type: [String], default: () => [] },
  // Stable task IDs this task depends on.
  dependencies: { type: [String], default: () => [] },
  tags: { type: [String], default: () => [] },
  source: { type: sourceSchema, required: true },
});

applyBaseOptions(taskSchema);

taskSchema.index({ projectId: 1, status: 1, priority: 1 });
taskSchema.index({ updatedAt: -1, taskId: 1 });

module.exports = model('Task', taskSchema, 'tasks');
