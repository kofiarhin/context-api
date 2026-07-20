'use strict';

const { connect, disconnect } = require('../../src/config/database');
const { REGISTRY } = require('../../src/seeds/registry');

async function connectTestDb() {
  await connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
}

async function clearTestDb() {
  for (const domain of REGISTRY) {
    await domain.Model.deleteMany({});
  }
}

async function closeTestDb() {
  await disconnect();
}

module.exports = { connectTestDb, clearTestDb, closeTestDb };
