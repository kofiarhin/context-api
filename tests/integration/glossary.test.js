'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/testDb');
const { seedTestData } = require('../helpers/seedTestData');
const GlossaryEntry = require('../../src/models/glossaryEntry.model');

let app;

beforeAll(async () => {
  await connectTestDb();
  app = buildTestApp();
  await clearTestDb();
  await seedTestData();
});

afterAll(async () => {
  await clearTestDb();
  await closeTestDb();
});

describe('GET /api/v1/glossary', () => {
  it('returns seeded entries', async () => {
    const response = await request(app).get('/api/v1/glossary');

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('filters by scope', async () => {
    const response = await request(app).get('/api/v1/glossary?scope=project');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((entry) => expect(entry.scope).toBe('project'));
  });

  describe('query search', () => {
    it('matches a term case-insensitively', async () => {
      const response = await request(app).get('/api/v1/glossary?query=IDEAS');

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data.some((entry) => entry.normalizedKey === 'ideas-hub')).toBe(true);
    });

    it('matches against a definition', async () => {
      const response = await request(app).get('/api/v1/glossary?query=source of truth');

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('matches against an alias', async () => {
      const response = await request(app).get('/api/v1/glossary?query=handoff');

      expect(response.body.data.some((entry) => entry.normalizedKey === 'shared-understanding')).toBe(
        true
      );
    });

    it('returns an empty collection when nothing matches', async () => {
      const response = await request(app).get('/api/v1/glossary?query=zzzznotaterm');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('treats regular expression characters as literal text', async () => {
      const response = await request(app).get('/api/v1/glossary?query=.*');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });
  });

  it('rejects a query beyond the maximum length', async () => {
    const response = await request(app).get(`/api/v1/glossary?query=${'a'.repeat(129)}`);

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('query');
  });
});

describe('GET /api/v1/glossary/:term', () => {
  it('resolves an exact normalized key', async () => {
    const response = await request(app).get('/api/v1/glossary/shared-understanding');

    expect(response.status).toBe(200);
    expect(response.body.data.term).toBe('Shared Understanding');
  });

  it('normalizes the supplied term before matching', async () => {
    const response = await request(app).get('/api/v1/glossary/Ideas-Hub');

    expect(response.status).toBe(200);
    expect(response.body.data.normalizedKey).toBe('ideas-hub');
  });

  it('resolves through an alias when no key matches', async () => {
    const response = await request(app).get('/api/v1/glossary/handoff');

    expect(response.status).toBe(200);
    expect(response.body.data.normalizedKey).toBe('shared-understanding');
  });

  it('prefers a normalized key over an alias owned by another entry', async () => {
    await GlossaryEntry.updateOne(
      { normalizedKey: 'run' },
      { $addToSet: { aliases: 'verification' } }
    );

    const response = await request(app).get('/api/v1/glossary/verification');

    expect(response.status).toBe(200);
    expect(response.body.data.normalizedKey).toBe('verification');

    await GlossaryEntry.updateOne({ normalizedKey: 'run' }, { $pull: { aliases: 'verification' } });
  });

  it('returns a deterministic conflict when an alias matches several published entries', async () => {
    await GlossaryEntry.updateMany(
      { normalizedKey: { $in: ['run', 'workflow'] } },
      { $addToSet: { aliases: 'ambiguous-alias' } }
    );

    const response = await request(app).get('/api/v1/glossary/ambiguous-alias');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('AMBIGUOUS_RESOURCE');
    expect(response.body.error.details.length).toBe(2);

    await GlossaryEntry.updateMany(
      { normalizedKey: { $in: ['run', 'workflow'] } },
      { $pull: { aliases: 'ambiguous-alias' } }
    );
  });

  it('ignores an alias held only by an unpublished entry', async () => {
    const response = await request(app).get('/api/v1/glossary/bundle');

    expect(response.status).toBe(404);
  });

  it('returns 404 for an unknown term', async () => {
    const response = await request(app).get('/api/v1/glossary/not-a-term');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects a malformed term', async () => {
    const response = await request(app).get('/api/v1/glossary/$ne');

    expect(response.status).toBe(400);
  });
});
