'use strict';

const EventEmitter = require('events');

function loadDatabase({ disconnectImpl } = {}) {
  jest.resetModules();

  const connection = new EventEmitter();
  connection.readyState = 1;

  const mongoose = {
    connection,
    models: {},
    set: jest.fn(),
    connect: jest.fn(async () => {
      connection.readyState = 1;
      connection.emit('connected');
      return connection;
    }),
    disconnect:
      disconnectImpl ||
      jest.fn(async () => {
        connection.readyState = 0;
        connection.emit('disconnected');
      }),
  };

  const logger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };

  jest.doMock('mongoose', () => mongoose);
  jest.doMock('../../src/utils/logger', () => logger);

  return {
    database: require('../../src/config/database'),
    mongoose,
    connection,
    logger,
  };
}

describe('database connection logging', () => {
  afterEach(() => {
    jest.dontMock('mongoose');
    jest.dontMock('../../src/utils/logger');
  });

  it('does not log connection loss for an intentional disconnect', async () => {
    const { database, logger } = loadDatabase();

    await database.connect('mongodb://example.test/context-api');
    logger.info.mockClear();
    logger.warn.mockClear();

    await database.disconnect();

    expect(logger.warn).not.toHaveBeenCalledWith('Database connection lost');
  });

  it('logs intentional disconnect closure at info level', async () => {
    const { database, logger } = loadDatabase();

    await database.connect('mongodb://example.test/context-api');
    logger.info.mockClear();

    await database.disconnect();

    expect(logger.info).toHaveBeenCalledWith('Database connection closed');
  });

  it('logs unexpected disconnected events as connection loss warnings', () => {
    const { database, connection, logger } = loadDatabase();

    database.registerConnectionLogging();
    connection.emit('disconnected');

    expect(logger.warn).toHaveBeenCalledWith('Database connection lost');
  });

  it('resets intentional disconnect tracking on reconnect', async () => {
    const { database, connection, logger } = loadDatabase();

    await database.connect('mongodb://example.test/context-api');
    await database.disconnect();
    logger.warn.mockClear();
    logger.info.mockClear();

    await database.connect('mongodb://example.test/context-api');
    logger.info.mockClear();
    connection.emit('disconnected');

    expect(logger.warn).toHaveBeenCalledWith('Database connection lost');
    expect(logger.info).not.toHaveBeenCalledWith('Database connection closed');
  });

  it('registers connection listeners only once', async () => {
    const { database, connection } = loadDatabase();

    database.registerConnectionLogging();
    database.registerConnectionLogging();
    await database.connect('mongodb://example.test/context-api');

    expect(connection.listenerCount('connected')).toBe(1);
    expect(connection.listenerCount('disconnected')).toBe(1);
    expect(connection.listenerCount('reconnected')).toBe(1);
    expect(connection.listenerCount('error')).toBe(1);
  });

  it('propagates rejected disconnects and does not keep later disconnects intentional', async () => {
    const disconnectError = new Error('disconnect failed');
    const { database, connection, logger } = loadDatabase({
      disconnectImpl: jest.fn(async () => {
        throw disconnectError;
      }),
    });

    await database.connect('mongodb://example.test/context-api');
    logger.warn.mockClear();
    logger.info.mockClear();

    await expect(database.disconnect()).rejects.toThrow(disconnectError);

    connection.emit('disconnected');

    expect(logger.warn).toHaveBeenCalledWith('Database connection lost');
    expect(logger.info).not.toHaveBeenCalledWith('Database connection closed');
  });
});
