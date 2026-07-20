'use strict';

module.exports = [
  {
    key: 'primary',
    displayName: 'Kofi Arhin',
    description: 'Durable interaction preferences applied across AI project workflows.',
    professionalRoles: ['Software engineer', 'Full-stack developer'],
    preferredStack: [
      'node',
      'express',
      'mongodb',
      'mongoose',
      'react',
      'vite',
      'typescript',
      'tailwind',
    ],
    responsePreferences: [
      'Lead with the answer, then the reasoning.',
      'Keep explanations concise and free of filler.',
      'State assumptions explicitly rather than implying them.',
      'Report verification results honestly, including failures.',
    ],
    testingPreferences: [
      'Test-driven development where practical.',
      'Jest for backend suites, Vitest for frontend suites.',
      'Add regression coverage alongside every bug fix.',
      'Cover success and primary failure paths, not only the happy path.',
    ],
    architecturePreferences: [
      'Separate routes, controllers, services, models, and validation.',
      'Keep business logic out of controllers and UI components.',
      'Prefer modifying existing files over introducing new structures.',
      'Minimize dependencies; check the package manifest before importing.',
    ],
    communicationPreferences: [
      'Ask one focused question at a time when blocked.',
      'Surface tradeoffs only when they change the implementation.',
      'Challenge unsafe or ambiguous requirements before building.',
    ],
    tags: ['profile', 'preferences'],
    source: { type: 'user-approved', reference: 'kofiarhin/context-api/docs/PRD.md#71-profile' },
    status: 'active',
    version: 1,
  },
];
