'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/testDb');
const { BlogPost } = require('../../src/models');

const API_KEY = 'test-devkofi-blog-api-key-1234567890';
let app;

const publishedPost = {
  title: 'Reliable agent retries need contracts',
  slug: 'reliable-agent-retries-need-contracts',
  excerpt: 'Retries need deterministic boundaries.',
  content: '# Reliable retries\n\nA retry is another state transition.',
  tags: ['AI Engineering', 'Reliability'],
  sources: [{ title: 'Primary source', url: 'https://example.com/source' }],
  coverImageUrl: null,
  coverImageAlt: null,
  seoTitle: 'Reliable agent retries need contracts',
  seoDescription: 'Retries need deterministic boundaries.',
  status: 'published',
  publishedAt: new Date('2026-09-01T12:00:00.000Z'),
};

beforeAll(async () => {
  await connectTestDb();
  await clearTestDb();

  await BlogPost.create([
    publishedPost,
    {
      ...publishedPost,
      title: 'Newer published post',
      slug: 'newer-published-post',
      publishedAt: new Date('2026-09-02T12:00:00.000Z'),
    },
  ]);

  await BlogPost.collection.insertOne({
    ...publishedPost,
    title: 'Draft post',
    slug: 'draft-post',
    status: 'draft',
    publishedAt: new Date('2026-09-03T12:00:00.000Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  app = buildTestApp({}, { blogEnvSource: { DEVKOFI_API_KEY: API_KEY } });
});

afterAll(async () => {
  await clearTestDb();
  await closeTestDb();
});

describe('authenticated blog read API', () => {
  it('rejects requests without the server-to-server bearer key', async () => {
    const response = await request(app).get('/api/v1/blog');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('lists only published posts newest first', async () => {
    const response = await request(app)
      .get('/api/v1/blog')
      .set('Authorization', `Bearer ${API_KEY}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((post) => post.slug)).toEqual([
      'newer-published-post',
      publishedPost.slug,
    ]);
    expect(response.body.meta).toMatchObject({ count: 2, version: 'v1' });
  });

  it('returns a published post by slug', async () => {
    const response = await request(app)
      .get(`/api/v1/blog/${publishedPost.slug}`)
      .set('Authorization', `Bearer ${API_KEY}`);

    expect(response.status).toBe(200);
    expect(response.body.data.slug).toBe(publishedPost.slug);
    expect(response.body.data.content).toBe(publishedPost.content);
  });

  it('returns 404 for missing or unpublished slugs', async () => {
    const missing = await request(app)
      .get('/api/v1/blog/does-not-exist')
      .set('Authorization', `Bearer ${API_KEY}`);
    const unpublished = await request(app)
      .get('/api/v1/blog/draft-post')
      .set('Authorization', `Bearer ${API_KEY}`);

    expect(missing.status).toBe(404);
    expect(unpublished.status).toBe(404);
    expect(missing.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });
});
