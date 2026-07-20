'use strict';

const mongoose = require('mongoose');

const logger = require('../utils/logger');

const STATE_NAMES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

mongoose.set('strictQuery', true);

let listenersRegistered = false;
let intentionalDisconnect = false;

/**
 * Logs connection state transitions once per process. Connection strings are
 * never included, only the resulting state name.
 */
function registerConnectionLogging() {
  if (listenersRegistered) {
    return;
  }

  const connection = mongoose.connection;

  connection.on('connected', () => logger.info('Database connection established'));
  connection.on('disconnected', () => {
    if (intentionalDisconnect) {
      intentionalDisconnect = false;
      logger.info('Database connection closed');
      return;
    }

    logger.warn('Database connection lost');
  });
  connection.on('reconnected', () => logger.info('Database connection restored'));
  connection.on('error', (error) => {
    logger.error('Database connection error', { errorName: error.name });
  });

  listenersRegistered = true;
}

function getConnectionState() {
  return STATE_NAMES[mongoose.connection.readyState] || 'unknown';
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

async function connect(uri, options = {}) {
  registerConnectionLogging();
  intentionalDisconnect = false;

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    ...options,
  });

  return mongoose.connection;
}

async function disconnect() {
  if (mongoose.connection.readyState === 0) {
    intentionalDisconnect = false;
    return;
  }

  intentionalDisconnect = true;

  try {
    await mongoose.disconnect();
  } catch (error) {
    intentionalDisconnect = false;
    throw error;
  }
}

/**
 * Builds every index declared on registered models.
 *
 * Mongoose autoIndex handles this in development, but running it explicitly
 * gives deployment validation a place to fail loudly on a bad index.
 */
async function verifyIndexes() {
  const results = [];

  for (const model of Object.values(mongoose.models)) {
    await model.createIndexes();
    results.push(model.modelName);
  }

  return results;
}

module.exports = {
  connect,
  disconnect,
  getConnectionState,
  isConnected,
  registerConnectionLogging,
  verifyIndexes,
  STATE_NAMES,
};
