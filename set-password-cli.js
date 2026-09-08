// CLI entry: `npm run set-password -- <email> [password]`
//
// The app has no password-reset route, and the seed only runs on an empty
// database — so once an account exists, this is the way to change its password.
// Use it to rotate a deployed coordinator account off the demo password.
//
// Omit the password and a strong one is generated and printed.
const crypto = require('crypto');
const pool = require('./db');
const { hashPassword } = require('./password');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run set-password -- <email> [password]');
    process.exit(2);
  }

  const password = process.argv[3] || crypto.randomBytes(12).toString('base64url');
  const generated = !process.argv[3];

  const [r] = await pool.query(
    'UPDATE app_user SET password_hash = ? WHERE email = ?',
    [hashPassword(password), email]);

  if (r.affectedRows === 0) {
    console.error(`No account with email ${email}.`);
    process.exit(1);
  }

  console.log(`Password updated for ${email}.`);
  if (generated) console.log(`New password: ${password}`);
  console.log('Existing sessions stay valid until they expire; restart the app to clear them.');
}

main()
  .then(() => pool.end())
  .catch(async (e) => { console.error(e.message); await pool.end(); process.exit(1); });
