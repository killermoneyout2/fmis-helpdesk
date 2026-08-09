const router = require('express').Router();
const pool = require('../db');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not signed in.' });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Not permitted.' });
    }
    next();
  };
}

// Reference data for dropdowns
router.get('/meta', requireAuth, ah(async (req, res) => {
  const [categories] = await pool.query('SELECT category_id, category_name FROM problem_category ORDER BY category_name');
  const [statuses] = await pool.query('SELECT status_id, status_name FROM status ORDER BY status_id');
  const [technicians] = await pool.query(
    `SELECT u.user_id, u.full_name, t.trade_name
       FROM app_user u JOIN trade t ON t.trade_id = u.trade_id
      WHERE u.role = 'technician' ORDER BY u.full_name`);
  res.json({ categories, statuses, technicians });
}));

// Coordinator dashboard counts
router.get('/stats', requireRole('coordinator'), ah(async (req, res) => {
  const [rows] = await pool.query('SELECT current_status, COUNT(*) AS n FROM complaint GROUP BY current_status');
  const stats = { total: 0, Pending: 0, Ongoing: 0, Completed: 0, Outstanding: 0 };
  for (const r of rows) { stats[r.current_status] = r.n; stats.total += r.n; }
  res.json({ stats });
}));

// List complaints (requesters see only their own)
router.get('/complaints', requireAuth, ah(async (req, res) => {
  const u = req.session.user;
  const { status, category, q } = req.query;
  let sql = `
    SELECT c.complaint_id, c.reference_code, c.date_submitted, c.description,
           c.location, c.priority, c.current_status,
           pc.category_name,
           sub.full_name AS submitter_name, sub.user_type AS submitter_type,
           asg.full_name AS assignee_name
      FROM complaint c
      JOIN problem_category pc ON pc.category_id = c.category_id
      JOIN app_user sub ON sub.user_id = c.submitted_by
      LEFT JOIN app_user asg ON asg.user_id = c.assigned_to
     WHERE 1 = 1`;
  const params = [];
  if (u.role === 'requester') { sql += ' AND c.submitted_by = ?'; params.push(u.user_id); }
  if (status) { sql += ' AND c.current_status = ?'; params.push(status); }
  if (category) { sql += ' AND pc.category_name = ?'; params.push(category); }
  if (q) {
    sql += ' AND (c.reference_code LIKE ? OR c.description LIKE ? OR c.location LIKE ? OR sub.full_name LIKE ?)';
    const like = '%' + q + '%'; params.push(like, like, like, like);
  }
  sql += ' ORDER BY c.complaint_id DESC';
  const [rows] = await pool.query(sql, params);
  res.json({ complaints: rows });
}));

// Create a complaint (requester)
router.post('/complaints', requireRole('requester'), ah(async (req, res) => {
  const u = req.session.user;
  const { category_id, location, priority, description } = req.body || {};
  if (!category_id || !description) return res.status(400).json({ error: 'Category and description are required.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const year = new Date().getFullYear();
    const [[{ n }]] = await conn.query(
      'SELECT COUNT(*) AS n FROM complaint WHERE reference_code LIKE ? FOR UPDATE', ['FM-' + year + '-%']);
    const ref = 'FM-' + year + '-' + String(n + 1).padStart(4, '0');
    const [r] = await conn.query(
      `INSERT INTO complaint
         (reference_code, date_submitted, description, category_id, submitted_by, location, priority, current_status)
       VALUES (?, CURDATE(), ?, ?, ?, ?, ?, 'Pending')`,
      [ref, description, category_id, u.user_id, location || null, priority || 'medium']);
    const [[pend]] = await conn.query("SELECT status_id FROM status WHERE status_name = 'Pending'");
    await conn.query(
      'INSERT INTO complaint_status_history (complaint_id, status_id, changed_by, reason) VALUES (?,?,?,?)',
      [r.insertId, pend.status_id, u.user_id, 'Logged by ' + u.type]);
    await conn.commit();
    res.status(201).json({ complaint_id: r.insertId, reference_code: ref });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// Assign a technician (coordinator). Moves Pending -> Ongoing automatically.
router.post('/complaints/:id/assign', requireRole('coordinator'), ah(async (req, res) => {
  const u = req.session.user;
  const id = parseInt(req.params.id, 10);
  const { technician_id } = req.body || {};
  const [[tech]] = await pool.query(
    `SELECT u.full_name, t.trade_name FROM app_user u JOIN trade t ON t.trade_id = u.trade_id
      WHERE u.user_id = ? AND u.role = 'technician'`, [technician_id]);
  if (!tech) return res.status(400).json({ error: 'Unknown technician.' });
  const [[c]] = await pool.query('SELECT current_status FROM complaint WHERE complaint_id = ?', [id]);
  if (!c) return res.status(404).json({ error: 'Complaint not found.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let newStatus = c.current_status;
    let reason = 'Assigned to ' + tech.full_name + ' (' + tech.trade_name + ')';
    if (c.current_status === 'Pending') newStatus = 'Ongoing';
    else reason = 'Reassigned to ' + tech.full_name + ' (' + tech.trade_name + ')';
    await conn.query('UPDATE complaint SET assigned_to = ?, current_status = ? WHERE complaint_id = ?',
      [technician_id, newStatus, id]);
    const [[st]] = await conn.query('SELECT status_id FROM status WHERE status_name = ?', [newStatus]);
    await conn.query(
      'INSERT INTO complaint_status_history (complaint_id, status_id, changed_by, reason) VALUES (?,?,?,?)',
      [id, st.status_id, u.user_id, reason]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// Update status with a reason (coordinator)
router.post('/complaints/:id/status', requireRole('coordinator'), ah(async (req, res) => {
  const u = req.session.user;
  const id = parseInt(req.params.id, 10);
  const { status, reason } = req.body || {};
  const [[st]] = await pool.query('SELECT status_id FROM status WHERE status_name = ?', [status]);
  if (!st) return res.status(400).json({ error: 'Unknown status.' });
  const [[c]] = await pool.query('SELECT complaint_id FROM complaint WHERE complaint_id = ?', [id]);
  if (!c) return res.status(404).json({ error: 'Complaint not found.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE complaint SET current_status = ? WHERE complaint_id = ?', [status, id]);
    await conn.query(
      'INSERT INTO complaint_status_history (complaint_id, status_id, changed_by, reason) VALUES (?,?,?,?)',
      [id, st.status_id, u.user_id, reason || 'Status updated']);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// Status history for one complaint
router.get('/complaints/:id/history', requireAuth, ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [rows] = await pool.query(
    `SELECT s.status_name, h.changed_at, h.reason, u.full_name AS changed_by
       FROM complaint_status_history h
       JOIN status s ON s.status_id = h.status_id
       JOIN app_user u ON u.user_id = h.changed_by
      WHERE h.complaint_id = ? ORDER BY h.history_id`, [id]);
  res.json({ history: rows });
}));

module.exports = router;
