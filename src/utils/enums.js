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

/**
 * Lifecycle states for the append-only DevOps operations log.
 *
 * Every state is deliberately distinct and none is an alias for another. The
 * distinctions that matter most in review:
 *
 * - `proposed` vs `approved`: work described vs work Kofi authorised.
 * - `running` vs `blocked`: actively executing vs halted awaiting an input.
 * - `failed` vs `blocked`: the attempt ran and lost vs it never got to run.
 * - `passed` vs `completed`: verification succeeded vs the whole unit of work
 *   is finished (a run can pass its checks and still not be complete).
 * - `deployed` vs `completed`: shipped to an environment vs closed out.
 * - `rolled-back` vs `failed`: a deployment was deliberately reversed vs an
 *   operation errored.
 * - `resolved` vs `completed`: an incident or blocker was cleared vs the
 *   originating work item finished.
 *
 * Collapsing any pair would destroy audit signal, so `devopsLog.service`
 * validates against this list verbatim and never maps one state onto another.
 */
const DEVOPS_LOG_STATES = [
  'proposed',
  'approved',
  'running',
  'blocked',
  'failed',
  'passed',
  'deployed',
  'rolled-back',
  'resolved',
  'completed',
];

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
  DEVOPS_LOG_STATES,
};
