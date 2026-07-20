'use strict';

const { getEnv } = require('../config/env');
const { connect, disconnect } = require('../config/database');
const { seedAll, resetAll, summarize } = require('./runner');

function write(line) {
  process.stdout.write(`${line}\n`);
}

function writeError(line) {
  process.stderr.write(`${line}\n`);
}

function reportDomains(result) {
  write('');
  write('domain                inserted  updated  unchanged  failed');
  write('------------------------------------------------------------');

  for (const [name, counts] of Object.entries(result.domains)) {
    write(
      [
        name.padEnd(20),
        String(counts.inserted).padStart(8),
        String(counts.updated).padStart(9),
        String(counts.unchanged).padStart(10),
        String(counts.failed).padStart(8),
      ].join(' ')
    );
  }

  const totals = summarize(result);
  write('------------------------------------------------------------');
  write(
    [
      'total'.padEnd(20),
      String(totals.inserted).padStart(8),
      String(totals.updated).padStart(9),
      String(totals.unchanged).padStart(10),
      String(totals.failed).padStart(8),
    ].join(' ')
  );
  write('');
}

async function main(argv = process.argv.slice(2)) {
  const shouldReset = argv.includes('--reset');
  const env = getEnv();

  await connect(env.mongodbUri);

  try {
    if (shouldReset) {
      const cleared = await resetAll();
      write(`Reset cleared collections: ${cleared.join(', ')}`);
    }

    const result = await seedAll();

    if (!result.ok && result.phase === 'validation') {
      writeError('Seed validation failed. No records were written.');
      result.problems.forEach((problem) => writeError(`  - ${problem}`));
      return 1;
    }

    reportDomains(result);

    if (!result.ok) {
      writeError('Seed completed with failures:');

      for (const [name, counts] of Object.entries(result.domains)) {
        counts.errors.forEach((error) => writeError(`  - ${name}: ${error}`));
      }

      return 1;
    }

    write('Seed completed successfully.');
    return 0;
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      writeError(`Seed failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { main };
