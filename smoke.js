// End-to-end smoke test with password authentication.
// Assumes the server is running on BASE (it self-initialises the DB).
const BASE = process.env.BASE || 'http://127.0.0.1:3000';

function client(){
  let cookie = null;
  return async (path, opts = {}) => {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(BASE + path, Object.assign({}, opts, { headers }));
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let body = null; try { body = await r.json(); } catch (e) {}
    return { status: r.status, body };
  };
}
let pass = 0, fail = 0;
function check(name, cond, extra){
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

(async () => {
  console.log('Authentication');
  const anon = client();
  let r = await anon('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'ellen@lancaster.edu.gh', password: 'wrongpass' }) });
  check('wrong password is rejected (401)', r.status === 401, r.status);

  console.log('Coordinator flow');
  const co = client();
  r = await co('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'ellen@lancaster.edu.gh', password: 'coordinator123' }) });
  check('coordinator signs in with password', r.status === 200 && r.body.user.role === 'coordinator', r.body);

  r = await co('/api/stats');
  check('dashboard shows 5 seeded complaints', r.body.stats.total === 5, r.body.stats);

  const meta = await co('/api/meta');
  const tech = meta.body.technicians.find(t => t.trade_name === 'Electrician');
  check('meta returns technicians', !!tech);

  const list = await co('/api/complaints');
  const c3 = list.body.complaints.find(c => c.reference_code === 'FM-2026-0003');
  check('FM-2026-0003 starts Pending', c3 && c3.current_status === 'Pending', c3 && c3.current_status);

  r = await co('/api/complaints/' + c3.complaint_id + '/assign', { method: 'POST', body: JSON.stringify({ technician_id: tech.user_id }) });
  check('assign technician succeeds', r.status === 200, r.body);
  const after = await co('/api/complaints');
  const c3b = after.body.complaints.find(c => c.reference_code === 'FM-2026-0003');
  check('assign moves Pending -> Ongoing + records assignee', c3b.current_status === 'Ongoing' && !!c3b.assignee_name, c3b);

  r = await co('/api/complaints/' + c3.complaint_id + '/status', { method: 'POST', body: JSON.stringify({ status: 'Completed', reason: 'Replaced faulty ballast' }) });
  check('status update succeeds', r.status === 200, r.body);
  r = await co('/api/complaints/' + c3.complaint_id + '/history');
  check('history preserves the reason text', r.body.history.some(h => h.reason === 'Replaced faulty ballast'));

  console.log('Registration + requester flow');
  const rq = client();
  const email = 'test.student+' + Date.now() + '@student.lancaster.edu.gh';
  r = await rq('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Test Student', email, password: 'secret123', user_type: 'student' }) });
  check('new student can register', r.status === 201 && r.body.user.role === 'requester', r.body);

  r = await rq('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Dup', email, password: 'secret123', user_type: 'student' }) });
  check('duplicate email is rejected (409)', r.status === 409, r.status);

  r = await rq('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Shorty', email: 'x' + Date.now() + '@e.com', password: '123', user_type: 'student' }) });
  check('short password is rejected (400)', r.status === 400, r.status);

  const cat = meta.body.categories.find(c => c.category_name === 'Plumbing');
  r = await rq('/api/complaints', { method: 'POST', body: JSON.stringify({ category_id: cat.category_id, location: 'Test Hall, Room 1', priority: 'high', description: 'Test complaint' }) });
  check('requester creates complaint (FM-2026-0006)', r.status === 201 && r.body.reference_code === 'FM-2026-0006', r.body);

  r = await rq('/api/complaints');
  check('requester sees only their own complaint', r.body.complaints.length === 1, r.body.complaints && r.body.complaints.length);

  r = await rq('/api/complaints/1/status', { method: 'POST', body: JSON.stringify({ status: 'Completed' }) });
  check('requester blocked from coordinator action (403)', r.status === 403, r.status);

  // sign back in as the registered student to confirm the password works
  const rq2 = client();
  r = await rq2('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'secret123' }) });
  check('registered student can sign back in', r.status === 200, r.body);

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
