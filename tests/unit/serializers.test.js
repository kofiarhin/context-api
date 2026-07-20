'use strict';

const serializers = require('../../src/serializers');

const INTERNAL = {
  _id: '68b0f0f0f0f0f0f0f0f0f0f0',
  __v: 3,
  internalMigrationFlag: true,
  mongodbUri: 'mongodb://user:secret@host/db',
};

describe('serializers', () => {
  it('exposes an explicit profile allowlist and drops internals', () => {
    const output = serializers.serializeProfile({
      ...INTERNAL,
      key: 'primary',
      displayName: 'Kofi Arhin',
      preferredStack: ['node'],
      source: { type: 'user-approved', reference: 'docs/PRD.md' },
      status: 'active',
      version: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    expect(output.key).toBe('primary');
    expect(output.displayName).toBe('Kofi Arhin');
    expect(output.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(output).not.toHaveProperty('_id');
    expect(output).not.toHaveProperty('__v');
    expect(output).not.toHaveProperty('internalMigrationFlag');
    expect(output).not.toHaveProperty('mongodbUri');
  });

  it('defaults missing array fields to empty arrays', () => {
    const output = serializers.serializeProfile({ key: 'primary', displayName: 'Kofi Arhin' });

    expect(output.professionalRoles).toEqual([]);
    expect(output.preferredStack).toEqual([]);
    expect(output.communicationPreferences).toEqual([]);
  });

  it('normalizes a missing source to null rather than omitting it', () => {
    const output = serializers.serializeProfile({ key: 'primary', displayName: 'Kofi Arhin' });

    expect(output.source).toBeNull();
  });

  it('serializes a source reference that was never set as null', () => {
    expect(serializers.serializeSource({ type: 'repository' })).toEqual({
      type: 'repository',
      reference: null,
    });
  });

  it('converts nested milestone dates to ISO strings', () => {
    const output = serializers.serializeProject({
      ...INTERNAL,
      projectId: 'context-api',
      slug: 'context-api',
      name: 'Context API',
      lifecycleState: 'active',
      milestones: [
        { key: 'm1', title: 'Foundation', status: 'complete', targetDate: new Date('2026-03-01T00:00:00.000Z') },
        { key: 'm2', title: 'Validation', status: 'open', targetDate: null },
      ],
    });

    expect(output.milestones[0].targetDate).toBe('2026-03-01T00:00:00.000Z');
    expect(output.milestones[1].targetDate).toBeNull();
    expect(output).not.toHaveProperty('_id');
  });

  it('keeps learning review metadata visible so drafts stay distinguishable', () => {
    const output = serializers.serializeLearning({
      learningId: 'example',
      title: 'Example',
      content: 'Body',
      category: 'workflow',
      reviewStatus: 'unreviewed',
      status: 'draft',
      supersedes: null,
    });

    expect(output.reviewStatus).toBe('unreviewed');
    expect(output.status).toBe('draft');
    expect(output.supersedes).toBeNull();
  });

  it('serializes an instruction set without content as null', () => {
    const output = serializers.serializeInstructionSet({
      key: 'discovery-workflow',
      title: 'Discovery',
      workflowStage: 'discovery',
      instructions: ['One'],
    });

    expect(output.content).toBeNull();
    expect(output.instructions).toEqual(['One']);
  });

  it('maps a collection through a serializer', () => {
    const output = serializers.serializeMany(serializers.serializeTask)([
      { ...INTERNAL, taskId: 't1', title: 'One', projectId: 'p', status: 'ready', priority: 'high' },
      { ...INTERNAL, taskId: 't2', title: 'Two', projectId: 'p', status: 'done', priority: 'low' },
    ]);

    expect(output).toHaveLength(2);
    expect(output.map((task) => task.taskId)).toEqual(['t1', 't2']);
    output.forEach((task) => {
      expect(task).not.toHaveProperty('_id');
      expect(task).not.toHaveProperty('__v');
    });
  });
});
