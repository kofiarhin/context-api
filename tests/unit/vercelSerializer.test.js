'use strict';

const serializer = require('../../src/serializers/vercel.serializer');
const { createService } = require('../../src/services/vercel.service');

// Shape mirrors the real `GET /v2/user` response: the user object is wrapped in
// a `user` envelope. Values are fabricated — never put real account data here.
function userEnvelopeFixture(overrides = {}) {
  return {
    user: {
      id: 'FhJt2M9xQ4vB7pLn',
      username: 'zoro-gateway',
      name: 'Zoro Gateway',
      email: 'gateway@example.test',
      // Must not leak into the serialized response.
      avatar: '4c2f1a9d8e7b6c5a4f3e2d1c0b9a8f7e',
      defaultTeamId: 'team_8Kq3RwZ',
      version: 'northstar',
      limited: false,
      ...overrides,
    },
  };
}

const ALLOWLISTED = ['email', 'id', 'name', 'username'];

describe('Vercel user serialization', () => {
  it('unwraps the upstream user envelope', () => {
    const serialized = serializer.user(userEnvelopeFixture());

    expect(serialized.id).toBe('FhJt2M9xQ4vB7pLn');
    expect(serialized.username).toBe('zoro-gateway');
    expect(serialized.name).toBe('Zoro Gateway');
    expect(serialized.email).toBe('gateway@example.test');
  });

  it('exposes exactly the allowlisted fields from an envelope', () => {
    const serialized = serializer.user(userEnvelopeFixture());

    expect(Object.keys(serialized).sort()).toEqual(ALLOWLISTED);
  });

  it('drops unrelated upstream fields', () => {
    const serialized = serializer.user(userEnvelopeFixture());

    expect(serialized.avatar).toBeUndefined();
    expect(serialized.defaultTeamId).toBeUndefined();
    expect(serialized.version).toBeUndefined();
    expect(serialized.limited).toBeUndefined();
  });

  it('never carries provider credentials through the envelope', () => {
    const serialized = serializer.user(
      userEnvelopeFixture({ token: 'provider-secret-token', accessToken: 'provider-secret-token' })
    );

    expect(JSON.stringify(serialized)).not.toContain('provider-secret-token');
  });

  it('still serializes an already-unwrapped user object', () => {
    const serialized = serializer.user({ id: 'user_1', username: 'kofi' });

    expect(serialized).toEqual({ id: 'user_1', username: 'kofi' });
  });

  it('omits absent fields rather than emitting undefined keys', () => {
    const serialized = serializer.user({ user: { id: 'user_1' } });

    expect(Object.keys(serialized)).toEqual(['id']);
  });

  it('returns an empty object for an empty envelope', () => {
    expect(serializer.user({ user: {} })).toEqual({});
    expect(serializer.user({})).toEqual({});
    expect(serializer.user()).toEqual({});
  });
});

describe('Vercel service getUser', () => {
  it('serializes the upstream envelope returned by the client', async () => {
    const client = { request: jest.fn().mockResolvedValue(userEnvelopeFixture()) };
    const service = createService({ client, env: {}, policy: {} });

    const result = await service.getUser();

    expect(client.request).toHaveBeenCalledWith('GET', '/v2/user');
    expect(result).toEqual({
      id: 'FhJt2M9xQ4vB7pLn',
      username: 'zoro-gateway',
      name: 'Zoro Gateway',
      email: 'gateway@example.test',
    });
  });
});
