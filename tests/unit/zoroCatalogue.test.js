'use strict';

const catalogue = require('../../src/services/zoro/zoroCatalogue');
const vercelDispatcher = require('../../src/services/vercelDispatcher');
const herokuRoutes = require('../../src/services/heroku/herokuRoutes');

const EXPECTED_DISPATCHERS = [
  'health.check',
  'context.resolve',
  'engineering.read',
  'engineering.write',
  'engineering.archive',
  'github.read',
  'github.write',
  'github.review',
  'github.destructive',
  'vercel.read',
  'vercel.write',
  'vercel.destructive',
  'heroku.execute',
  'opslog.read',
  'opslog.write',
];

describe('unified engineering catalogue', () => {
  it('exposes exactly the fifteen approved dispatcher ids', () => {
    expect(catalogue.DISPATCHER_IDS).toEqual(EXPECTED_DISPATCHERS);
  });

  it('gives every dispatcher a non-empty closed operation list', () => {
    for (const id of catalogue.DISPATCHER_IDS) {
      const dispatcher = catalogue.getDispatcher(id);
      const names = Object.keys(dispatcher.operations);

      expect(names.length).toBeGreaterThan(0);
      expect(Object.isFrozen(dispatcher.operations)).toBe(true);
    }
  });

  it('returns null for an unknown dispatcher rather than a default', () => {
    expect(catalogue.getDispatcher('github.everything')).toBeNull();
    expect(catalogue.getDispatcher('__proto__')).toBeNull();
    expect(catalogue.getDispatcher('constructor')).toBeNull();
  });

  it('returns null for an unknown operation rather than a default', () => {
    const dispatcher = catalogue.getDispatcher('github.read');

    expect(catalogue.getOperation(dispatcher, 'deleteEverything')).toBeNull();
    expect(catalogue.getOperation(dispatcher, 'toString')).toBeNull();
  });

  it('never lets an operation name an upstream method or path', () => {
    for (const id of catalogue.DISPATCHER_IDS) {
      for (const operation of Object.values(catalogue.getDispatcher(id).operations)) {
        expect(operation).not.toHaveProperty('path');
        expect(operation).not.toHaveProperty('url');
        expect(operation).not.toHaveProperty('httpMethod');
        expect(operation.target).toEqual(expect.any(String));
        expect(operation.method).toEqual(expect.any(String));
      }
    }
  });

  it('classifies every operation from the approved set', () => {
    const allowed = new Set(Object.values(catalogue.CLASSIFICATIONS));

    for (const id of catalogue.DISPATCHER_IDS) {
      for (const operation of Object.values(catalogue.getDispatcher(id).operations)) {
        expect(allowed.has(operation.classification)).toBe(true);
      }
    }
  });

  it('requires approval for merge, sensitive, billing, admin, and destructive work', () => {
    expect([...catalogue.APPROVAL_REQUIRED].sort()).toEqual(
      [
        'access-admin',
        'billing',
        'destructive',
        'merge',
        'production-sensitive',
        'security-sensitive',
      ].sort()
    );

    expect(catalogue.APPROVAL_REQUIRED.has('read')).toBe(false);
    expect(catalogue.APPROVAL_REQUIRED.has('write')).toBe(false);
  });

  it('marks branch, file, and merge operations state-sensitive', () => {
    const write = catalogue.getDispatcher('github.write').operations;
    const review = catalogue.getDispatcher('github.review').operations;
    const destructive = catalogue.getDispatcher('github.destructive').operations;

    expect(write.updateBranch.expectedState).toBe('expectedCurrentSha');
    expect(write.updateFile.expectedState).toBe('sha');
    expect(review.mergePullRequest.expectedState).toBe('expectedHeadSha');
    expect(destructive.deleteFile.expectedState).toBe('sha');
  });

  it('requires Kofi approval to merge a pull request', () => {
    expect(
      catalogue.getDispatcher('github.review').operations.mergePullRequest.classification
    ).toBe('merge');
  });

  it('reuses the existing Vercel catalogue rather than a second copy', () => {
    for (const category of ['read', 'write', 'destructive']) {
      expect(Object.keys(catalogue.getDispatcher(`vercel.${category}`).operations).sort()).toEqual(
        Object.keys(vercelDispatcher.CATALOG[category]).sort()
      );
    }
  });

  it('reuses the existing Heroku route allowlist rather than a second copy', () => {
    expect(Object.keys(catalogue.getDispatcher('heroku.execute').operations).sort()).toEqual(
      herokuRoutes.map((descriptor) => descriptor.operationId).sort()
    );
  });

  it('classifies every archive operation as destructive', () => {
    for (const operation of Object.values(
      catalogue.getDispatcher('engineering.archive').operations
    )) {
      expect(operation.classification).toBe('destructive');
    }
  });

  it('marks only the database-backed dispatchers as requiring MongoDB', () => {
    const requiring = catalogue.DISPATCHER_IDS.filter(
      (id) => catalogue.getDispatcher(id).requiresDatabase
    );

    expect(requiring.sort()).toEqual(
      [
        'context.resolve',
        'engineering.archive',
        'engineering.read',
        'engineering.write',
        'opslog.read',
        'opslog.write',
      ].sort()
    );
  });
});
