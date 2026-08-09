// Database initialisation: (re)creates the schema, then seeds demo
// users and complaints. Exported as initDb() and used by both the
// `npm run setup-db` CLI and automatic startup initialisation.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('./config');
const { hashPassword } = require('./password');

async function initDb() {
  const conn = await mysql.createConnection({
    host: db.host, port: db.port, user: db.user,
    password: db.password, database: db.database, multipleStatements: true,
  });

  console.log('Applying schema…');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema); // creates tables + seeds trade/category/status

  // ---- lookup helpers -------------------------------------------------
  const idOf = async (table, col, val) => {
    const [[row]] = await conn.query(
      `SELECT ${table}_id AS id FROM ${table} WHERE ${col} = ?`, [val]);
    return row.id;
  };
  const tradeId = (name) => idOf('trade', 'trade_name', name);
  const statusId = (name) => idOf('status', 'status_name', name);

  // ---- users ----------------------------------------------------------
  console.log('Seeding users…');
  const addUser = async (name, email, type, role, trade, password) => {
    const trade_id = trade ? await tradeId(trade) : null;
    const pw = password ? hashPassword(password) : null;
    const [r] = await conn.query(
      'INSERT INTO app_user (full_name, email, user_type, role, trade_id, password_hash) VALUES (?,?,?,?,?,?)',
      [name, email.toLowerCase(), type, role, trade_id, pw]);
    return r.insertId;
  };

  // Coordinator password can be overridden at deploy time.
  const coordPw = process.env.COORDINATOR_PASSWORD || 'coordinator123';
  const ellen = await addUser('Ellen', 'ellen@lancaster.edu.gh', 'staff', 'coordinator', null, coordPw);

  // Technicians don't sign in through the UI (no password set).
  const techs = {
    plumber:  await addUser('Kwame Boateng', 'kwame.boateng@lancaster.edu.gh', 'staff', 'technician', 'Plumber'),
    elec:     await addUser('Yaw Mensah',    'yaw.mensah@lancaster.edu.gh',    'staff', 'technician', 'Electrician'),
    carp:     await addUser('Abena Osei',    'abena.osei@lancaster.edu.gh',    'staff', 'technician', 'Carpenter'),
    paint:    await addUser('Kofi Darko',    'kofi.darko@lancaster.edu.gh',    'staff', 'technician', 'Painter'),
    mason:    await addUser('Musah Alhassan','musah.alhassan@lancaster.edu.gh','staff', 'technician', 'Mason'),
    hvac:     await addUser('Adjoa Nyarko',  'adjoa.nyarko@lancaster.edu.gh',  'staff', 'technician', 'HVAC Technician'),
    house:    await addUser('Efua Sam',      'efua.sam@lancaster.edu.gh',      'staff', 'technician', 'Housekeeper'),
  };
  // Two demo requester accounts (so seeded complaints have owners who can log in).
  const ama  = await addUser('Ama Danso',   'ama.danso@student.lancaster.edu.gh', 'student', 'requester', null, 'student123');
  const kojo = await addUser('Kojo Asante', 'k.asante@lancaster.edu.gh',          'staff',   'requester', null, 'staff123');

  // ---- complaints + history ------------------------------------------
  console.log('Seeding complaints…');
  const catId = async (name) => {
    const [[row]] = await conn.query(
      'SELECT category_id AS id FROM problem_category WHERE category_name = ?', [name]);
    return row.id;
  };

  const addComplaint = async (c) => {
    const category_id = await catId(c.category);
    const [r] = await conn.query(
      `INSERT INTO complaint
         (reference_code, date_submitted, description, category_id,
          submitted_by, assigned_to, location, priority, current_status)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [c.ref, c.date, c.desc, category_id, c.by, c.assigned || null,
       c.location, c.priority, c.status]);
    const cid = r.insertId;
    for (const h of c.history) {
      const sid = await statusId(h.status);
      await conn.query(
        `INSERT INTO complaint_status_history
           (complaint_id, status_id, changed_by, changed_at, reason)
         VALUES (?,?,?,?,?)`,
        [cid, sid, h.by, h.at + ' 09:00:00', h.reason]);
    }
  };

  await addComplaint({ ref: 'FM-2026-0001', date: '2026-08-02', category: 'Air-conditioning',
    desc: 'AC in Room B204 not cooling at all — running but blowing warm air.',
    by: ama, assigned: techs.hvac, location: 'Hostel Block B, Room 204', priority: 'high', status: 'Ongoing',
    history: [
      { status: 'Pending', by: ama,   at: '2026-08-02', reason: 'Logged by student' },
      { status: 'Ongoing', by: ellen, at: '2026-08-03', reason: 'Assigned to Adjoa Nyarko (HVAC Technician)' } ] });

  await addComplaint({ ref: 'FM-2026-0002', date: '2026-08-03', category: 'Plumbing',
    desc: 'Leaking tap in the staff kitchen, water pooling on the floor.',
    by: kojo, assigned: techs.plumber, location: 'Admin Block, Staff Kitchen', priority: 'medium', status: 'Completed',
    history: [
      { status: 'Pending',   by: kojo,             at: '2026-08-03', reason: 'Logged by staff' },
      { status: 'Ongoing',   by: ellen,            at: '2026-08-03', reason: 'Assigned to Kwame Boateng (Plumber)' },
      { status: 'Completed', by: techs.plumber,    at: '2026-08-04', reason: 'Washer replaced, leak stopped' } ] });

  await addComplaint({ ref: 'FM-2026-0003', date: '2026-08-05', category: 'Electrical',
    desc: 'Lights in Lecture Hall 1 flicker intermittently during classes.',
    by: kojo, assigned: null, location: 'Academic Block, Lecture Hall 1', priority: 'medium', status: 'Pending',
    history: [ { status: 'Pending', by: kojo, at: '2026-08-05', reason: 'Logged by staff' } ] });

  await addComplaint({ ref: 'FM-2026-0004', date: '2026-07-28', category: 'Carpentry',
    desc: 'Broken hinge on room door — door will not close properly.',
    by: ama, assigned: techs.carp, location: 'Hostel Block A, Room 110', priority: 'low', status: 'Outstanding',
    history: [
      { status: 'Pending',     by: ama,        at: '2026-07-28', reason: 'Logged by student' },
      { status: 'Ongoing',     by: ellen,      at: '2026-07-29', reason: 'Assigned to Abena Osei (Carpenter)' },
      { status: 'Outstanding', by: techs.carp, at: '2026-07-30', reason: 'Awaiting replacement hinge from stores' } ] });

  await addComplaint({ ref: 'FM-2026-0005', date: '2026-08-06', category: 'Housekeeping',
    desc: 'Requesting a deep clean of the Block C common room before the event.',
    by: ama, assigned: null, location: 'Hostel Block C, Common Room', priority: 'low', status: 'Pending',
    history: [ { status: 'Pending', by: ama, at: '2026-08-06', reason: 'Logged by student' } ] });

  await conn.end();
  console.log('Done. Demo logins:');
  console.log('  Coordinator: ellen@lancaster.edu.gh / ' + coordPw);
  console.log('  Student:     ama.danso@student.lancaster.edu.gh / student123');
  console.log('  Staff:       k.asante@lancaster.edu.gh / staff123');
}

module.exports = { initDb };
