require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { query, init, engine, DATA_DIR } = require('./db');
const mailer = require('./mailer');
const gdrive = require('./drive');

const app = express();
const PORT = +(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const p = path.join(DATA_DIR, '.jwt_secret');
  if (!fs.existsSync(p)) fs.writeFileSync(p, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(p, 'utf8');
})();

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/[^\w.\-]/g, '_')) }), limits: { fileSize: 15 * 1024 * 1024 } });

app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const uid = (p) => p + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const J = (v, fb) => { try { return JSON.parse(v); } catch { return fb; } };

function rowToEmp(r) { return Object.assign(J(r.data, {}), { id: r.id, empId: r.empid ?? r.empId, passportNo: r.passportno ?? r.passportNo, name: r.name, email: r.email, status: r.status }); }
function rowToLeave(r) { return Object.assign(J(r.data, {}), { id: r.id, employeeId: r.employeeid ?? r.employeeId, status: r.status }); }
function rowToPs(r) { return Object.assign(J(r.data, {}), { id: r.id, employeeId: r.employeeid ?? r.employeeId, month: r.month }); }
function rowToNotif(r) { return Object.assign(J(r.data, {}), { id: r.id, employeeId: r.employeeid ?? r.employeeId, isRead: +(r.isread ?? r.isRead) }); }
function rowToAdmin(r) { return { id: r.id, email: r.email, name: r.name, isSuperAdmin: +(r.issuperadmin ?? r.isSuperAdmin), permissions: J(r.permissions, []), createdAt: r.createdat ?? r.createdAt }; }

async function audit(user, action) { try { await query('INSERT INTO audit (t, usr, action) VALUES (?, ?, ?)', [new Date().toLocaleString(), user || 'System', action]); } catch (e) {} }
async function notify(employeeId, type, title, message) { await query('INSERT INTO notifications (id, employeeId, isRead, data) VALUES (?, ?, 0, ?)', [uid('N'), employeeId, JSON.stringify({ type, title, message, createdAt: today() })]); }
function token(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' }); }

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'Not signed in' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired' }); }
}

function isSuperAdmin(req) { return req.user && req.user.role === 'admin' && (req.user.isSuperAdmin === 1 || req.user.isSuperAdmin === true); }
function hasPermission(req, perm) { return isSuperAdmin(req) || (req.user && req.user.role === 'admin' && (req.user.permissions || []).includes(perm)); }

async function issueOtp(target) {
  const code = String(crypto.randomInt(100000, 999999));
  await query('DELETE FROM otps WHERE target = ?', [target]);
  await query('INSERT INTO otps (target, code, expires) VALUES (?, ?, ?)', [target, code, Date.now() + 10 * 60 * 1000]);
  return code;
}

async function checkOtp(target, code) {
  const r = await query('SELECT * FROM otps WHERE target = ?', [target]);
  if (!r.rows.length || r.rows[0].expires < Date.now() || r.rows[0].code !== String(code)) return false;
  await query('DELETE FROM otps WHERE target = ?', [target]);
  return true;
}

app.post('/api/auth/admin/request-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const r = await query('SELECT * FROM admins WHERE LOWER(email) = ?', [email]);
  if (!r.rows.length) return res.status(404).json({ error: 'Admin not found' });
  const code = await issueOtp('admin:' + email);
  const sent = await mailer.sendOtp(email, code);
  res.json({ message: 'OTP sent', ...(sent.dev ? { _devOtp: code } : {}) });
});

app.post('/api/auth/admin/verify-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!await checkOtp('admin:' + email, req.body.otp)) return res.status(401).json({ error: 'Incorrect code' });
  const r = await query('SELECT * FROM admins WHERE LOWER(email) = ?', [email]);
  if (!r.rows.length) return res.status(404).json({ error: 'Admin not found' });
  const a = rowToAdmin(r.rows[0]);
  await audit(a.name, 'Admin login');
  res.json({ token: token({ role: 'admin', adminId: a.id, name: a.name, email: a.email, isSuperAdmin: a.isSuperAdmin, permissions: a.permissions }), role: 'admin', name: a.name, email: a.email, isSuperAdmin: a.isSuperAdmin, permissions: a.permissions });
});

