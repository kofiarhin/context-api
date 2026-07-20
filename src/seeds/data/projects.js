'use strict';

module.exports = [
  {
    projectId: 'context-api',
    slug: 'context-api',
    name: 'Context API',
    summary:
      'Read-oriented REST API that serves durable structured context to AI clients so instructions are not duplicated across projects.',
    description: 'MVP context service backing ChatGPT projects, Architect, and coding agents.',
    lifecycleState: 'active',
    repositoryUrl: 'https://github.com/kofiarhin/context-api',
    liveUrl: null,
    technologyStack: ['node', 'express', 'mongodb', 'mongoose', 'jest'],
    currentFocus: 'Deliver the unauthenticated read-only MVP and validate payload reduction.',
    milestones: [
      { key: 'foundation', title: 'Application and database foundation', status: 'complete' },
      { key: 'read-api', title: 'Read endpoints for every context domain', status: 'complete' },
      { key: 'validation', title: 'MVP validation and findings', status: 'in-progress' },
      { key: 'auth', title: 'Authentication and write APIs', status: 'deferred' },
    ],
    architectureSummary:
      'Layered Express application: routes map to validation middleware and controllers, controllers call services, services query Mongoose models, and serializers apply response allowlists.',
    relatedContextReferences: [
      { type: 'repository', reference: 'kofiarhin/context-api/docs/PRD.md' },
      { type: 'repository', reference: 'kofiarhin/context-api/docs/SPEC.md' },
    ],
    tags: ['api', 'backend', 'mvp'],
    source: { type: 'repository', reference: 'kofiarhin/context-api/docs/PRD.md' },
    status: 'active',
    version: 1,
  },
  {
    projectId: 'ideas-hub',
    slug: 'ideas-hub',
    name: 'Ideas Hub',
    summary:
      'Narrative source of truth for project knowledge, lifecycle definitions, and workflow governance.',
    description: 'Governs how project records are structured, routed, and superseded.',
    lifecycleState: 'active',
    repositoryUrl: 'https://github.com/kofiarhin/ideas-hub',
    liveUrl: null,
    technologyStack: ['markdown', 'git'],
    currentFocus:
      'Keep canonical files authoritative while Context API exposes normalized project context.',
    milestones: [
      { key: 'canonical-files', title: 'Canonical file responsibilities defined', status: 'complete' },
      { key: 'routing-rules', title: 'Update routing rules documented', status: 'complete' },
    ],
    architectureSummary:
      'Markdown repository organized by canonical files, with explicit source-of-truth and update-routing rules.',
    relatedContextReferences: [{ type: 'repository', reference: 'kofiarhin/ideas-hub/README.md' }],
    tags: ['knowledge', 'governance'],
    source: { type: 'ideas-hub', reference: 'kofiarhin/ideas-hub/README.md' },
    status: 'active',
    version: 1,
  },
  {
    projectId: 'architect',
    slug: 'architect',
    name: 'Architect',
    summary:
      'Instruction workflow that runs discovery, shared understanding, implementation, and verification for engineering tasks.',
    description: 'Consumes Context API instruction sets rather than embedding them statically.',
    lifecycleState: 'planning',
    repositoryUrl: null,
    liveUrl: null,
    technologyStack: ['markdown', 'node'],
    currentFocus: 'Replace duplicated static instruction blocks with Context API retrieval.',
    milestones: [
      { key: 'instruction-extraction', title: 'Extract instruction sets', status: 'in-progress' },
    ],
    architectureSummary: 'Workflow definitions expressed as retrievable instruction sets.',
    relatedContextReferences: [
      { type: 'repository', reference: 'kofiarhin/context-api/docs/PRD.md#75-instruction-sets' },
    ],
    tags: ['workflow', 'agent'],
    source: { type: 'user-approved', reference: 'kofiarhin/context-api/docs/PRD.md#6' },
    status: 'draft',
    version: 1,
  },
];
