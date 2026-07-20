'use strict';

const { validateSeedData } = require('../../src/seeds/validate');
const { REGISTRY, REQUIRED_DOMAINS } = require('../../src/seeds/registry');
const { normalizeTerm } = require('../../src/models/glossaryEntry.model');

function domainRecords(name) {
  return REGISTRY.find((domain) => domain.name === name).records;
}

/** Clones the real registry with one domain's records replaced. */
function withRecords(name, records) {
  return REGISTRY.map((domain) => (domain.name === name ? { ...domain, records } : domain));
}

function expectProblem(problems, pattern) {
  expect(problems.some((problem) => pattern.test(problem))).toBe(true);
}

describe('shipped seed data', () => {
  it('passes validation as authored', () => {
    expect(validateSeedData()).toEqual([]);
  });

  it('populates every required domain', () => {
    REQUIRED_DOMAINS.forEach((name) => {
      expect(domainRecords(name).length).toBeGreaterThan(0);
    });
  });

  it('uses stable, non-generated identifiers', () => {
    REGISTRY.forEach((domain) => {
      domain.records.forEach((record) => {
        domain.identity.forEach((field) => {
          expect(record[field]).toBeDefined();
          expect(String(record[field])).not.toMatch(/^[0-9a-f]{24}$/);
        });
      });
    });
  });

  it('includes an active profile', () => {
    expect(domainRecords('profiles').some((profile) => profile.status === 'active')).toBe(true);
  });

  it('includes both global and project-scoped coding conventions', () => {
    const scopes = new Set(domainRecords('codingConventions').map((record) => record.scope));

    expect(scopes.has('global')).toBe(true);
    expect(scopes.has('project')).toBe(true);
  });

  it('includes instruction sets for the four core workflow stages', () => {
    const stages = new Set(domainRecords('instructionSets').map((record) => record.workflowStage));

    ['discovery', 'specification', 'implementation', 'verification'].forEach((stage) => {
      expect(stages.has(stage)).toBe(true);
    });
  });

  it('includes active, draft, and superseded learnings', () => {
    const statuses = new Set(domainRecords('learnings').map((record) => record.status));

    expect(statuses.has('active')).toBe(true);
    expect(statuses.has('draft')).toBe(true);
    expect(statuses.has('superseded')).toBe(true);
  });

  it('never marks an unreviewed learning as durable knowledge', () => {
    domainRecords('learnings').forEach((learning) => {
      if (learning.status === 'active' || learning.status === 'approved') {
        expect(learning.reviewStatus).toBe('reviewed');
      }
    });
  });

  it('spreads tasks across projects, statuses, and priorities', () => {
    const tasks = domainRecords('tasks');

    expect(new Set(tasks.map((task) => task.projectId)).size).toBeGreaterThan(1);
    expect(new Set(tasks.map((task) => task.status)).size).toBeGreaterThan(2);
    expect(new Set(tasks.map((task) => task.priority)).size).toBeGreaterThan(2);
  });

  it('stores glossary aliases in normalized form', () => {
    domainRecords('glossaryEntries').forEach((entry) => {
      expect(entry.normalizedKey).toBe(normalizeTerm(entry.term));
      (entry.aliases || []).forEach((alias) => expect(alias).toBe(normalizeTerm(alias)));
    });
  });

  it('gives every record a source reference for traceability', () => {
    REGISTRY.forEach((domain) => {
      domain.records.forEach((record) => {
        expect(record.source).toBeDefined();
        expect(record.source.type).toBeTruthy();
      });
    });
  });
});

