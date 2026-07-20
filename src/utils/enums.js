'use strict';

const STATUSES = ['draft', 'approved', 'active', 'superseded', 'archived'];
const PUBLISHED_STATUSES = ['active', 'approved'];
const SCOPES = ['global', 'project'];
const SOURCE_TYPES = ['user-approved', 'ideas-hub', 'repository', 'system-generated'];

const PROJECT_LIFECYCLE_STATES = [
  'ideation',
  'planning',
  'active',
  'paused',
  'completed',
  'archived',
];

const TASK_STATUSES = ['backlog', 'ready', 'in-progress', 'blocked', 'done', 'archived'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'];

const WORKFLOW_STAGES = [
  'discovery',
  'specification',
  'implementation',
  'verification',
  'code-review',
  'documentation',
  'repository-update',
];

const LEARNING_CATEGORIES = ['preference', 'workflow', 'architecture', 'pitfall', 'process'];
const REVIEW_STATUSES = ['unreviewed', 'in-review', 'reviewed'];

module.exports = {
  STATUSES,
  PUBLISHED_STATUSES,
  SCOPES,
  SOURCE_TYPES,
  PROJECT_LIFECYCLE_STATES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  WORKFLOW_STAGES,
  LEARNING_CATEGORIES,
  REVIEW_STATUSES,
};