app.post('/api/auth/employee/login', async (req, res) => {
  const empId = String(req.body.empId || '').trim().toUpperCase();
  const pass = String(req.body.passportNo || '').trim();
  const r = await query('SELECT * FROM employees WHERE UPPER(empId) = ?', [empId]);
  if (!r.rows.length || (r.rows[0].passportno ?? r.rows[0].passportNo) !== pass) return res.status(401).json({ error: 'Invalid credentials' });
  if (r.rows[0].status === 'Inactive') return res.status(403).json({ error: 'Account inactive' });
  const e = rowToEmp(r.rows[0]);
  if (!e.email) return res.status(400).json({ error: 'No email' });
  const code = await issueOtp('emp:' + e.empId);
  const sent = await mailer.sendOtp(e.email, code);
  const masked = e.email.replace(/^(..).*(@.*)$/, '$1•••$2');
  res.json({ otpRequired: true, message: 'OTP sent', email: masked, ...(sent.dev ? { _devOtp: code } : {}) });
});

app.post('/api/auth/employee/verify-otp', async (req, res) => {
  const empId = String(req.body.empId || '').trim().toUpperCase();
  if (!await checkOtp('emp:' + empId, req.body.otp)) return res.status(401).json({ error: 'Incorrect code' });
  const r = await query('SELECT * FROM employees WHERE UPPER(empId) = ?', [empId]);
  if (!r.rows.length) return res.status(404).json({ error: 'Employee not found' });
  const e = rowToEmp(r.rows[0]);
  await audit(e.name, 'Employee login');
  res.json({ token: token({ role: 'employee', employeeId: e.id, empId: e.empId, name: e.firstName || e.name }), role: 'employee', empId: e.empId, name: e.firstName || e.name });
});

app.get('/api/employees', auth, async (req, res) => {
  if (req.user.role === 'employee') { const r = await query('SELECT * FROM employees WHERE id = ?', [req.user.employeeId]); return res.json(r.rows.map(rowToEmp)); }
  const r = await query('SELECT * FROM employees ORDER BY empId', []);
  res.json(r.rows.map(rowToEmp));
});

app.get('/api/employees/:id', auth, async (req, res) => {
  const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rowToEmp(r.rows[0]));
});

app.post('/api/employees', auth, async (req, res) => {
  if (!hasPermission(req, 'manage_employees')) return res.status(403).json({ error: 'No permission' });
  const id = uid('E');
  const emp = req.body;
  await query('INSERT INTO employees (id, empId, passportNo, name, email, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, emp.empId, emp.passportNo, emp.name, emp.email, emp.status || 'Active', JSON.stringify(emp)]);
  res.json({ id });
});

app.patch('/api/employees/:id', auth, async (req, res) => {
  if (!hasPermission(req, 'manage_employees')) return res.status(403).json({ error: 'No permission' });
  const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  const e = rowToEmp(r.rows[0]);
  Object.assign(e, req.body);
  await query('UPDATE employees SET data = ? WHERE id = ?', [JSON.stringify(e), e.id]);
  res.json({ message: 'Updated' });
});

app.put('/api/employees/:id', auth, async (req, res) => {
  if (!hasPermission(req, 'manage_employees')) return res.status(403).json({ error: 'No permission' });
  const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  const e = rowToEmp(r.rows[0]);
  Object.assign(e, req.body);
  await query('UPDATE employees SET data = ? WHERE id = ?', [JSON.stringify(e), e.id]);
  res.json({ message: 'Updated' });
});

app.patch('/api/employees/:id/status', auth, async (req, res) => {
  if (!hasPermission(req, 'manage_employees')) return res.status(403).json({ error: 'No permission' });
  const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  const e = rowToEmp(r.rows[0]);
  e.status = req.body.status;
  await query('UPDATE employees SET status = ?, data = ? WHERE id = ?', [req.body.status, JSON.stringify(e), e.id]);
  res.json({ message: 'Updated' });
});

app.delete('/api/employees/:id', auth, async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' });
  const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  const e = rowToEmp(r.rows[0]);
  await query('DELETE FROM employees WHERE id = ?', [req.params.id]);
  await query('DELETE FROM leaves WHERE employeeId = ?', [e.id]);
  await query('DELETE FROM payslips WHERE employeeId = ?', [e.id]);
  await query('DELETE FROM documents WHERE employeeId = ?', [e.id]);
  await query('DELETE FROM notifications WHERE employeeId = ?', [e.id]);
  res.json({ message: 'Deleted' });
});