describe('seed validation rules', () => {
  it('rejects an empty required domain', () => {
    expectProblem(validateSeedData(withRecords('tasks', [])), /Domain "tasks" has no seed records/);
  });

  it('rejects duplicate identities within a domain', () => {
    const [first] = domainRecords('projects');

    expectProblem(validateSeedData(withRecords('projects', [first, { ...first }])), /duplicates identity/);
  });

  it('rejects a duplicate project slug', () => {
    const [first, second] = domainRecords('projects');
    const clash = { ...second, slug: first.slug };

    expectProblem(validateSeedData(withRecords('projects', [first, clash])), /duplicate slug/);
  });

  it('rejects a record that fails schema validation', () => {
    const [first] = domainRecords('projects');

    expectProblem(
      validateSeedData(withRecords('projects', [{ ...first, lifecycleState: 'imaginary' }])),
      /lifecycleState/
    );
  });

  it('rejects a project-scoped convention pointing at an unknown project', () => {
    const conventions = domainRecords('codingConventions').map((record) =>
      record.scope === 'project' ? { ...record, projectId: 'does-not-exist' } : record
    );

    expectProblem(validateSeedData(withRecords('codingConventions', conventions)), /unknown projectId/);
  });

  it('rejects a task referencing an unknown project', () => {
    const [task] = domainRecords('tasks');

    expectProblem(
      validateSeedData(withRecords('tasks', [{ ...task, projectId: 'ghost-project' }])),
      /unknown projectId "ghost-project"/
    );
  });

  it('rejects a task depending on an unknown task', () => {
    const [task] = domainRecords('tasks');

    expectProblem(
      validateSeedData(withRecords('tasks', [{ ...task, dependencies: ['ghost-task'] }])),
      /depends on unknown taskId/
    );
  });

  it('rejects a learning superseding an unknown learning', () => {
    const [learning] = domainRecords('learnings');

    expectProblem(
      validateSeedData(withRecords('learnings', [{ ...learning, supersedes: 'ghost' }])),
      /supersedes unknown learningId/
    );
  });

  it('rejects a learning that supersedes itself', () => {
    const [learning] = domainRecords('learnings');

    expectProblem(
      validateSeedData(withRecords('learnings', [{ ...learning, supersedes: learning.learningId }])),
      /supersedes itself/
    );
  });

  describe('glossary aliases', () => {
    it('rejects the same alias on two published entries', () => {
      const [first, second, ...rest] = domainRecords('glossaryEntries');
      const collided = [
        { ...first, aliases: ['shared-alias'] },
        { ...second, aliases: ['shared-alias'] },
        ...rest,
      ];

      expectProblem(validateSeedData(withRecords('glossaryEntries', collided)), /is claimed by both/);
    });

    it('allows a draft entry to reuse an alias held by a published entry', () => {
      const entries = domainRecords('glossaryEntries');
      const published = { ...entries[0], status: 'active', aliases: ['shared-alias'] };
      const draft = { ...entries[1], status: 'draft', aliases: ['shared-alias'] };

      const problems = validateSeedData(
        withRecords('glossaryEntries', [published, draft, ...entries.slice(2)])
      );

      expect(problems.filter((problem) => /is claimed by both/.test(problem))).toEqual([]);
    });

    it('rejects an alias that shadows another entry normalized key', () => {
      const entries = domainRecords('glossaryEntries');
      const shadowed = [{ ...entries[0], aliases: [entries[1].normalizedKey] }, ...entries.slice(1)];

      expectProblem(validateSeedData(withRecords('glossaryEntries', shadowed)), /collides with an existing normalizedKey/);
    });

    it('rejects an alias that is not normalized', () => {
      const entries = domainRecords('glossaryEntries');
      const raw = [{ ...entries[0], aliases: ['Not Normalized'] }, ...entries.slice(1)];

      expectProblem(validateSeedData(withRecords('glossaryEntries', raw)), /is not normalized/);
    });

    it('rejects a normalizedKey that does not match its term', () => {
      const entries = domainRecords('glossaryEntries');
      const mismatched = [{ ...entries[0], normalizedKey: 'wrong-key' }, ...entries.slice(1)];

      expectProblem(validateSeedData(withRecords('glossaryEntries', mismatched)), /but normalizes to/);
    });
  });
});

describe('normalizeTerm', () => {
  it.each([
    ['Shared Understanding', 'shared-understanding'],
    ['  Ideas Hub  ', 'ideas-hub'],
    ['READY_TASK', 'ready-task'],
    ['Context-API', 'context-api'],
    ['Run!', 'run'],
    ['multiple   spaces', 'multiple-spaces'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeTerm(input)).toBe(expected);
  });
});
