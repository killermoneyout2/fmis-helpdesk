// CLI entry: `npm run setup-db`
const { initDb } = require('./setup-db');
initDb()
  .then(() => { console.log('Setup complete.'); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
