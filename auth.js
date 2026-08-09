const router = require('express').Router();
const pool = require('../db');
const { hashPassword, verifyPassword } = require('../password');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function sessionUser(u) {
  return { user_id: u.user_id, name: u.full_name, email: u.email, type: u.user_type, role: u.role };
}

// POST /api/auth/register  { name, email, password, user_type }
// Self-service sign-up for students and staff. Always creates a requester.
router.post('/register', ah(async (req, res) => {
  const { name, email, password, user_type } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const type = user_type === 'staff' ? 'staff' : 'student';
  const em = String(email).trim().toLowerCase();

  const [exists] = await pool.query('SELECT user_id FROM app_user WHERE email = ?', [em]);
  if (exists.length) {
    return res.status(409).json({ error: 'An account with that email already exists. Try signing in.' });
  }

  const [r] = await pool.query(
    'INSERT INTO app_user (full_name, email, password_hash, user_type, role) VALUES (?,?,?,?,?)',
    [String(name).trim(), em, hashPassword(password), type, 'requester']);
  const [[user]] = await pool.query('SELECT * FROM app_user WHERE user_id = ?', [r.insertId]);
  req.session.user = sessionUser(user);
  res.status(201).json({ user: req.session.user });
}));

// POST /api/auth/login  { email, password }
router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const em = String(email).trim().toLowerCase();

  const [rows] = await pool.query('SELECT * FROM app_user WHERE email = ?', [em]);
  const user = rows[0];
  // Same generic message whether the email is unknown or the password is wrong.
  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (!user.is_active) return res.status(403).json({ error: 'This account is disabled.' });

  req.session.user = sessionUser(user);
  res.json({ user: req.session.user });
}));

router.post('/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
router.get('/me', (req, res) => res.json({ user: req.session.user || null }));

module.exports = router;
