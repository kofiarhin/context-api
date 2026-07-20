'use strict';

const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/testDb');
const { seedAll, resetAll, summarize } = require('../../src/seeds/runner');
const { REGISTRY } = require('../../src/seeds/registry');
const { Project, CodingConvention } = require('../../src/models');

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await clearTestDb();
  await closeTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

async function countAll() {
  const counts = {};

  for (const domain of REGISTRY) {
    counts[domain.name] = await domain.Model.countDocuments({});
  }

  return counts;
}

function withArchitectProject(registry) {
  return registry.map((domain) => {
    if (domain.name !== 'projects') {
      return domain;
    }

    const [template] = domain.records;

    return {
      ...domain,
      records: [
        ...domain.records,
        {
          ...template,
          projectId: 'architect',
          slug: 'architect',
          name: 'Architect',
        },
      ],
    };
  });
}

describe('seed workflow', () => {
  it('inserts every domain on a clean database', async () => {
    const result = await seedAll();

    expect(result.ok).toBe(true);
    expect(result.phase).toBe('write');

    const totals = summarize(result);
    expect(totals.inserted).toBeGreaterThan(0);
    expect(totals.updated).toBe(0);
    expect(totals.failed).toBe(0);

    const counts = await countAll();
    Object.values(counts).forEach((count) => expect(count).toBeGreaterThan(0));
  });

  it('is idempotent: a rerun changes nothing and creates no duplicates', async () => {
    await seedAll();
    const countsAfterFirst = await countAll();

    const second = await seedAll();
    const countsAfterSecond = await countAll();

    const totals = summarize(second);
    expect(totals.inserted).toBe(0);
    expect(totals.updated).toBe(0);
    expect(totals.failed).toBe(0);
    expect(totals.unchanged).toBeGreaterThan(0);
    expect(countsAfterSecond).toEqual(countsAfterFirst);
  });

  it('runs three times without drift', async () => {
    await seedAll();
    await seedAll();
    const third = await seedAll();

    expect(summarize(third).unchanged).toBeGreaterThan(0);
    expect(summarize(third).inserted).toBe(0);
  });

  it('repairs a drifted record by updating rather than inserting', async () => {
    await seedAll();

    await Project.updateOne({ projectId: 'context-api' }, { $set: { name: 'Renamed by hand' } });

    const result = await seedAll();
    const totals = summarize(result);

    expect(totals.updated).toBe(1);
    expect(totals.inserted).toBe(0);

    const project = await Project.findOne({ projectId: 'context-api' }).lean();
    expect(project.name).toBe('Context API');
  });

  it('upserts by stable key, so identifiers survive a rerun', async () => {
    await seedAll();
    const before = await Project.findOne({ projectId: 'context-api' }).lean();

    await seedAll();
    const after = await Project.findOne({ projectId: 'context-api' }).lean();

    expect(String(after._id)).toBe(String(before._id));
  });

  it('stores several versions of the same instruction set key', async () => {
    await seedAll();

    const { InstructionSet } = require('../../src/models');
    const versions = await InstructionSet.find({ key: 'discovery-workflow' }).lean();

    expect(versions).toHaveLength(2);
  });

  it('reports a validation failure without writing anything', async () => {
    const broken = REGISTRY.map((domain) =>
      domain.name === 'tasks'
        ? { ...domain, records: [{ ...domain.records[0], projectId: 'ghost-project' }] }
        : domain
    );

    const result = await seedAll(broken);

    expect(result.ok).toBe(false);
    expect(result.phase).toBe('validation');
    expect(result.problems.some((problem) => /unknown projectId/.test(problem))).toBe(true);

    const counts = await countAll();
    Object.values(counts).forEach((count) => expect(count).toBe(0));
  });

  it('reports per-record write failures instead of aborting the whole run', async () => {
    const conventions = REGISTRY.find((domain) => domain.name === 'codingConventions');
    let validationCalls = 0;
    let createCalls = 0;

    // Passes seed validation, then fails at write time.
    class FailingModel {
      async validate() {
        validationCalls += 1;
        expect(createCalls).toBe(0);
      }

      static findOne() {
        return Promise.resolve(null);
      }

      static create() {
        createCalls += 1;
        return Promise.reject(new Error('simulated write failure'));
      }
    }

    const result = await seedAll(
      withArchitectProject(
        REGISTRY.map((domain) =>
          domain.name === 'codingConventions' ? { ...domain, Model: FailingModel } : domain
        )
      )
    );

    expect(result.ok).toBe(false);
    expect(result.phase).toBe('write');
    expect(validationCalls).toBe(conventions.records.length);
    expect(result.domains.codingConventions.failed).toBe(conventions.records.length);
    expect(result.domains.codingConventions.errors[0]).toContain('simulated write failure');

    // Other domains still completed, so a partial failure is visible rather than silent.
    expect(result.domains.projects.inserted).toBeGreaterThan(0);
  });

  it('completes validation for the full registry before any write operation starts', async () => {
    const registry = withArchitectProject(REGISTRY);
    const expectedValidations = registry.reduce(
      (total, domain) => total + domain.records.length,
      0
    );
    let validationCalls = 0;
    let writeCalls = 0;

    function createInstrumentedModel() {
      return class InstrumentedModel {
        async validate() {
          validationCalls += 1;
        }

        static findOne() {
          expect(validationCalls).toBe(expectedValidations);
          writeCalls += 1;
          return Promise.resolve(null);
        }

        static create() {
          return Promise.resolve();
        }
      };
    }

    const result = await seedAll(
      registry.map((domain) => ({ ...domain, Model: createInstrumentedModel() }))
    );

    expect(result.ok).toBe(true);
    expect(result.phase).toBe('write');
    expect(validationCalls).toBe(expectedValidations);
    expect(writeCalls).toBe(expectedValidations);
  });

  it('leaves collections untouched unless reset is requested explicitly', async () => {
    await seedAll();
    const before = await countAll();

    await seedAll();

    expect(await countAll()).toEqual(before);
  });

  it('clears every collection on an explicit reset', async () => {
    await seedAll();
    expect(await CodingConvention.countDocuments({})).toBeGreaterThan(0);

    const cleared = await resetAll();

    expect(cleared).toEqual(REGISTRY.map((domain) => domain.name));
    Object.values(await countAll()).forEach((count) => expect(count).toBe(0));
  });
});
