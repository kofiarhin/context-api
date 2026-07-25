'use strict';

module.exports = {
  testEnvironment: 'node',
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  // Runs in every test process before any test: strips ambient provider
  // credentials so the suite never inherits a developer's local .env or shell.
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/client/'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/seeds/data/**'],
  // The in-memory MongoDB instance is shared, so suites must not race on it.
  maxWorkers: 1,
  testTimeout: 30000,
  clearMocks: true,
};