app.post('/api/employees/bulk/import', auth, async (req, res) => {
  if (!hasPermission(req, 'manage_employees')) return res.status(403).json({ error: 'No permission' });
  const rows = req.body.rows || [];
  let added = 0, updated = 0;
  for (const row of rows) {
    const r = await query('SELECT id FROM employees WHERE empId = ?', [row.empId]);
    if (r.rows.length) {
      const e = rowToEmp(await query('SELECT * FROM employees WHERE empId = ?', [row.empId]));
      Object.assign(e, row);
      await query('UPDATE employees SET data = ? WHERE empId = ?', [JSON.stringify(e), row.empId]);
      updated++;
    } else {
      const id = uid('E');
      await query('INSERT INTO employees (id, empId, passportNo, name, email, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, row.empId, row.passportNo, row.name, row.email, row.status || 'Active', JSON.stringify(row)]);
      added++;
    }
  }
  res.json({ message: 'Imported', added, updated });
});

app.get('/api/leaves', auth, async (req, res) => {
  if (req.user.role === 'employee') { const r = await query('SELECT * FROM leaves WHERE employeeId = ?', [req.user.employeeId]); return res.json(r.rows.map(rowToLeave)); }
  const r = await query('SELECT * FROM leaves', []);
  res.json(r.rows.map(rowToLeave));
});

app.post('/api/leaves', auth, async (req, res) => {
  const empId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId;
  const r = await query('SELECT * FROM employees WHERE id = ?', [empId]);
  if (!r.rows.length) return res.status(404).json({ error: 'Employee not found' });
  const e = rowToEmp(r.rows[0]);
  if (e.joiningDate && (Date.now() - new Date(e.joiningDate)) / 864e5 < 182) return res.status(403).json({ error: 'Probation' });
  const id = uid('L');
  const lv = { type: req.body.type, fromDate: req.body.fromDate, toDate: req.body.toDate, days: +req.body.days || 1, reason: req.body.reason || '', empName: e.name, empId: e.empId, appliedOn: today() };
  await query('INSERT INTO leaves (id, employeeId, status, data) VALUES (?, ?, ?, ?)', [id, e.id, 'Pending', JSON.stringify(lv)]);
  await notify(e.id, 'pending', 'Leave submitted', 'Pending approval');
  res.json({ id });
});

app.patch('/api/leaves/:id/decide', auth, async (req, res) => {
  if (!hasPermission(req, 'approve_leaves')) return res.status(403).json({ error: 'No permission' });
  const r = await query('SELECT * FROM leaves WHERE id = ?', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  const lv = rowToLeave(r.rows[0]);
  const newSt = req.body.decision === 'Approved' ? 'Approved' : 'Rejected';
  lv.status = newSt;
  lv.decidedAt = today();
  lv.decidedBy = req.user.name;
  await query('UPDATE leaves SET status = ?, data = ? WHERE id = ?', [newSt, JSON.stringify(lv), lv.id]);
  await notify(lv.employeeId, newSt === 'Approved' ? 'approved' : 'rejected', 'Leave ' + newSt, 'Status: ' + newSt);
  res.json({ message: newSt });
});

app.get('/api/payslips', auth, async (req, res) => {
  if (req.user.role === 'employee') { const r = await query('SELECT * FROM payslips WHERE employeeId = ?', [req.user.employeeId]); return res.json(r.rows.map(rowToPs)); }
  const r = await query('SELECT * FROM payslips', []);
  res.json(r.rows.map(rowToPs));
});

app.post('/api/payslips/bulk', auth, async (req, res) => {
  if (!hasPermission(req, 'manage_payroll')) return res.status(403).json({ error: 'No permission' });
  const rows = req.body.rows || [];
  for (const row of rows) await query('INSERT INTO payslips (id, employeeId, month, data) VALUES (?, ?, ?, ?)', [uid('P'), row.employeeId, req.body.month, JSON.stringify(row)]);
  res.json({ message: 'Generated', count: rows.length });
});

app.get('/api/documents', auth, async (req, res) => {
  if (req.user.role === 'employee') { const r = await query('SELECT * FROM documents WHERE employeeId = ?', [req.user.employeeId]); return res.json(r.rows.map(d => ({ id: d.id, employeeId: d.employeeid ?? d.employeeId, name: d.name, type: d.type, filename: d.filename }))); }
  const r = await query('SELECT * FROM documents', []);
  res.json(r.rows.map(d => ({ id: d.id, employeeId: d.employeeid ?? d.employeeId, name: d.name, type: d.type, filename: d.filename })));
});

app.post('/api/documents', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const empId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId;
  const id = uid('D');
  await query('INSERT INTO documents (id, employeeId, name, type, size, filename, uploadedAt, uploader) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, empId, req.body.name || req.file.originalname, req.file.mimetype, req.file.size, req.file.filename, today(), req.user.name]);
  res.json({ id, filename: req.file.filename });
});

app.get('/api/notifications', auth, async (req, res) => {
  const id = req.user.role === 'employee' ? req.user.employeeId : '__none__';
  const r = await query('SELECT * FROM notifications WHERE employeeId = ?', [id]);
  res.json(r.rows.map(rowToNotif));
});

app.patch('/api/notifications/read-all', auth, async (req, res) => {
  const id = req.user.role === 'employee' ? req.user.employeeId : '__none__';
  await query('UPDATE notifications SET isRead = 1 WHERE employeeId = ?', [id]);
  res.json({ message: 'Marked as read' });
});

app.get('/api/admins', auth, async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' });
  const r = await query('SELECT * FROM admins ORDER BY createdAt', []);
  res.json(r.rows.map(rowToAdmin));
});

app.post('/api/admins', auth, async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' });
  const id = uid('A');
  const code = await issueOtp('admin:' + req.body.email.toLowerCase());
  await mailer.sendOtp(req.body.email, code);
  await query('INSERT INTO admins (id, email, name, isSuperAdmin, permissions, createdAt) VALUES (?, ?, ?, 0, ?, ?)', [id, req.body.email.toLowerCase(), req.body.name, JSON.stringify(req.body.permissions || []), today()]);
  res.json({ id, message: 'OTP sent to ' + req.body.email });
});

