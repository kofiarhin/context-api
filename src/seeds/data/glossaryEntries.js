'use strict';

/**
 * Aliases are stored pre-normalized because term lookup normalizes the request
 * before matching. Aliases must stay unique across published entries.
 */
module.exports = [
  {
    term: 'Architect',
    normalizedKey: 'architect',
    definition:
      'The instruction workflow that runs discovery, shared understanding, implementation, and verification for an engineering task.',
    aliases: ['architect-workflow'],
    scope: 'global',
    relatedTerms: ['discovery', 'shared-understanding', 'verification'],
    tags: ['workflow'],
    source: { type: 'user-approved', reference: 'kofiarhin/context-api/docs/PRD.md#77-glossary' },
    status: 'active',
    version: 1,
  },
  {
    term: 'Ideas Hub',
    normalizedKey: 'ideas-hub',
    definition:
      'The narrative source of truth for project knowledge, lifecycle definitions, and workflow governance.',
    aliases: ['ideashub', 'hub'],
    scope: 'global',
    relatedTerms: ['project-record', 'source-of-truth'],
    tags: ['governance'],
    source: { type: 'ideas-hub', reference: 'kofiarhin/ideas-hub/README.md' },
    status: 'active',
    version: 1,
  },
  {
    term: 'Discovery',
    normalizedKey: 'discovery',
    definition:
      'The phase that builds a complete, implementation-ready understanding of a request before any files are changed.',
    aliases: ['discovery-phase'],
    scope: 'global',
    relatedTerms: ['shared-understanding', 'architect'],
    tags: ['workflow'],
    source: { type: 'user-approved', reference: 'kofiarhin/context-api/docs/PRD.md#77-glossary' },
    status: 'active',
    version: 1,
  },
  {
    term: 'Shared Understanding',
    normalizedKey: 'shared-understanding',
    definition:
      'The approved handoff describing confirmed scope, decisions, assumptions, acceptance criteria, and risks before implementation begins.',
    aliases: ['handoff', 'shared-understanding-handoff'],
    scope: 'global',
    relatedTerms: ['discovery', 'ready-task'],
    tags: ['workflow'],
    source: { type: 'user-approved', reference: 'kofiarhin/context-api/docs/PRD.md#77-glossary' },
    status: 'active',
    version: 1,
  },
  {
    term: 'Ready Task',
    normalizedKey: 'ready-task',
    definition:
      'A task with enough approved context, acceptance criteria, and resolved dependencies that implementation can start immediately.',
    aliases: ['ready'],
    scope: 'global',
    relatedTerms: ['shared-understanding', 'run'],
    tags: ['workflow'],
    source: { type: 'user-approved', reference: 'kofiarhin/context-api/docs/PRD.md#77-glossary' },
    status: 'active',
    version: 1,
  },
  {
    term: 'Verification',
    normalizedKey: 'verification',
    definition:
      'Confirming implemented behavior against approved requirements by running tests and relevant checks before reporting completion.',
    aliases: ['verify'],
    scope: 'global',
    relatedTerms: ['run', 'architect'],
    tags: ['workflow', 'testing'],
    source: { type: 'user-approved', reference: 'kofiarhin/context-api/docs/SPEC.md#16-testing' },
    status: 'active',
    version: 1,
  },
  {
    term: 'Run',
    normalizedKey: 'run',
    definition:
      'A single execution of a workflow against a task, producing changes and a verification result.',
    aliases: ['workflow-run'],
    scope: 'global',
    relatedTerms: ['workflow', 'verification'],
    tags: ['workflow'],
    source: { type: 'user-approved', reference: 'kofiarhin/context-api/docs/PRD.md#77-glossary' },
    status: 'active',
    version: 1,
  },
  {
    term: 'Workflow',
    normalizedKey: 'workflow',
    definition:
      'A named, reusable sequence of instructions describing how a class of work is carried out.',
    aliases: ['process'],
    scope: 'global',
    relatedTerms: ['run', 'instruction-set'],
    tags: ['workflow'],
    source: { type: 'user-approved', reference: 'kofiarhin/context-api/docs/PRD.md#77-glossary' },
    status: 'active',
    version: 1,
  },
  {
    term: 'Instruction Set',
    normalizedKey: 'instruction-set',
    definition:
      'A modular, versioned block of workflow instructions retrievable by key so clients load only what a task requires.',
    aliases: ['instructions'],
    scope: 'global',
    relatedTerms: ['workflow', 'architect'],
    tags: ['workflow'],
    source: { type: 'repository', reference: 'kofiarhin/context-api/docs/SPEC.md#85-instruction-set' },
    status: 'active',
    version: 1,
  },
  {
    term: 'Context Envelope',
    normalizedKey: 'context-envelope',
    definition:
      'The consistent { data, meta } response shape returned by every Context API endpoint.',
    aliases: ['response-envelope', 'envelope'],
    scope: 'project',
    relatedTerms: ['instruction-set'],
    tags: ['api'],
    source: { type: 'repository', reference: 'kofiarhin/context-api/docs/SPEC.md#63-success-envelopes' },
    status: 'active',
    version: 1,
  },
  {
    term: 'Context Bundle',
    normalizedKey: 'context-bundle',
    definition:
      'Draft term for a grouped multi-domain retrieval. Not implemented; the MVP intentionally has no all-context endpoint.',
    aliases: ['bundle'],
    scope: 'project',
    relatedTerms: ['context-envelope'],
    tags: ['api', 'draft'],
    source: { type: 'system-generated', reference: 'kofiarhin/context-api/docs/SPEC.md#17-performance' },
    status: 'draft',
    version: 1,
  },
];
