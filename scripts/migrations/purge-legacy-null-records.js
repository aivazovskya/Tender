require('tsx/cjs');
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/tender_db?schema=public";
}

const { purgeLegacyNullRecords } = require('./purge-legacy-null-records.ts');

purgeLegacyNullRecords()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