app.get('/api/audit', auth, async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' });
  const r = await query('SELECT * FROM audit ORDER BY seq DESC LIMIT 200', []);
  res.json(r.rows.map(x => ({ t: x.t, user: x.usr, action: x.action })));
});

app.get('/api/config', auth, async (req, res) => {
  const cfg = await query('SELECT v FROM config WHERE k = ?', ['cfg']);
  res.json(cfg.rows.length ? J(cfg.rows[0].v, {}) : {});
});

app.put('/api/config', auth, async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' });
  await query('DELETE FROM config WHERE k = ?', ['cfg']);
  await query('INSERT INTO config (k, v) VALUES (?, ?)', ['cfg', JSON.stringify(req.body)]);
  res.json({ message: 'Saved' });
});

app.get('/api/dashboard/metrics', auth, async (req, res) => {
  if (!hasPermission(req, 'view_employees')) return res.status(403).json({ error: 'No permission' });
  const emps = await query('SELECT * FROM employees ORDER BY empId', []);
  const leaves = await query('SELECT * FROM leaves WHERE status = ?', ['Pending']);
  const payslips = await query('SELECT * FROM payslips', []);
  const empList = emps.rows.map(rowToEmp);
  const activeAndWorking = empList.filter(e => e.status === 'Active');
  const onLeave = empList.filter(e => e.status === 'On Leave');
  const inactive = empList.filter(e => e.status === 'Inactive');
  let totalNetPay = 0;
  payslips.rows.forEach(p => { const data = J(p.data, {}); totalNetPay += +(data.netPay || data.net_pay || 0); });
  res.json({ totalEmployees: empList.length, pendingLeaves: leaves.rows.length, payslipsIssued: totalNetPay, details: { activeAndWorking: activeAndWorking.map(e => ({ id: e.id, empId: e.empId, name: e.name })), onLeave: onLeave.map(e => ({ id: e.id, empId: e.empId, name: e.name })), inactive: inactive.map(e => ({ id: e.id, empId: e.empId, name: e.name })) } });
});

app.get('/api/health', (req, res) => res.json({ ok: true, engine }));

init().then(async () => {
  const email = (process.env.SUPER_ADMIN_EMAIL || 'mauradhi@noon.com').toLowerCase();
  const r = await query('SELECT id FROM admins WHERE isSuperAdmin = 1', []);
  if (!r.rows.length) await query('INSERT INTO admins (id, email, name, isSuperAdmin, permissions, createdAt) VALUES (?, ?, ?, 1, ?, ?)', ['admin-001', email, 'Super Admin', '[]', today()]);
  app.listen(PORT, () => console.log('HRMS on port ' + PORT));
}).catch(e => { console.error(e); process.exit(1); });

module.exports = app;
