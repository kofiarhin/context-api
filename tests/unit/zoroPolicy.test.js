'use strict';

const policy = require('../../src/services/zoro/zoroPolicy');
const catalogue = require('../../src/services/zoro/zoroCatalogue');

const APPROVAL = {
  approvedBy: 'Kofi',
  authority: 'decision-record-42',
  reason: 'Release the queued hotfix.',
};

const CONFIRMATION = {
  confirmed: true,
  resourceType: 'file',
  resourceId: 'kofiarhin/context-api:src/legacy.js',
  reason: 'The module is dead code.',
};

function expectDenied(run) {
  expect(run).toThrow(expect.objectContaining({ statusCode: 403 }));
}

describe('zoro dispatcher approval policy', () => {
  it('lets read and ordinary write operations proceed without approval', () => {
    expect(() => policy.requireKofiApproval(undefined, 'read')).not.toThrow();
    expect(() => policy.requireKofiApproval(undefined, 'write')).not.toThrow();
  });

  it.each([
    'merge',
    'production-sensitive',
    'security-sensitive',
    'billing',
    'access-admin',
    'destructive',
  ])('requires explicit Kofi approval for %s operations', (classification) => {
    expectDenied(() => policy.requireKofiApproval(undefined, classification));
    expect(() => policy.requireKofiApproval(APPROVAL, classification)).not.toThrow();
  });

  it('refuses approval from anyone other than Kofi', () => {
    expectDenied(() => policy.requireKofiApproval({ ...APPROVAL, approvedBy: 'Zoro' }, 'merge'));
    expectDenied(() => policy.requireKofiApproval({ ...APPROVAL, approvedBy: 'kofi' }, 'merge'));
  });

  it('refuses approval that states no authority or no substantive reason', () => {
    expectDenied(() => policy.requireKofiApproval({ ...APPROVAL, authority: '' }, 'merge'));
    expectDenied(() => policy.requireKofiApproval({ ...APPROVAL, reason: 'ok' }, 'merge'));
    expectDenied(() => policy.requireKofiApproval({ ...APPROVAL, reason: '        ' }, 'merge'));
  });

  it('rejects an unknown approval field rather than ignoring a typo', () => {
    expect(() => policy.requireKofiApproval({ ...APPROVAL, approver: 'Kofi' }, 'merge')).toThrow(
      /Unknown approval field: approver/
    );
  });

  it('rejects a non-object approval', () => {
    expect(() => policy.requireKofiApproval('Kofi', 'merge')).toThrow(/approval must be an object/);
    expect(() => policy.requireKofiApproval([], 'merge')).toThrow(/approval must be an object/);
  });
});

describe('zoro dispatcher destructive confirmation policy', () => {
  const expected = { resourceType: 'file', resourceId: 'kofiarhin/context-api:src/legacy.js' };

  it('accepts an exact confirmation', () => {
    expect(() => policy.requireExactConfirmation(CONFIRMATION, expected)).not.toThrow();
  });

  it('refuses a bare confirmed flag', () => {
    expectDenied(() => policy.requireExactConfirmation({ confirmed: true }, expected));
  });

  it('refuses a missing confirmation', () => {
    expectDenied(() => policy.requireExactConfirmation(undefined, expected));
  });

  it('refuses a confirmation naming a different resource type', () => {
    expectDenied(() =>
      policy.requireExactConfirmation({ ...CONFIRMATION, resourceType: 'branch' }, expected)
    );
  });

  it('refuses a confirmation naming a different resource id', () => {
    expectDenied(() =>
      policy.requireExactConfirmation(
        { ...CONFIRMATION, resourceId: 'kofiarhin/context-api:src/app.js' },
        expected
      )
    );
  });

  it('refuses confirmed: false and truthy non-true values', () => {
    expectDenied(() =>
      policy.requireExactConfirmation({ ...CONFIRMATION, confirmed: false }, expected)
    );
    expectDenied(() =>
      policy.requireExactConfirmation({ ...CONFIRMATION, confirmed: 'yes' }, expected)
    );
  });

  it('rejects an unknown confirmation field', () => {
    expect(() =>
      policy.requireExactConfirmation({ ...CONFIRMATION, force: true }, expected)
    ).toThrow(/Unknown confirmation field: force/);
  });
});

describe('zoro dispatcher expected-state policy', () => {
  const updateFile = catalogue.getDispatcher('github.write').operations.updateFile;
  const merge = catalogue.getDispatcher('github.review').operations.mergePullRequest;

  it('requires the expected SHA before a file update', () => {
    expect(() => policy.requireExpectedState(updateFile, {})).toThrow(/sha is required/);
    expect(() => policy.requireExpectedState(updateFile, { sha: 'abc123' })).not.toThrow();
  });

  it('requires the expected head SHA before a merge', () => {
    expect(() => policy.requireExpectedState(merge, {})).toThrow(/expectedHeadSha is required/);
    expect(() => policy.requireExpectedState(merge, { expectedHeadSha: 'abc123' })).not.toThrow();
  });

  it('treats a blank expected state as absent', () => {
    expect(() => policy.requireExpectedState(updateFile, { sha: '   ' })).toThrow(
      /sha is required/
    );
  });

  it('leaves operations without an expected-state requirement alone', () => {
    const listRepositories = catalogue.getDispatcher('github.read').operations.listRepositories;

    expect(() => policy.requireExpectedState(listRepositories, {})).not.toThrow();
  });
});

describe('zoro dispatcher combined enforcement', () => {
  const deleteFile = catalogue.getDispatcher('github.destructive').operations.deleteFile;

  const parameters = {
    owner: 'kofiarhin',
    repo: 'context-api',
    path: 'src/legacy.js',
    sha: 'abc123',
  };

  it('accepts a fully evidenced destructive request', () => {
    expect(() =>
      policy.enforce({
        operation: deleteFile,
        parameters,
        approval: APPROVAL,
        confirmation: CONFIRMATION,
      })
    ).not.toThrow();
  });

  it('refuses a destructive request that carries approval but no confirmation', () => {
    expectDenied(() => policy.enforce({ operation: deleteFile, parameters, approval: APPROVAL }));
  });

  it('refuses a destructive request that carries confirmation but no approval', () => {
    expectDenied(() =>
      policy.enforce({ operation: deleteFile, parameters, confirmation: CONFIRMATION })
    );
  });

  it('checks the expected SHA before asking for approval evidence', () => {
    expect(() =>
      policy.enforce({
        operation: deleteFile,
        parameters: { ...parameters, sha: undefined },
        approval: APPROVAL,
        confirmation: CONFIRMATION,
      })
    ).toThrow(/sha is required/);
  });

  it('derives the confirmation target from the request, not the confirmation', () => {
    expect(policy.expectedConfirmation(deleteFile, parameters)).toEqual({
      resourceType: 'file',
      resourceId: 'kofiarhin/context-api:src/legacy.js',
    });
  });

  it('derives an archive confirmation target from the record identifier', () => {
    const archiveProject = catalogue.getDispatcher('engineering.archive').operations.archiveProject;

    expect(policy.expectedConfirmation(archiveProject, { identifier: 'ideas-hub' })).toEqual({
      resourceType: 'projects',
      resourceId: 'ideas-hub',
    });
  });
});
