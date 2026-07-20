'use strict';

const { comparePrecedence, sortByPrecedence, resolve } = require('../../src/services/precedence.service');

function record(overrides) {
  return {
    key: 'convention',
    scope: 'global',
    status: 'active',
    priority: 0,
    version: 1,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('precedence', () => {
  it('prefers project scope over global scope', () => {
    const global = record({ key: 'global', scope: 'global' });
    const project = record({ key: 'project', scope: 'project' });

    expect(resolve([global, project]).selected.key).toBe('project');
  });

  it('prefers approved or active over draft within the same scope', () => {
    const draft = record({ key: 'draft', status: 'draft' });
    const approved = record({ key: 'approved', status: 'approved' });

    expect(resolve([draft, approved]).selected.key).toBe('approved');
  });

  it('treats approved and active as equal rank, falling through to priority', () => {
    const approved = record({ key: 'approved', status: 'approved', priority: 1 });
    const active = record({ key: 'active', status: 'active', priority: 5 });

    expect(resolve([approved, active]).selected.key).toBe('active');
  });

  it('prefers higher explicit priority when scope and status match', () => {
    const low = record({ key: 'low', priority: 10 });
    const high = record({ key: 'high', priority: 50 });

    expect(resolve([low, high]).selected.key).toBe('high');
  });

  it('prefers a higher version when priority ties', () => {
    const older = record({ key: 'v1', version: 1 });
    const newer = record({ key: 'v2', version: 3 });

    expect(resolve([older, newer]).selected.key).toBe('v2');
  });

  it('falls back to the most recent update timestamp', () => {
    const stale = record({ key: 'stale', updatedAt: new Date('2026-01-01T00:00:00.000Z') });
    const fresh = record({ key: 'fresh', updatedAt: new Date('2026-06-01T00:00:00.000Z') });

    expect(resolve([stale, fresh]).selected.key).toBe('fresh');
  });

  it('applies scope before status, so a project draft outranks a global active record', () => {
    const globalActive = record({ key: 'global', scope: 'global', status: 'active', priority: 999 });
    const projectDraft = record({ key: 'project', scope: 'project', status: 'draft', priority: 0 });

    expect(resolve([globalActive, projectDraft]).selected.key).toBe('project');
  });

  it('ranks superseded and archived records below draft', () => {
    const ordered = sortByPrecedence([
      record({ key: 'archived', status: 'archived' }),
      record({ key: 'draft', status: 'draft' }),
      record({ key: 'superseded', status: 'superseded' }),
      record({ key: 'active', status: 'active' }),
    ]).map((entry) => entry.key);

    expect(ordered).toEqual(['active', 'draft', 'superseded', 'archived']);
  });

  it('returns the outranked records so a conflict can be surfaced', () => {
    const global = record({ key: 'global', scope: 'global' });
    const project = record({ key: 'project', scope: 'project' });

    const { selected, overridden } = resolve([global, project]);

    expect(selected.key).toBe('project');
    expect(overridden.map((entry) => entry.key)).toEqual(['global']);
  });

  it('is deterministic regardless of input order', () => {
    const records = [
      record({ key: 'a', scope: 'global', status: 'draft' }),
      record({ key: 'b', scope: 'project', status: 'active', priority: 5 }),
      record({ key: 'c', scope: 'project', status: 'active', priority: 9 }),
    ];

    const forward = sortByPrecedence(records).map((entry) => entry.key);
    const reversed = sortByPrecedence([...records].reverse()).map((entry) => entry.key);

    expect(forward).toEqual(['c', 'b', 'a']);
    expect(reversed).toEqual(forward);
  });

  it('does not mutate the input array', () => {
    const records = [record({ key: 'a' }), record({ key: 'b', scope: 'project' })];
    const snapshot = records.map((entry) => entry.key);

    sortByPrecedence(records);

    expect(records.map((entry) => entry.key)).toEqual(snapshot);
  });

  it('handles missing priority and version without throwing', () => {
    const sparse = { key: 'sparse', scope: 'global', status: 'active' };
    const full = record({ key: 'full', priority: 1 });

    expect(comparePrecedence(sparse, full)).toBeGreaterThan(0);
  });

  it('returns a null selection for an empty set', () => {
    expect(resolve([])).toEqual({ selected: null, overridden: [] });
    expect(resolve(undefined)).toEqual({ selected: null, overridden: [] });
  });
});
