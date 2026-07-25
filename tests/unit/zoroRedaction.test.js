'use strict';

const {
  redactDetails,
  redactValue,
  scrubString,
  REDACTED,
} = require('../../src/services/zoro/zoroRedaction');

describe('operations log redaction', () => {
  it('drops values held under a secret-bearing key name', () => {
    const output = redactDetails({
      authorization: 'Bearer abcdef0123456789',
      token: 'ghp_realtokenvalue',
      apiKey: 'sk-live-1234',
      password: 'hunter2',
      privateKey: '-----BEGIN PRIVATE KEY-----',
      configVars: { MONGODB_URI: 'mongodb://user:pass@host/db' },
      note: 'safe text',
    });

    expect(output.authorization).toBe(REDACTED);
    expect(output.token).toBe(REDACTED);
    expect(output.apiKey).toBe(REDACTED);
    expect(output.password).toBe(REDACTED);
    expect(output.privateKey).toBe(REDACTED);
    expect(output.configVars).toBe(REDACTED);
    expect(output.note).toBe('safe text');
  });

  it('redacts secrets embedded in free text', () => {
    expect(scrubString('Authorization: Bearer abc123def456')).not.toContain('abc123def456');
    expect(scrubString('connected to mongodb://user:pass@cluster/db')).not.toContain(
      'pass@cluster'
    );
    expect(scrubString('token=ghp_live_secret')).not.toContain('ghp_live_secret');
  });

  it('strips temporary provider URLs that act as bearer credentials', () => {
    const logplex = 'https://logplex.heroku.com/sessions/abc-123?srv=1700000000';
    const presigned =
      'https://context-api.s3.amazonaws.com/slug.tgz?X-Amz-Signature=deadbeef&X-Amz-Credential=AKIA';

    expect(scrubString(`logs at ${logplex}`)).not.toContain('logplex.heroku.com');
    expect(scrubString(`slug at ${presigned}`)).not.toContain('X-Amz-Signature');
  });

  it('keeps ordinary URLs that carry no credential', () => {
    const url = 'https://github.com/kofiarhin/context-api/pull/9';

    expect(scrubString(`opened ${url}`)).toContain(url);
  });

  it('redacts nested structures without unbounded recursion', () => {
    let deep = { secret: 'value' };
    for (let index = 0; index < 12; index += 1) {
      deep = { level: deep };
    }

    const output = redactValue(deep);

    expect(JSON.stringify(output)).not.toContain('value');
  });

  it('bounds arrays and object breadth', () => {
    const wide = { items: Array.from({ length: 500 }, (_, index) => index) };

    expect(redactValue(wide).items).toHaveLength(50);
  });

  it('normalizes a non-object details payload rather than dropping it', () => {
    expect(redactDetails('a plain note')).toEqual({ value: 'a plain note' });
    expect(redactDetails(undefined)).toBeNull();
  });

  it('preserves numbers and booleans', () => {
    expect(redactValue({ count: 3, ok: true })).toEqual({ count: 3, ok: true });
  });
});
