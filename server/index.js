const path = require('path');
const express = require('express');
const session = require('express-session');
const cfg = require('./config');
const pool = require('./db');
const { initDb } = require('./setup-db');

const app = express();
app.use(express.json());
app.use(session({
  secret: cfg.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error.' });
});

// On boot, initialise the database automatically if it is empty.
// This makes deployment a single step ("push and go") and means a
// fresh local checkout also just works after `npm start`.
async function ensureInitialised() {
  try {
    const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM app_user');
    return row.n > 0;
  } catch (e) {
    return false; // table missing -> not initialised yet
  }
}

(async () => {
  if (!(await ensureInitialised())) {
    console.log('Database is empty — initialising schema and demo data…');
    try { await initDb(); } catch (e) { console.error('Initialisation failed:', e.message); }
  }
  app.listen(cfg.port, () => {
    console.log('FMIS running on http://localhost:' + cfg.port);
  });
})();
