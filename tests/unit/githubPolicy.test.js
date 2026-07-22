'use strict';

const policy = require('../../src/services/githubPolicy');

describe('githubPolicy owner and repository validation', () => {
  it.each(['kofiarhin', 'a', 'my-org', 'Org123', 'a-b-c'])('accepts the owner %s', (owner) => {
    expect(policy.assertOwner(owner)).toBe(owner);
  });

  it.each(['', '-leading', 'trailing-', 'has space', 'has_underscore', 'a--b', 'a'.repeat(101)])(
    'rejects the owner %p',
    (owner) => {
      expect(() => policy.assertOwner(owner)).toThrow(/validation failed/i);
    }
  );

  it.each(['context-api', 'repo.name', 'repo_name', 'a', 'A1'])(
    'accepts the repository %s',
    (repo) => {
      expect(policy.assertRepositoryName(repo)).toBe(repo);
    }
  );

  it.each(['', '.', '..', 'has space', 'has/slash', 'a'.repeat(101)])(
    'rejects the repository %p',
    (repo) => {
      expect(() => policy.assertRepositoryName(repo)).toThrow(/validation failed/i);
    }
  );

  it('rejects a non-string owner', () => {
    expect(() => policy.assertOwner(42)).toThrow(/validation failed/i);
  });
});

describe('githubPolicy ref validation', () => {
  it.each(['main', 'master', 'feature/github-gateway', 'release/1.0', 'v1.2.3'])(
    'accepts the ref %s',
    (ref) => {
      expect(policy.assertRef(ref)).toBe(ref);
    }
  );

  it.each([
    ['empty', ''],
    ['traversal', 'feature/../main'],
    ['reflog syntax', 'main@{1}'],
    ['double slash', 'feature//x'],
    ['leading slash', '/main'],
    ['trailing slash', 'main/'],
    ['trailing dot', 'main.'],
    ['lock suffix', 'main.lock'],
    ['space', 'my branch'],
    ['tilde', 'main~1'],
    ['caret', 'main^'],
    ['colon', 'a:b'],
    ['question mark', 'a?b'],
    ['asterisk', 'a*b'],
    ['backslash', 'a\\b'],
    ['leading dash', '-main'],
    ['too long', 'a'.repeat(256)],
  ])('rejects a ref with %s', (label, ref) => {
    expect(() => policy.assertRef(ref)).toThrow(/validation failed/i);
  });

  it('rejects a ref containing a control character', () => {
    expect(() => policy.assertRef('main\x01')).toThrow(/validation failed/i);
  });
});

describe('githubPolicy path normalization', () => {
  it('collapses redundant separators', () => {
    expect(policy.normalizeRepositoryPath('docs//example.md')).toBe('docs/example.md');
  });

  it('preserves an ordinary nested path exactly', () => {
    expect(policy.normalizeRepositoryPath('src/routes/v1/github.js')).toBe(
      'src/routes/v1/github.js'
    );
  });

  it('allows an empty path when the caller opts in', () => {
    expect(policy.normalizeRepositoryPath('', 'path', { allowEmpty: true })).toBe('');
  });

  it('rejects an empty path by default', () => {
    expect(() => policy.normalizeRepositoryPath('')).toThrow(/validation failed/i);
  });

  it.each([
    ['parent traversal', '../secrets'],
    ['embedded traversal', 'docs/../../etc/passwd'],
    ['current directory segment', 'docs/./example.md'],
    ['absolute path', '/etc/passwd'],
    ['backslash separator', 'docs\\example.md'],
  ])('rejects %s', (label, path) => {
    expect(() => policy.normalizeRepositoryPath(path)).toThrow(/validation failed/i);
  });

  it('rejects a path containing a null byte', () => {
    expect(() => policy.normalizeRepositoryPath('docs/a\x00b.md')).toThrow(/validation failed/i);
  });

  it('rejects a path beyond the maximum length', () => {
    expect(() => policy.normalizeRepositoryPath(`${'a'.repeat(1025)}.md`)).toThrow(
      /validation failed/i
    );
  });
});

