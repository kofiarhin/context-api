'use strict';

const { getEnv } = require('../src/config/env');
const { connect, disconnect, verifyIndexes } = require('../src/config/database');
require('../src/models');

async function main() {
  const env = getEnv();
  await connect(env.mongodbUri, { autoIndex: false });

  try {
    const models = await verifyIndexes();
    process.stdout.write(`Verified indexes for: ${models.join(', ')}\n`);
  } finally {
    await disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`Production verification failed: ${error.message}\n`);
  process.exit(1);
});