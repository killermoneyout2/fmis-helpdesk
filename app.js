'use strict';

// ---------- tiny helpers ----------
const el = (id) => document.getElementById(id);
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(html){ const t = el('toast'); t.innerHTML = html; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600); }
async function api(path, opts){
  const r = await fetch('/api' + path, Object.assign({
    headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
  }, opts || {}));
  let data = null; try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((data && data.error) || ('Request failed (' + r.status + ')'));
  return data;
}
function fmtDate(v){ if (!v) return ''; return String(v).slice(0, 10); }

// ---------- app state ----------
const S = { user: null, meta: null, complaints: [], stats: null,
  filters: { status: '', category: '', q: '' }, historyOpen: {}, historyCache: {} };

// ====================================================================
//  AUTH (sign in / create account)
// ====================================================================
let authMode = 'login';   // 'login' | 'register'
let regType = 'student';  // for the register form

function authShell(inner){
  return `
  <div class="wrap">
    <div class="login">
      <div class="brand" style="margin-bottom:18px">
        <div class="crest">LU</div>
        <div><h1 style="color:var(--ink)">Facilities Help Desk</h1>
        <span style="color:var(--ink-soft)">Lancaster University Ghana</span></div>
      </div>
      ${inner}
    </div>
  </div>`;
}
function authView(){
  if (authMode === 'register') {
    return authShell(`
      <h2>Create an account</h2>
      <p class="sub">For students and staff to log and track requests.</p>
      <div class="seg" id="seg">
        <button data-t="student" class="${regType==='student'?'on':''}">Student</button>
        <button data-t="staff" class="${regType==='staff'?'on':''}">Staff</button>
      </div>
      <label class="fl">Full name</label>
      <input class="field" id="rg-name" placeholder="e.g. Ama Danso" />
      <label class="fl">University email</label>
      <input class="field" id="rg-email" placeholder="you@lancaster.edu.gh" />
      <label class="fl">Password</label>
      <input class="field" id="rg-pass" type="password" placeholder="at least 6 characters" />
      <button class="primary" id="rg-go">Create account</button>
      <div class="err" id="auth-err"></div>
      <p class="hint">Already have an account? <button class="switch" id="to-login">Sign in</button></p>`);
  }
  return authShell(`
    <h2>Sign in</h2>
    <p class="sub">Access the help desk with your account.</p>
    <label class="fl">Email</label>
    <input class="field" id="li-email" placeholder="you@lancaster.edu.gh" />
    <label class="fl">Password</label>
    <input class="field" id="li-pass" type="password" placeholder="Your password" />
    <button class="primary" id="li-go">Sign in</button>
    <div class="err" id="auth-err"></div>
    <p class="hint">New here? <button class="switch" id="to-register">Create an account</button></p>
    <p class="hint" style="margin-top:6px">Demo coordinator: ellen@lancaster.edu.gh / coordinator123</p>`);
}
function wireAuth(){
  if (authMode === 'register') {
    el('seg').querySelectorAll('button').forEach(b => b.onclick = () => { regType = b.dataset.t; render(); });
    el('rg-go').onclick = doRegister;
    el('rg-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });
    el('to-login').onclick = () => { authMode = 'login'; render(); };
  } else {
    el('li-go').onclick = doLogin;
    el('li-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    el('to-register').onclick = () => { authMode = 'register'; render(); };
  }
}
async function doLogin(){
  const email = el('li-email').value.trim();
  const password = el('li-pass').value;
  el('auth-err').textContent = '';
  el('li-go').disabled = true;
  try {
    const { user } = await api('/auth/login', { method: 'POST',
      body: JSON.stringify({ email, password }) });
    S.user = user;
    await loadForUser();
  } catch (e) {
    el('auth-err').textContent = e.message;
    el('li-go').disabled = false;
  }
}
async function doRegister(){
  const name = el('rg-name').value.trim();
  const email = el('rg-email').value.trim();
  const password = el('rg-pass').value;
  el('auth-err').textContent = '';
  el('rg-go').disabled = true;
  try {
    const { user } = await api('/auth/register', { method: 'POST',
      body: JSON.stringify({ name, email, password, user_type: regType }) });
    S.user = user;
    await loadForUser();
  } catch (e) {
    el('auth-err').textContent = e.message;
    el('rg-go').disabled = false;
  }
}

// ====================================================================
//  SHARED
// ====================================================================
function topbar(){
  const u = S.user;
  return `<div class="topbar">
    <div class="brand"><div class="crest">LU</div>
      <div><h1>Facilities Help Desk</h1><span>Lancaster University Ghana</span></div></div>
    <div class="whoami"><div class="u"><b>${esc(u.name)}</b><br><small>${esc(u.role)}</small></div>
      <button class="ghost" id="signout">Sign out</button></div>
  </div>`;
}
async function loadForUser(){
  S.meta = await api('/meta');
  if (S.user.role === 'coordinator') {
    const [{ stats }, { complaints }] = await Promise.all([ api('/stats'), listComplaints() ]);
    S.stats = stats; S.complaints = complaints;
  } else {
    const { complaints } = await listComplaints();
    S.complaints = complaints;
  }
  render();
}
function listComplaints(){
  const f = S.filters;
  const qs = new URLSearchParams();
  if (f.status) qs.set('status', f.status);
  if (f.category) qs.set('category', f.category);
  if (f.q) qs.set('q', f.q);
  const s = qs.toString();
  return api('/complaints' + (s ? '?' + s : ''));
}

// ====================================================================
//  RENDER ROOT
// ====================================================================
function render(){
  const root = el('app');
  if (!S.user) { root.innerHTML = authView(); wireAuth(); return; }
  root.innerHTML = topbar() + '<div class="wrap">' +
    (S.user.role === 'coordinator' ? coordinatorView() : requesterView()) + '</div>';
  el('signout').onclick = async () => { await api('/auth/logout', { method: 'POST' });
    S.user = null; S.complaints = []; S.stats = null; render(); };
  if (S.user.role === 'coordinator') wireCoordinator(); else wireRequester();
  wireHistoryToggles();
}

// ====================================================================
//  REQUESTER
// ====================================================================
function requesterView(){
  const cats = S.meta.categories.map(c => `<option value="${c.category_id}">${esc(c.category_name)}</option>`).join('');
  return `<div class="cols">
    <div class="card">
      <div class="hd"><h3>Log a request</h3><p>Describe the problem and we'll route it to the right technician.</p></div>
      <div class="bd">
        <div class="form-row"><label>Category</label>
          <select class="field" id="f-cat">${cats}</select></div>
        <div class="form-row"><label>Location</label>
          <input class="field" id="f-loc" placeholder="Building / room, e.g. Hostel Block B, Room 204" /></div>
        <div class="form-row"><label>Priority</label>
          <select class="field" id="f-prio"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div>
        <div class="form-row"><label>Description</label>
          <textarea class="field" id="f-desc" rows="4" placeholder="What is the problem?"></textarea></div>
        <button class="submit" id="f-submit">Submit request</button>
      </div>
    </div>
    <div>
      <h2 class="section-title">My requests (${S.complaints.length})</h2>
      ${S.complaints.length ? S.complaints.map(c => ticketCard(c, false)).join('')
        : `<div class="empty">You haven't logged any requests yet.<br>Use the form to submit your first one.</div>`}
    </div>
  </div>`;
}
function wireRequester(){
  el('f-submit').onclick = async () => {
    const category_id = el('f-cat').value;
    const location = el('f-loc').value.trim();
    const priority = el('f-prio').value;
    const description = el('f-desc').value.trim();
    if (!location || !description) { toast('Add a location and description'); return; }
    try {
      const { reference_code } = await api('/complaints', { method: 'POST',
        body: JSON.stringify({ category_id, location, priority, description }) });
      const { complaints } = await listComplaints();
      S.complaints = complaints; render();
      toast('Request logged — <b>' + esc(reference_code) + '</b>');
    } catch (e) { toast(esc(e.message)); }
  };
}

// ====================================================================
//  COORDINATOR
// ====================================================================
function coordinatorView(){
  const st = S.stats || { total: 0, Pending: 0, Ongoing: 0, Completed: 0, Outstanding: 0 };
  const cats = S.meta.categories.map(c => `<option ${S.filters.category===c.category_name?'selected':''}>${esc(c.category_name)}</option>`).join('');
  const sts = S.meta.statuses.map(s => `<option ${S.filters.status===s.status_name?'selected':''}>${esc(s.status_name)}</option>`).join('');
  return `
    <div class="stats">
      <div class="stat total"><div class="n">${st.total}</div><div class="l">Total</div></div>
      <div class="stat pend"><div class="n">${st.Pending||0}</div><div class="l">Pending</div></div>
      <div class="stat ongo"><div class="n">${st.Ongoing||0}</div><div class="l">Ongoing</div></div>
      <div class="stat done"><div class="n">${st.Completed||0}</div><div class="l">Completed</div></div>
      <div class="stat outs"><div class="n">${st.Outstanding||0}</div><div class="l">Outstanding</div></div>
    </div>
    <div class="filters">
      <select id="fl-status"><option value="">All statuses</option>${sts}</select>
      <select id="fl-cat"><option value="">All categories</option>${cats}</select>
      <input class="grow" id="fl-q" placeholder="Search reference, description, requester…" value="${esc(S.filters.q)}" />
      <span class="count">${S.complaints.length} shown</span>
    </div>
    ${S.complaints.length ? S.complaints.map(c => ticketCard(c, true)).join('')
      : `<div class="empty">No requests match these filters.</div>`}
  `;
}
async function refreshCoordinator(){
  const [{ stats }, { complaints }] = await Promise.all([ api('/stats'), listComplaints() ]);
  S.stats = stats; S.complaints = complaints; render();
}
function wireCoordinator(){
  el('fl-status').onchange = (e) => { S.filters.status = e.target.value; refreshCoordinator(); };
  el('fl-cat').onchange = (e) => { S.filters.category = e.target.value; refreshCoordinator(); };
  let timer;
  el('fl-q').oninput = (e) => { S.filters.q = e.target.value; clearTimeout(timer);
    timer = setTimeout(async () => {
      const { complaints } = await listComplaints(); S.complaints = complaints; render();
      const q = el('fl-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    }, 220); };

  S.complaints.forEach((c) => {
    const as = el('as-' + c.complaint_id);
    if (as) as.onchange = async () => {
      if (!as.value) return;
      try { await api('/complaints/' + c.complaint_id + '/assign', { method: 'POST',
        body: JSON.stringify({ technician_id: as.value }) });
        delete S.historyCache[c.complaint_id];
        await refreshCoordinator(); toast('Technician assigned');
      } catch (e) { toast(esc(e.message)); }
    };
    const sv = el('sv-' + c.complaint_id);
    if (sv) sv.onclick = async () => {
      const status = el('st-' + c.complaint_id).value;
      const reason = el('rs-' + c.complaint_id).value.trim();
      try { await api('/complaints/' + c.complaint_id + '/status', { method: 'POST',
        body: JSON.stringify({ status, reason }) });
        delete S.historyCache[c.complaint_id];
        await refreshCoordinator(); toast('Updated to ' + esc(status));
      } catch (e) { toast(esc(e.message)); }
    };
  });
}

// ====================================================================
//  TICKET CARD
// ====================================================================
function ticketCard(c, coord){
  const id = c.complaint_id;
  const open = S.historyOpen[id];
  const techOpts = S.meta.technicians.map(t =>
    `<option value="${t.user_id}" ${c.assignee_name===t.full_name?'selected':''}>${esc(t.full_name)} (${esc(t.trade_name)})</option>`).join('');
  const stOpts = S.meta.statuses.map(s =>
    `<option ${c.current_status===s.status_name?'selected':''}>${esc(s.status_name)}</option>`).join('');
  const hist = S.historyCache[id];
  return `<div class="ticket">
    <div class="spine ${esc(c.current_status)}"></div>
    <div class="t-body">
      <div class="t-top">
        <span class="tid">${esc(c.reference_code)}</span>
        <span class="pill ${esc(c.current_status)}">${esc(c.current_status)}</span>
        <span class="cat">${esc(c.category_name)}</span>
        <span class="prio ${esc(c.priority)}">${esc(c.priority)} priority</span>
      </div>
      <div class="t-desc">${esc(c.description)}</div>
      <div class="t-meta">
        <span>Requester: <b>${esc(c.submitter_name)}</b> (${esc(c.submitter_type)})</span>
        <span>Location: <b>${esc(c.location || '—')}</b></span>
        <span>Logged: <b>${fmtDate(c.date_submitted)}</b></span>
        <span>Assigned: <b>${esc(c.assignee_name || '—')}</b></span>
      </div>
      ${coord ? `
      <div class="t-controls">
        <select id="as-${id}"><option value="">Assign technician…</option>${techOpts}</select>
        <select id="st-${id}">${stOpts}</select>
        <input class="reason" id="rs-${id}" placeholder="Reason / note (optional)" />
        <button class="mini" id="sv-${id}">Update</button>
      </div>` : ''}
      <div style="margin-top:10px">
        <button class="linklike toggle-h" data-id="${id}">${open ? 'Hide' : 'View'} history</button>
      </div>
      <div class="history ${open ? 'open' : ''}" id="hist-${id}">
        ${open ? (hist ? renderHistory(hist) : '<div class="hitem">Loading…</div>') : ''}
      </div>
    </div>
  </div>`;
}
const STATUS_COLOR = { Pending:'--pend-fg', Ongoing:'--ongo-fg', Completed:'--done-fg', Outstanding:'--outs-fg' };
function renderHistory(list){
  if (!list.length) return '<div class="hitem">No history.</div>';
  return list.map(x => `<div class="hitem">
    <span class="dot" style="background:var(${STATUS_COLOR[x.status_name]||'--ink-soft'})"></span>
    <span><b>${esc(x.status_name)}</b> · ${fmtDate(x.changed_at)} · by ${esc(x.changed_by)}<br>
    <span class="hr">${esc(x.reason || '')}</span></span></div>`).join('');
}
function wireHistoryToggles(){
  document.querySelectorAll('.toggle-h').forEach(b => b.onclick = async () => {
    const id = b.dataset.id;
    S.historyOpen[id] = !S.historyOpen[id];
    if (S.historyOpen[id] && !S.historyCache[id]) {
      try { const { history } = await api('/complaints/' + id + '/history');
        S.historyCache[id] = history; } catch (e) { toast(esc(e.message)); }
    }
    render();
  });
}

// ====================================================================
//  BOOT
// ====================================================================
(async function boot(){
  try {
    const { user } = await api('/auth/me');
    if (user) { S.user = user; await loadForUser(); return; }
  } catch (e) {}
  render();
})();