describe('githubPolicy workflow path protection', () => {
  it.each([
    '.github/workflows',
    '.github/workflows/ci.yml',
    '.github/workflows/nested/deep.yml',
    '.GitHub/Workflows/ci.yml',
    '.GITHUB/WORKFLOWS/ci.yml',
  ])('denies writes to %s', (path) => {
    const normalized = policy.normalizeRepositoryPath(path);

    expect(() => policy.assertWritablePath(normalized)).toThrow(/\.github\/workflows/i);
  });

  it('reports the denial as a forbidden error, not a validation error', () => {
    let thrown;

    try {
      policy.assertWritablePath('.github/workflows/ci.yml');
    } catch (error) {
      thrown = error;
    }

    expect(thrown.statusCode).toBe(403);
    expect(thrown.code).toBe('GITHUB_FORBIDDEN');
  });

  it.each(['.github/dependabot.yml', '.github/ISSUE_TEMPLATE/bug.md', 'docs/workflows/ci.yml'])(
    'allows writes to %s',
    (path) => {
      expect(policy.assertWritablePath(path)).toBe(path);
    }
  );

  it('cannot be bypassed by traversal back into the workflows directory', () => {
    expect(() => policy.normalizeRepositoryPath('docs/../.github/workflows/ci.yml')).toThrow(
      /validation failed/i
    );
  });
});

describe('githubPolicy content policy', () => {
  it('accepts UTF-8 text including multi-byte characters', () => {
    const content = 'Hello — world 👋\n';

    expect(policy.assertTextContent(content)).toBe(content);
  });

  it('accepts empty content', () => {
    expect(policy.assertTextContent('')).toBe('');
  });

  it('rejects content containing a null byte as binary', () => {
    let thrown;

    try {
      policy.assertTextContent('binary\x00data');
    } catch (error) {
      thrown = error;
    }

    expect(thrown.statusCode).toBe(415);
    expect(thrown.code).toBe('UNSUPPORTED_CONTENT');
  });

  it('rejects a lone surrogate as invalid UTF-8', () => {
    expect(() => policy.assertTextContent('bad \uD800 half')).toThrow(/UTF-8/i);
  });

  it('accepts content at exactly the size limit', () => {
    const content = 'a'.repeat(policy.MAX_CONTENT_LENGTH);

    expect(policy.assertContentSize(content)).toBe(content);
  });

  it('rejects content beyond the size limit', () => {
    expect(() => policy.assertContentSize('a'.repeat(policy.MAX_CONTENT_LENGTH + 1))).toThrow(
      /validation failed/i
    );
  });
});

describe('githubPolicy commit messages', () => {
  it('accepts a single-line message', () => {
    expect(policy.assertCommitMessage('docs: add example')).toBe('docs: add example');
  });

  it('accepts a multi-line message with a body', () => {
    const message = 'docs: add example\n\nExplains the gateway.';

    expect(policy.assertCommitMessage(message)).toBe(message);
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['too long', 'a'.repeat(251)],
  ])('rejects a %s message', (label, message) => {
    expect(() => policy.assertCommitMessage(message)).toThrow(/validation failed/i);
  });

  it('rejects a message containing a control character', () => {
    expect(() => policy.assertCommitMessage('docs: add\x07example')).toThrow(/validation failed/i);
  });
});

describe('githubPolicy SHA validation', () => {
  it('accepts a 40-character hexadecimal SHA', () => {
    const sha = 'a'.repeat(40);

    expect(policy.assertCommitSha(sha, 'sha')).toBe(sha);
  });

  it.each([
    ['short', 'abc'],
    ['non hex', 'z'.repeat(40)],
    ['too long', 'a'.repeat(41)],
  ])('rejects a %s SHA', (label, sha) => {
    expect(() => policy.assertCommitSha(sha, 'sha')).toThrow(/validation failed/i);
  });
});

describe('githubPolicy enums and numbers', () => {
  it.each(['merge', 'squash', 'rebase'])('accepts the merge method %s', (method) => {
    expect(policy.assertMergeMethod(method)).toBe(method);
  });

  it.each(['force', 'fast-forward', 'MERGE', ''])('rejects the merge method %p', (method) => {
    expect(() => policy.assertMergeMethod(method)).toThrow(/validation failed/i);
  });

  it.each(['open', 'closed'])('accepts the pull request state %s', (state) => {
    expect(policy.assertPullRequestState(state)).toBe(state);
  });

  it.each(['merged', 'draft', 'OPEN'])('rejects the pull request state %p', (state) => {
    expect(() => policy.assertPullRequestState(state)).toThrow(/validation failed/i);
  });

  it('accepts a positive pull request number', () => {
    expect(policy.assertPullRequestNumber('42')).toBe(42);
  });

  it.each(['0', '-1', 'abc', '1.5', ''])('rejects the pull request number %p', (value) => {
    expect(() => policy.assertPullRequestNumber(value)).toThrow(/validation failed/i);
  });
});
