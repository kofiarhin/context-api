'use strict';

const {
  SUMMARY_PROJECTIONS,
  encodeCursor,
  decodeCursor,
  applyCursor,
  paginate,
} = require('../../src/services/queryHelpers');
const { ValidationError } = require('../../src/utils/errors');

const SORT = { updatedAt: -1, projectId: 1 };

function project(projectId, updatedAt) {
  return {
    projectId,
    updatedAt: new Date(updatedAt),
    status: 'active',
  };
}

function createQuery(items) {
  const query = {
    sort: jest.fn(() => query),
    skip: jest.fn(() => query),
    select: jest.fn(() => query),
    limit: jest.fn(() => query),
    lean: jest.fn().mockResolvedValue(items),
  };

  return query;
}

describe('stable cursor helpers', () => {
  it('round-trips the model and stable sort values', () => {
    const record = project('context-api', '2026-07-23T10:00:00.000Z');
    const cursor = encodeCursor(record, 'Project', SORT);

    expect(decodeCursor(cursor, 'Project', SORT)).toEqual({
      updatedAt: record.updatedAt,
      projectId: 'context-api',
    });
  });

  it('rejects a cursor from another collection', () => {
    const cursor = encodeCursor(
      project('context-api', '2026-07-23T10:00:00.000Z'),
      'Project',
      SORT
    );

    expect(() => decodeCursor(cursor, 'Task', SORT)).toThrow(ValidationError);
  });

  it('builds lexicographic continuation clauses from the stable sort', () => {
    const timestamp = new Date('2026-07-23T10:00:00.000Z');

    expect(
      applyCursor(
        { status: 'active' },
        { updatedAt: timestamp, projectId: 'context-api' },
        SORT
      )
    ).toEqual({
      $and: [
        { status: 'active' },
        {
          $or: [
            { updatedAt: { $lt: timestamp } },
            {
              updatedAt: timestamp,
              projectId: { $gt: 'context-api' },
            },
          ],
        },
      ],
    });
  });
});

describe('paginate cursor mode', () => {
  it('uses summary projection, fetches one extra item, and skips totals', async () => {
    const items = [
      project('alpha', '2026-07-23T12:00:00.000Z'),
      project('beta', '2026-07-23T11:00:00.000Z'),
      project('gamma', '2026-07-23T10:00:00.000Z'),
    ];
    const query = createQuery(items);
    const Model = {
      modelName: 'Project',
      find: jest.fn(() => query),
      countDocuments: jest.fn(),
    };

    const result = await paginate(Model, {}, SORT, {
      mode: 'cursor',
      limit: 2,
      cursor: null,
      includeTotal: false,
      view: 'summary',
      updatedAfter: null,
    });

    expect(Model.countDocuments).not.toHaveBeenCalled();
    expect(query.select).toHaveBeenCalledWith(SUMMARY_PROJECTIONS.Project);
    expect(query.limit).toHaveBeenCalledWith(3);
    expect(result.items).toEqual(items.slice(0, 2));
    expect(result.hasNextPage).toBe(true);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(result.total).toBeNull();
  });

  it('preserves offset totals and skip behavior', async () => {
    const items = [project('alpha', '2026-07-23T12:00:00.000Z')];
    const query = createQuery(items);
    const Model = {
      modelName: 'Project',
      find: jest.fn(() => query),
      countDocuments: jest.fn().mockResolvedValue(5),
    };

    const result = await paginate(Model, {}, SORT, {
      mode: 'offset',
      page: 2,
      pageSize: 1,
      skip: 1,
      includeTotal: true,
      view: 'detail',
      updatedAfter: null,
    });

    expect(query.skip).toHaveBeenCalledWith(1);
    expect(Model.countDocuments).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(5);
    expect(result.items).toEqual(items);
  });
});
