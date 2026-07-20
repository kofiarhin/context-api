'use strict';

const mongoose = require('mongoose');

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

async function expectSeedProblem(registry, pattern) {
  expectProblem(await validateSeedData(registry), pattern);
}

describe('shipped seed data', () => {
  it('passes validation as authored', async () => {
    expect(await validateSeedData()).toEqual([]);
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
  it('rejects an empty required domain', async () => {
    await expectSeedProblem(withRecords('tasks', []), /Domain "tasks" has no seed records/);
  });

  it('rejects duplicate identities within a domain', async () => {
    const [first] = domainRecords('projects');

    await expectSeedProblem(withRecords('projects', [first, { ...first }]), /duplicates identity/);
  });

  it('rejects a duplicate project slug', async () => {
    const [first, second] = domainRecords('projects');
    const clash = { ...second, slug: first.slug };

    await expectSeedProblem(withRecords('projects', [first, clash]), /duplicate slug/);
  });

  it('rejects a record that fails schema validation', async () => {
    const [first] = domainRecords('projects');

    await expectSeedProblem(
      withRecords('projects', [{ ...first, lifecycleState: 'imaginary' }]),
      /lifecycleState/
    );
  });

  it('awaits asynchronous schema validators', async () => {
    const modelName = `AsyncSeedValidation${Date.now()}`;
    const schema = new mongoose.Schema({
      key: { type: String, required: true },
      value: {
        type: String,
        validate: {
          validator: async (value) => {
            await Promise.resolve();
            return value === 'valid';
          },
          message: 'async validator rejected',
        },
      },
    });
    const AsyncSeedModel = mongoose.model(modelName, schema);

    try {
      const problems = await validateSeedData([
        {
          name: 'asyncSeedRecords',
          identity: ['key'],
          Model: AsyncSeedModel,
          records: [{ key: 'one', value: 'invalid' }],
        },
      ]);

      expect(problems).toContain(
        'asyncSeedRecords[0] (key=one) field "value": async validator rejected'
      );
    } finally {
      mongoose.deleteModel(modelName);
    }
  });

  it('rejects a project-scoped convention pointing at an unknown project', async () => {
    const conventions = domainRecords('codingConventions').map((record) =>
      record.scope === 'project' ? { ...record, projectId: 'does-not-exist' } : record
    );

    await expectSeedProblem(withRecords('codingConventions', conventions), /unknown projectId/);
  });

  it('rejects a task referencing an unknown project', async () => {
    const [task] = domainRecords('tasks');

    await expectSeedProblem(
      withRecords('tasks', [{ ...task, projectId: 'ghost-project' }]),
      /unknown projectId "ghost-project"/
    );
  });

  it('rejects a task depending on an unknown task', async () => {
    const [task] = domainRecords('tasks');

    await expectSeedProblem(
      withRecords('tasks', [{ ...task, dependencies: ['ghost-task'] }]),
      /depends on unknown taskId/
    );
  });

  it('rejects a learning superseding an unknown learning', async () => {
    const [learning] = domainRecords('learnings');

    await expectSeedProblem(
      withRecords('learnings', [{ ...learning, supersedes: 'ghost' }]),
      /supersedes unknown learningId/
    );
  });

  it('rejects a learning that supersedes itself', async () => {
    const [learning] = domainRecords('learnings');

    await expectSeedProblem(
      withRecords('learnings', [{ ...learning, supersedes: learning.learningId }]),
      /supersedes itself/
    );
  });

  describe('glossary aliases', () => {
    it('rejects the same alias on two published entries', async () => {
      const [first, second, ...rest] = domainRecords('glossaryEntries');
      const collided = [
        { ...first, aliases: ['shared-alias'] },
        { ...second, aliases: ['shared-alias'] },
        ...rest,
      ];

      await expectSeedProblem(withRecords('glossaryEntries', collided), /is claimed by both/);
    });

    it('allows a draft entry to reuse an alias held by a published entry', async () => {
      const entries = domainRecords('glossaryEntries');
      const published = { ...entries[0], status: 'active', aliases: ['shared-alias'] };
      const draft = { ...entries[1], status: 'draft', aliases: ['shared-alias'] };

      const problems = await validateSeedData(
        withRecords('glossaryEntries', [published, draft, ...entries.slice(2)])
      );

      expect(problems.filter((problem) => /is claimed by both/.test(problem))).toEqual([]);
    });

    it('rejects an alias that shadows another entry normalized key', async () => {
      const entries = domainRecords('glossaryEntries');
      const shadowed = [
        { ...entries[0], aliases: [entries[1].normalizedKey] },
        ...entries.slice(1),
      ];

      await expectSeedProblem(
        withRecords('glossaryEntries', shadowed),
        /collides with an existing normalizedKey/
      );
    });

    it('rejects an alias that is not normalized', async () => {
      const entries = domainRecords('glossaryEntries');
      const raw = [{ ...entries[0], aliases: ['Not Normalized'] }, ...entries.slice(1)];

      await expectSeedProblem(withRecords('glossaryEntries', raw), /is not normalized/);
    });

    it('rejects a normalizedKey that does not match its term', async () => {
      const entries = domainRecords('glossaryEntries');
      const mismatched = [{ ...entries[0], normalizedKey: 'wrong-key' }, ...entries.slice(1)];

      await expectSeedProblem(withRecords('glossaryEntries', mismatched), /but normalizes to/);
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
