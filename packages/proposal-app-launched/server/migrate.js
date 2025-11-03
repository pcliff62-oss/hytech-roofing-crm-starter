const fs = require('fs');
const path = require('path');
require('dotenv').config();

(async () => {
  const hasDb = !!process.env.DATABASE_URL;
  if (!hasDb) {
    console.log('No DATABASE_URL set; skipping migrations');
    process.exit(0);
  }
  try {
    const pg = require('./pg_adapter');
    await pg.init();
    console.log('Migrations applied (pg_adapter init ran)');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed', e);
    process.exit(1);
  }
})();
