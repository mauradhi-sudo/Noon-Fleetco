require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const XLSX = require('xlsx');
const { query, init, engine, DATA_DIR } = require('./db');
const mailer = require('./mailer');

const app = express();
const PORT = +(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const p = path.join(DATA_DIR, '.jwt_secret');
  if (!fs.existsSync(p)) fs.writeFileSync(p, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(p, 'utf8');
})();

const UPLOAD_DIR = path.join(__dirname, 'uploads');            // persistent — kept OUT of the data dir (the data dir is wiped on re-seed)
const LEAVE_ATTACHMENTS_DIR = path.join(UPLOAD_DIR, 'leaves');
const LEGACY_UPLOAD_DIR = path.join(DATA_DIR, 'uploads');       // previous location, read as a fallback for older files
const LEGACY_LEAVE_DIR = path.join(LEGACY_UPLOAD_DIR, 'leaves');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(LEAVE_ATTACHMENTS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/[^\w-]/g, '');
      cb(null, Date.now() + '_' + base + ext);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const uploadLeaveAttachment = multer({
  storage: multer.diskStorage({
    destination: LEAVE_ATTACHMENTS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/[^\w-]/g, '');
      cb(null, Date.now() + '_' + base + ext);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Move an uploaded file into UPLOAD_DIR/<category>/<empNo>/ and return its path relative to UPLOAD_DIR.
function placeFile(file, category, empNo) {
  const cat = String(category || 'employee').replace(/[^a-z0-9_-]/gi, '') || 'employee';
  const emp = String(empNo || 'unknown').replace(/[^a-z0-9_-]/gi, '') || 'unknown';
  const dir = path.join(UPLOAD_DIR, cat, emp);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, file.filename);
  try { fs.renameSync(file.path, dest); } catch (e) { try { fs.copyFileSync(file.path, dest); fs.unlinkSync(file.path); } catch (_) {} }
  return path.posix.join(cat, emp, file.filename);
}
async function addDoc(empId, name, type, size, relPath, uploader) {
  const id = uid('D');
  await query('INSERT INTO documents (id, employeeId, name, type, size, filename, uploadedAt, uploader) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, empId, name, type, size || '', relPath, today(), uploader]);
  return id;
}
async function empNoOf(id) { try { const r = await query('SELECT * FROM employees WHERE id = ?', [id]); if (r.rows.length) return rowToEmp(r.rows[0]).empId || id; } catch (e) {} return id; }
// Extract the employee number embedded in a stored document path (e.g. 'employee/17812/file.pdf' -> '17812'); used as a stable fallback when an internal id changed after a re-import.
function docFolderNo(filename) { const parts = String(filename || '').split('/').filter(Boolean); return parts.length >= 2 ? parts[parts.length - 2] : ''; }

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// NOTE: no public /uploads mount — documents are served only via the authenticated /api/documents/:id/download route
app.use(express.static(path.join(__dirname, 'public')));

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const uid = (p) => p + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const J = (v, fb = {}) => { try { return JSON.parse(v); } catch (e) { return fb; } };

const rowToEmp = (r) => Object.assign(J(r.data, {}), { id: r.id, empId: r.empid ?? r.empId, passportNo: r.passportno ?? r.passportNo, name: r.name, email: r.email, status: r.status });
const rowToLeave = (r) => Object.assign(J(r.data, {}), { id: r.id, employeeId: r.employeeid ?? r.employeeId, status: r.status });
const rowToPs = (r) => Object.assign(J(r.data, {}), { id: r.id, employeeId: r.employeeid ?? r.employeeId, month: r.month });
const rowToNotif = (r) => Object.assign(J(r.data, {}), { id: r.id, employeeId: r.employeeid ?? r.employeeId, isRead: +(r.isread ?? r.isRead) });
const rowToAdmin = (r) => ({ id: r.id, email: r.email, name: r.name, isSuperAdmin: +(r.issuperadmin ?? r.isSuperAdmin), permissions: J(r.permissions, []), createdAt: r.createdat ?? r.createdAt });
const rowToCamp  = (r) => Object.assign(J(r.data, {}), { id: r.id, name: r.name });
const rowToRoom  = (r) => Object.assign(J(r.data, {}), { id: r.id, campId: r.campid ?? r.campId, building: r.building || '', floor: r.floor || '', roomNo: r.roomno ?? r.roomNo, capacity: +(r.capacity || 0) });
const rowToAlloc = (r) => Object.assign(J(r.data, {}), { id: r.id, employeeId: r.employeeid ?? r.employeeId, campId: r.campid ?? r.campId, roomId: r.roomid ?? r.roomId, bed: String(r.bed ?? ''), checkIn: r.checkin ?? r.checkIn });
const rowToAsset = (r) => Object.assign(J(r.data, {}), { id: r.id, type: r.type || 'other', code: r.code || '', name: r.name || '', status: r.status || 'Available', assignedTo: r.assignedto ?? r.assignedTo ?? null, assignedDate: r.assigneddate ?? r.assignedDate ?? null });

async function audit(user, action) { try { await query('INSERT INTO audit (t, usr, action) VALUES (?, ?, ?)', [new Date().toLocaleString(), user || 'System', action]); } catch (e) { } }
async function notify(employeeId, type, title, message) {
  try { await query('INSERT INTO notifications (id, employeeId, isRead, data) VALUES (?, ?, 0, ?)', [uid('N'), employeeId, JSON.stringify({ type, title, message, createdAt: today() })]); } catch (e) {}
  // also email the employee (best-effort, never blocks the request)
  try { const r = await query('SELECT * FROM employees WHERE id = ?', [employeeId]); if (r.rows.length) { const e = rowToEmp(r.rows[0]); if (e.email) mailer.sendNotice(e.email, `Noon Fleet HRMS \u2014 ${title}`, `Hi ${e.name || ''},\n\n${message}\n\n\u2014 Noon Fleet HRMS`).catch(() => {}); } } catch (e) {}
}
// Email every admin who can act on this kind of event (super admins are always included).
async function notifyAdmins(subject, text, permission) {
  const perms = Array.isArray(permission) ? permission : (permission ? [permission] : []);
  try {
    const r = await query('SELECT * FROM admins', []);
    for (const row of r.rows) {
      if (!row.email) continue;
      const isSuper = !!(row.isSuperAdmin ?? row.issuperadmin);
      let up = []; try { up = JSON.parse(row.permissions || '[]'); } catch (e) {}
      if (isSuper || !perms.length || perms.some(p => up.includes(p))) mailer.sendNotice(row.email, subject, text).catch(() => {});
    }
  } catch (e) {}
}

function token(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' }); }
function auth(req, res, next) {
  const h = (req.headers.authorization || '').trim();
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'Not signed in' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); } catch (e) { res.status(401).json({ error: 'Session expired' }); }
}
function isSuperAdmin(req) { return req.user && (req.user.isSuperAdmin === 1 || req.user.isSuperAdmin === true); }
function hasPermission(req, perm) { return isSuperAdmin(req) || (req.user && (req.user.permissions || []).includes(perm)); }

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

app.post('/api/auth/admin/request-otp', async (req, res) => { try { const email = String(req.body.email || '').trim().toLowerCase(); const r = await query('SELECT * FROM admins WHERE LOWER(email) = ?', [email]); if (!r.rows.length) return res.status(404).json({ error: 'Admin not found' }); const code = await issueOtp('admin:' + email); const sent = await mailer.sendOtp(email, code); res.json({ message: 'OTP sent to ' + email, ...(sent.dev ? { _devOtp: code } : {}) }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/auth/admin/verify-otp', async (req, res) => { try { const email = String(req.body.email || '').trim().toLowerCase(); if (!await checkOtp('admin:' + email, req.body.otp)) return res.status(401).json({ error: 'Incorrect code' }); const r = await query('SELECT * FROM admins WHERE LOWER(email) = ?', [email]); if (!r.rows.length) return res.status(404).json({ error: 'Admin not found' }); const a = rowToAdmin(r.rows[0]); await audit(a.name, 'Admin login'); res.json({ token: token({ role: 'admin', adminId: a.id, name: a.name, email: a.email, isSuperAdmin: a.isSuperAdmin, permissions: a.permissions }), role: 'admin', name: a.name, email: a.email, isSuperAdmin: a.isSuperAdmin, permissions: a.permissions }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/auth/employee/login', async (req, res) => { try { const empId = String(req.body.empId || '').trim().toUpperCase(); const pass = String(req.body.passportNo || '').trim(); const r = await query('SELECT * FROM employees WHERE UPPER(empId) = ?', [empId]); if (!r.rows.length || (r.rows[0].passportno ?? r.rows[0].passportNo) !== pass) return res.status(401).json({ error: 'Invalid credentials' }); const e = rowToEmp(r.rows[0]); if (e.status === 'Inactive') return res.status(403).json({ error: 'Account inactive' }); if (!e.email) return res.status(400).json({ error: 'No email on file' }); const code = await issueOtp('emp:' + e.empId); const sent = await mailer.sendOtp(e.email, code); const masked = e.email.replace(/^(..).*(@.*)$/, '$1•••$2'); res.json({ otpRequired: true, message: 'OTP sent to ' + masked, email: masked, ...(sent.dev ? { _devOtp: code } : {}) }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/auth/employee/verify-otp', async (req, res) => { try { const empId = String(req.body.empId || '').trim().toUpperCase(); if (!await checkOtp('emp:' + empId, req.body.otp)) return res.status(401).json({ error: 'Incorrect code' }); const r = await query('SELECT * FROM employees WHERE UPPER(empId) = ?', [empId]); if (!r.rows.length) return res.status(404).json({ error: 'Employee not found' }); const e = rowToEmp(r.rows[0]); await audit(e.name, 'Employee login'); res.json({ token: token({ role: 'employee', employeeId: e.id, empId: e.empId, name: e.name }), role: 'employee', employeeId: e.id, empId: e.empId, name: e.name }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/employees', auth, async (req, res) => { try { if (req.user.role === 'employee') { const r = await query('SELECT * FROM employees WHERE id = ?', [req.user.employeeId]); return res.json(r.rows.map(rowToEmp)); } const r = await query('SELECT * FROM employees ORDER BY empId', []); res.json(r.rows.map(rowToEmp)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/employees/export', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'view_reports')) return res.status(403).json({ error: 'No permission' });  const r = await query('SELECT * FROM employees ORDER BY empId', []); const emps = r.rows.map(rowToEmp).map(e => ({ 'Employee ID': e.empId || '', 'Name': e.name || '', 'Email': e.email || '', 'Passport': e.passportNo || '', 'Status': e.status || 'Active', 'Position': e.position || '', 'Department': e.department || '', 'Location': e.location || '' })); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(emps); XLSX.utils.book_append_sheet(wb, ws, 'Employees'); const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="employees_${today()}.xlsx"`); res.send(buf); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/employees/:id', auth, async (req, res) => { try { if (req.user.role === 'employee' && req.params.id !== req.user.employeeId) return res.status(403).json({ error: 'No permission' }); const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); res.json(rowToEmp(r.rows[0])); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/employees', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'add_employees')) return res.status(403).json({ error: 'No permission' }); const id = uid('E'); const emp = req.body; await query('INSERT INTO employees (id, empId, passportNo, name, email, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, emp.empId, emp.passportNo, emp.name, emp.email, emp.status || 'Active', JSON.stringify(emp)]); res.json({ id }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.patch('/api/employees/:id', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'edit_employees')) return res.status(403).json({ error: 'No permission' }); const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const e = rowToEmp(r.rows[0]); Object.assign(e, req.body); await query('UPDATE employees SET name = ?, email = ?, status = ?, passportNo = ?, data = ? WHERE id = ?', [e.name, e.email, e.status, e.passportNo, JSON.stringify(e), e.id]); res.json({ message: 'Updated' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.put('/api/employees/:id', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'edit_employees')) return res.status(403).json({ error: 'No permission' }); const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const e = rowToEmp(r.rows[0]); Object.assign(e, req.body); await query('UPDATE employees SET name = ?, email = ?, status = ?, passportNo = ?, data = ? WHERE id = ?', [e.name, e.email, e.status, e.passportNo, JSON.stringify(e), e.id]); res.json({ message: 'Updated' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.patch('/api/employees/:id/status', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'edit_employees')) return res.status(403).json({ error: 'No permission' }); const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const e = rowToEmp(r.rows[0]); e.status = req.body.status; await query('UPDATE employees SET status = ?, data = ? WHERE id = ?', [req.body.status, JSON.stringify(e), e.id]); res.json({ message: 'Updated' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.delete('/api/employees/:id', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'delete_employees')) return res.status(403).json({ error: 'Super admin only' }); const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const e = rowToEmp(r.rows[0]); await query('DELETE FROM employees WHERE id = ?', [req.params.id]); await query('DELETE FROM leaves WHERE employeeId = ?', [e.id]); await query('DELETE FROM payslips WHERE employeeId = ?', [e.id]); await query('DELETE FROM documents WHERE employeeId = ?', [e.id]); await query('DELETE FROM bed_allocations WHERE employeeId = ?', [e.id]); res.json({ message: 'Deleted' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/employees/bulk/import', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'import_employees')) return res.status(403).json({ error: 'No permission' }); const rows = req.body.rows || []; let added = 0, updated = 0; for (const row of rows) { const existing = await query('SELECT id FROM employees WHERE empId = ?', [row.empId]); if (existing.rows.length) { const e = rowToEmp(await query('SELECT * FROM employees WHERE empId = ?', [row.empId])); Object.assign(e, row); await query('UPDATE employees SET name = ?, email = ?, status = ?, passportNo = ?, data = ? WHERE empId = ?', [e.name, e.email, e.status || 'Active', e.passportNo, JSON.stringify(e), row.empId]); updated++; } else { const id = uid('E'); await query('INSERT INTO employees (id, empId, passportNo, name, email, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, row.empId, row.passportNo, row.name, row.email, row.status || 'Active', JSON.stringify(row)]); added++; } } await audit(req.user.name, `Bulk import: +${added}, ~${updated}`); res.json({ message: 'Imported', added, updated, total: added + updated }); } catch (e) { res.status(500).json({ error: e.message }); } });

// Profile photo — stored as a small base64 data URL on the employee record (avoids the auth-on-<img> problem).
// An employee can set their own photo; an admin needs edit_employees.
app.post('/api/employees/:id/photo', auth, async (req, res) => {
  try {
    const isSelf = req.user.role === 'employee' && req.user.employeeId === req.params.id;
    if (!isSelf && !isSuperAdmin(req) && !hasPermission(req, 'edit_employees')) return res.status(403).json({ error: 'No permission' });
    const photo = String(req.body.photo || '');
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(photo)) return res.status(400).json({ error: 'Invalid image' });
    if (photo.length > 700000) return res.status(413).json({ error: 'Image too large — please use a smaller photo' });
    const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const e = rowToEmp(r.rows[0]); e.photo = photo;
    await query('UPDATE employees SET data = ? WHERE id = ?', [JSON.stringify(e), e.id]);
    await audit(req.user.name || e.name, `Photo updated for ${e.empId || e.id}`);
    res.json({ message: 'Photo updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/employees/:id/photo', auth, async (req, res) => {
  try {
    const isSelf = req.user.role === 'employee' && req.user.employeeId === req.params.id;
    if (!isSelf && !isSuperAdmin(req) && !hasPermission(req, 'edit_employees')) return res.status(403).json({ error: 'No permission' });
    const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const e = rowToEmp(r.rows[0]); delete e.photo;
    await query('UPDATE employees SET data = ? WHERE id = ?', [JSON.stringify(e), e.id]);
    res.json({ message: 'Photo removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Granular onboarding-milestone updates. Each field maps to its own permission so an admin
// can be allowed to update e.g. only the medical date. edit_employees / super covers all of them.
const ONBOARDING_FIELD_PERM = {
  medicalDate:    'update_medical_date',
  inductionDate:  'update_induction_date',
  biometricDate:  'update_biometric_date',
  eidDate:        'update_eid_date',
  dlDate:         'update_license_date',
  deploymentDate: 'update_deployment_date',
};
app.patch('/api/employees/:id/onboarding', auth, async (req, res) => {
  try {
    if (req.user.role === 'employee') return res.status(403).json({ error: 'No permission' });
    const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const e = rowToEmp(r.rows[0]);
    const applied = [], denied = [];
    for (const [field, perm] of Object.entries(ONBOARDING_FIELD_PERM)) {
      if (!(field in req.body)) continue;
      if (isSuperAdmin(req) || hasPermission(req, 'edit_employees') || hasPermission(req, perm)) {
        e[field] = req.body[field]; applied.push(field);
      } else denied.push(field);
    }
    if (!applied.length) return res.status(403).json({ error: 'You do not have permission to update ' + (denied.join(', ') || 'these fields') });
    await query('UPDATE employees SET data = ? WHERE id = ?', [JSON.stringify(e), e.id]);
    await audit(req.user.name, `Onboarding update for ${e.empId || e.id}: ${applied.join(', ')}`);
    res.json({ message: 'Updated', applied, denied });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leaves', auth, async (req, res) => { try { if (req.user.role === 'employee') { const r = await query('SELECT * FROM leaves WHERE employeeId = ?', [req.user.employeeId]); return res.json(r.rows.map(rowToLeave)); } const r = await query('SELECT * FROM leaves ORDER BY id DESC', []); res.json(r.rows.map(rowToLeave)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/leaves', auth, async (req, res) => { try { const empId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId; const r = await query('SELECT * FROM employees WHERE id = ?', [empId]); if (!r.rows.length) return res.status(404).json({ error: 'Employee not found' }); const e = rowToEmp(r.rows[0]); if (req.body.fromDate && req.body.toDate && String(req.body.toDate) < String(req.body.fromDate)) return res.status(400).json({ error: 'The leave end date must be on or after the start date.' }); const id = uid('L'); const lv = { type: req.body.type, fromDate: req.body.fromDate, toDate: req.body.toDate, days: +req.body.days || 1, reason: req.body.reason || '', empName: e.name, empId: e.empId, appliedOn: today(), certificate: !!(req.body.certDocId || req.body.certificate), certDocId: req.body.certDocId || '', certificateName: req.body.certificateName || '' }; await query('INSERT INTO leaves (id, employeeId, status, data) VALUES (?, ?, ?, ?)', [id, e.id, 'Pending', JSON.stringify(lv)]); await notify(e.id, 'pending', 'Leave request submitted', `Your ${lv.type} from ${lv.fromDate} to ${lv.toDate} (${lv.days} day(s)) has been submitted and is awaiting approval. You will be notified once it is reviewed.`); await notifyAdmins(`New leave request \u2014 ${e.name}`, `${e.name} (${e.empId}) has requested ${lv.type} from ${lv.fromDate} to ${lv.toDate} (${lv.days} day(s)).\nReason: ${lv.reason || '\u2014'}\n\nReview it in the HRMS under Leave Requests.`, 'approve_leaves'); res.json({ id }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.patch('/api/leaves/:id/decide', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'approve_leaves')) return res.status(403).json({ error: 'No permission' }); const r = await query('SELECT * FROM leaves WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const lv = rowToLeave(r.rows[0]); const newSt = req.body.decision === 'Approved' ? 'Approved' : 'Rejected'; lv.status = newSt; lv.decidedAt = today(); lv.decidedBy = req.user.name; await query('UPDATE leaves SET status = ?, data = ? WHERE id = ?', [newSt, JSON.stringify(lv), lv.id]); await notify(lv.employeeId, newSt === 'Approved' ? 'approved' : 'rejected', 'Leave ' + newSt, `Your ${lv.type} from ${lv.fromDate} to ${lv.toDate} has been ${newSt.toLowerCase()} by ${req.user.name}.`); res.json({ message: newSt }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/leaves/:id/attachments', auth, uploadLeaveAttachment.single('file'), async (req, res) => { try { if (!req.file) return res.status(400).json({ error: 'No file' }); const r = await query('SELECT * FROM leaves WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Leave not found' }); const lv = rowToLeave(r.rows[0]); if (lv.employeeId !== req.user.employeeId && req.user.role === 'employee') return res.status(403).json({ error: 'No permission' }); if (!lv.attachments) lv.attachments = []; lv.attachments.push({ name: req.body.name || req.file.originalname, filename: req.file.filename, uploadedAt: today(), uploadedBy: req.user.name }); await query('UPDATE leaves SET data = ? WHERE id = ?', [JSON.stringify(lv), lv.id]); res.json({ message: 'Attachment added', filename: req.file.filename }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/leaves/:id/attachments', auth, async (req, res) => { try { const r = await query('SELECT * FROM leaves WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Leave not found' }); const lv = rowToLeave(r.rows[0]); res.json(lv.attachments || []); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/leaves/:id/attachments/:filename/download', async (req, res) => { try { const r = await query('SELECT * FROM leaves WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Leave not found' }); const lv = rowToLeave(r.rows[0]); const att = (lv.attachments || []).find(a => a.filename === req.params.filename); if (!att) return res.status(404).json({ error: 'Attachment not found' }); let filepath = path.join(LEAVE_ATTACHMENTS_DIR, att.filename); if (!fs.existsSync(filepath)) filepath = path.join(LEGACY_LEAVE_DIR, att.filename); if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' }); res.download(filepath, att.name || att.filename); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/leaves/export', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'view_reports')) return res.status(403).json({ error: 'No permission' });  const r = await query('SELECT * FROM leaves ORDER BY id DESC', []); const leaves = r.rows.map(rowToLeave).map(l => ({ 'Employee ID': l.empId || '', 'Employee Name': l.empName || '', 'Type': l.type || '', 'From Date': l.fromDate || '', 'To Date': l.toDate || '', 'Days': l.days || 0, 'Status': l.status || '', 'Applied On': l.appliedOn || '', 'Decided By': l.decidedBy || '', 'Decided At': l.decidedAt || '' })); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(leaves); XLSX.utils.book_append_sheet(wb, ws, 'Leaves'); const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="leaves_${today()}.xlsx"`); res.send(buf); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/payslips/export', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'view_reports')) return res.status(403).json({ error: 'No permission' });  const r = await query('SELECT * FROM payslips ORDER BY month DESC', []); const ps = r.rows.map(rowToPs).map(p => ({ 'Employee ID': p.employeeId || '', 'Month': p.month || '', 'Basic': p.basic || 0, 'Allowances': p.allowances || 0, 'Deductions': p.deductions || 0, 'Net Pay': p.netPay || p.net_pay || 0 })); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(ps); XLSX.utils.book_append_sheet(wb, ws, 'Payslips'); const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="payslips_${today()}.xlsx"`); res.send(buf); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/payslips', auth, async (req, res) => { try { if (req.user.role === 'employee') { const r = await query('SELECT * FROM payslips WHERE employeeId = ?', [req.user.employeeId]); return res.json(r.rows.map(rowToPs)); } const r = await query('SELECT * FROM payslips ORDER BY month DESC', []); res.json(r.rows.map(rowToPs)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/payslips/bulk', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'manage_payroll')) return res.status(403).json({ error: 'No permission' }); const rows = req.body.rows || []; for (const row of rows) await query('INSERT INTO payslips (id, employeeId, month, data) VALUES (?, ?, ?, ?)', [uid('P'), row.employeeId, req.body.month, JSON.stringify(row)]); await audit(req.user.name, `Payslips generated: ${rows.length}`); res.json({ message: 'Generated', count: rows.length }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/documents', auth, async (req, res) => {
  try {
    const emps = req.user.role !== 'employee' ? (await query('SELECT id, empId, name FROM employees', [])).rows : [];
    const empMap = {};
    for (const e of emps) { empMap[e.id] = e.name; }
    const rowToDoc = d => ({
      id: d.id,
      employeeId: d.employeeid ?? d.employeeId,
      name: d.name,
      type: d.type,
      size: d.size,
      filename: d.filename,
      uploadedAt: d.uploadedat ?? d.uploadedAt,
      uploader: d.uploader,
      reviewStatus: d.reviewstatus ?? d.reviewStatus ?? 'Pending',
      reviewedBy: d.reviewedby ?? d.reviewedBy,
      reviewedAt: d.reviewedat ?? d.reviewedAt,
      empName: empMap[d.employeeid ?? d.employeeId] || ''
    });
    if (req.user.role === 'employee') {
      const empNo = String(req.user.empId || '').toUpperCase();
      const r = await query('SELECT * FROM documents', []);
      const mine = r.rows.filter(d => {
        const eid = d.employeeid ?? d.employeeId;
        if (eid === req.user.employeeId) return true;
        const no = docFolderNo(d.filename).toUpperCase();
        return !!no && no === empNo;
      });
      return res.json(mine.map(rowToDoc));
    }
    const r = await query('SELECT * FROM documents ORDER BY uploadedAt DESC', []);
    res.json(r.rows.map(rowToDoc));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/documents', auth, upload.single('file'), async (req, res) => { try { if (!req.file) return res.status(400).json({ error: 'No file' }); if (req.user.role !== 'employee' && !hasPermission(req, 'upload_documents')) return res.status(403).json({ error: 'No permission' }); const empId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId; const empNo = await empNoOf(empId); const category = ['leave', 'acc', 'bike', 'employee'].includes(String(req.body.category || '').toLowerCase()) ? String(req.body.category).toLowerCase() : 'employee'; const relPath = placeFile(req.file, category, empNo); const docType = (req.body.type && String(req.body.type).trim()) || req.file.mimetype; const id = await addDoc(empId, req.body.name || req.file.originalname, docType, req.file.size, relPath, req.user.name); res.json({ id, filename: relPath }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/documents/:id/download', auth, async (req, res) => { try { const r = await query('SELECT * FROM documents WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const d = r.rows[0]; const owner = d.employeeid ?? d.employeeId; if (req.user.role === 'employee' && owner !== req.user.employeeId && docFolderNo(d.filename).toUpperCase() !== String(req.user.empId || '').toUpperCase()) return res.status(403).json({ error: 'No permission' }); let filepath = path.join(UPLOAD_DIR, d.filename); if (!fs.existsSync(filepath)) filepath = path.join(LEGACY_UPLOAD_DIR, d.filename); if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' }); res.download(filepath, d.name || d.filename); } catch (e) { res.status(500).json({ error: e.message }); } });

app.patch('/api/documents/:id/review', auth, async (req, res) => {
  try {
    if (req.user.role === 'employee') return res.status(403).json({ error: 'No permission' });
    if (!isSuperAdmin(req) && !hasPermission(req, 'upload_documents') && !hasPermission(req, 'review_documents')) return res.status(403).json({ error: 'No permission' });
    const status = req.body.reviewStatus;
    if (!['Pending', 'Approved', 'Rejected', 'Reviewed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const r = await query('SELECT id FROM documents WHERE id = ?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await query('UPDATE documents SET reviewStatus = ?, reviewedBy = ?, reviewedAt = ? WHERE id = ?',
      [status, req.user.name, today(), req.params.id]);
    await audit(req.user.name, `Document ${req.params.id} marked ${status}`);
    res.json({ message: status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/documents/:id', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'upload_documents')) return res.status(403).json({ error: 'No permission' }); const r = await query('SELECT * FROM documents WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const d = r.rows[0]; await query('DELETE FROM documents WHERE id = ?', [req.params.id]); try { const fp = path.join(UPLOAD_DIR, d.filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) {} res.json({ message: 'Deleted' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/notifications', auth, async (req, res) => { try { const id = req.user.role === 'employee' ? req.user.employeeId : '__none__'; const r = await query('SELECT * FROM notifications WHERE employeeId = ? ORDER BY id DESC', [id]); res.json(r.rows.map(rowToNotif)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.patch('/api/notifications/read-all', auth, async (req, res) => { try { const id = req.user.role === 'employee' ? req.user.employeeId : '__none__'; await query('UPDATE notifications SET isRead = 1 WHERE employeeId = ?', [id]); res.json({ message: 'Marked as read' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/admins', auth, async (req, res) => { try { if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' }); const r = await query('SELECT * FROM admins ORDER BY createdAt', []); res.json(r.rows.map(rowToAdmin)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/admins', auth, async (req, res) => { try { if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' }); const id = uid('A'); const code = await issueOtp('admin:' + req.body.email.toLowerCase()); await mailer.sendOtp(req.body.email, code); await query('INSERT INTO admins (id, email, name, isSuperAdmin, permissions, createdAt) VALUES (?, ?, ?, 0, ?, ?)', [id, req.body.email.toLowerCase(), req.body.name, JSON.stringify(req.body.permissions || []), today()]); await audit(req.user.name, `Admin created: ${req.body.email}`); res.json({ id, message: 'OTP sent to ' + req.body.email }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.put('/api/admins/:id', auth, async (req, res) => { try { if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' }); const r = await query('SELECT * FROM admins WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Admin not found' }); const cur = rowToAdmin(r.rows[0]); const name = String(req.body.name || '').trim() || cur.name; const email = String(req.body.email || '').trim().toLowerCase() || cur.email; const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : (cur.permissions || []); await query('UPDATE admins SET name = ?, email = ?, permissions = ? WHERE id = ?', [name, email, JSON.stringify(permissions), req.params.id]); await audit(req.user.name, `Admin updated: ${email}`); res.json({ message: 'Updated' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.delete('/api/admins/:id', auth, async (req, res) => { try { if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' }); const r = await query('SELECT * FROM admins WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Admin not found' }); const row = r.rows[0]; if (row.id === req.user.adminId) return res.status(400).json({ error: 'You cannot delete your own admin account' }); if (!!(row.isSuperAdmin ?? row.issuperadmin)) return res.status(400).json({ error: 'A super admin account cannot be deleted here' }); await query('DELETE FROM admins WHERE id = ?', [req.params.id]); await audit(req.user.name, `Admin deleted: ${row.email}`); res.json({ message: 'Deleted' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/audit', auth, async (req, res) => { try { if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' }); const r = await query('SELECT * FROM audit ORDER BY seq DESC LIMIT 500', []); res.json(r.rows.map(x => ({ t: x.t, user: x.usr, action: x.action }))); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/config', auth, async (req, res) => { try { const r = await query('SELECT v FROM config WHERE k = ?', ['cfg']); res.json(r.rows.length ? J(r.rows[0].v, {}) : {}); } catch (e) { res.status(500).json({ error: e.message }); } });

app.put('/api/config', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'manage_settings')) return res.status(403).json({ error: 'No permission' }); await query('DELETE FROM config WHERE k = ?', ['cfg']); await query('INSERT INTO config (k, v) VALUES (?, ?)', ['cfg', JSON.stringify(req.body)]); res.json({ message: 'Saved' }); } catch (e) { res.status(500).json({ error: e.message }); } });

/* ─── Reports (Excel exports) ─────────────────────────────── */
function sendXlsx(res, name, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}_${today()}.xlsx"`);
  res.send(buf);
}

app.get('/api/reports/accommodation', auth, async (req, res) => {
  try {
    if (!isSuperAdmin(req) && !hasPermission(req, 'view_reports')) return res.status(403).json({ error: 'No permission' });
    const camps = (await query('SELECT * FROM camps', [])).rows.map(rowToCamp);
    const rooms = (await query('SELECT * FROM acc_rooms', [])).rows.map(rowToRoom);
    const emps  = (await query('SELECT * FROM employees', [])).rows.map(rowToEmp);
    const allocs = (await query('SELECT * FROM bed_allocations', [])).rows.map(rowToAlloc).map(a => enrichAlloc(a, camps, rooms, emps));
    const hist = (await query('SELECT * FROM acc_history', [])).rows.map(h => {
      const eid = h.employeeid ?? h.employeeId, cid = h.campid ?? h.campId, rid = h.roomid ?? h.roomId;
      const c = camps.find(x => x.id === cid) || {}, rm = rooms.find(x => x.id === rid) || {}, e = emps.find(x => x.id === eid) || {};
      return { 'Employee ID': e.empId || '', 'Name': e.name || '', 'Camp': c.name || '', 'Room': rm.roomNo || '', 'Bed': h.bed ?? '', 'Check-in': h.checkin ?? h.checkIn ?? '', 'Check-out': h.checkout ?? h.checkOut ?? '' };
    });
    const current = allocs.map(a => ({ 'Employee ID': a.empCode || '', 'Name': a.empName || '', 'Camp': a.campName || '', 'Room': a.roomNo || '', 'Bed': a.bed || '', 'Check-in': a.checkIn || '' }));
    const occupancy = camps.map(c => { const cr = rooms.filter(r => r.campId === c.id); const cap = cr.reduce((s, r) => s + (r.capacity || 0), 0); const occ = allocs.filter(a => a.campId === c.id).length; return { 'Camp': c.name, 'Rooms': cr.length, 'Capacity': cap, 'Occupied': occ, 'Vacant': Math.max(0, cap - occ) }; });
    sendXlsx(res, 'accommodation_report', [['Current occupants', current], ['Camp occupancy', occupancy], ['Stay history', hist]]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/assets', auth, async (req, res) => {
  try {
    if (!isSuperAdmin(req) && !hasPermission(req, 'view_reports') && !hasPermission(req, 'view_assets') && !hasPermission(req, 'assign_assets') && !hasPermission(req, 'manage_assets')) return res.status(403).json({ error: 'No permission' });
    const emps = (await query('SELECT * FROM employees', [])).rows.map(rowToEmp);
    const assets = (await query('SELECT * FROM assets', [])).rows.map(rowToAsset).map(a => enrichAsset(a, emps));
    const row = a => ({ 'Type': a.type, 'Asset ID': a.code, 'Name': a.name || '', 'Plate / Number': a.plateNo || a.number || '', 'Brand': a.brand || '', 'Model': a.model || '', 'Provider': a.provider || '', 'Reg. expiry': a.registrationExpiry || '', 'Ins. expiry': a.insuranceExpiry || '', 'Status': a.status, 'Holder ID': a.holderCode || '', 'Holder': a.holderName || '', 'Assigned on': a.assignedDate || '' });
    sendXlsx(res, 'asset_register', [
      ['Bikes', assets.filter(a => a.type === 'bike').map(row)],
      ['SIM cards', assets.filter(a => a.type === 'sim').map(row)],
      ['Other assets', assets.filter(a => a.type === 'other').map(row)],
    ]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/expiring', auth, async (req, res) => {
  try {
    if (!isSuperAdmin(req) && !hasPermission(req, 'view_reports')) return res.status(403).json({ error: 'No permission' });
    const emps = (await query('SELECT * FROM employees', [])).rows.map(rowToEmp);
    const assets = (await query('SELECT * FROM assets', [])).rows.map(rowToAsset).map(a => enrichAsset(a, emps));
    const visas = emps.filter(e => { const n = daysUntil(e.evisaExpiry); return n != null && n <= 90; })
      .sort((a, b) => daysUntil(a.evisaExpiry) - daysUntil(b.evisaExpiry))
      .map(e => ({ 'Employee ID': e.empId, 'Name': e.name, 'Passport': e.passportNo || '', 'Visa expiry': e.evisaExpiry || '', 'Days left': daysUntil(e.evisaExpiry) }));
    const veh = [];
    assets.filter(a => a.type === 'bike').forEach(b => {
      ['registrationExpiry', 'insuranceExpiry'].forEach(field => {
        const n = daysUntil(b[field]);
        if (n != null && n <= 30) veh.push({ 'Asset ID': b.code, 'Plate': b.plateNo || '', 'Document': field === 'registrationExpiry' ? 'Registration' : 'Insurance', 'Expiry': b[field], 'Days left': n, 'Holder': b.holderName || 'Unassigned' });
      });
    });
    veh.sort((a, b) => a['Days left'] - b['Days left']);
    sendXlsx(res, 'expiring_documents', [['Visas (90 days)', visas], ['Vehicle docs (30 days)', veh]]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/custom', auth, async (req, res) => {
  try {
    if (!isSuperAdmin(req) && !hasPermission(req, 'view_reports')) return res.status(403).json({ error: 'No permission' });
    const COLS = { empId: 'Employee ID', name: 'Name', firstName: 'First name', lastName: 'Last name', passportNo: 'Passport', nationality: 'Nationality', gender: 'Gender', contact: 'Contact', email: 'Email', position: 'Position', collar: 'Collar', department: 'Department', location: 'Location', status: 'Status', joiningDate: 'Joining date', deploymentDate: 'Deployment date', inductionDate: 'Induction date', medicalDate: 'Medical date', biometricDate: 'Biometric date', eidDate: 'EID received', dlDate: 'Licence received', riderId: 'Rider ID', visaStatus: 'Visa status', evisaExpiry: 'E-visa expiry', passportExpiry: 'Passport expiry', eidExpiry: 'EID expiry', laborCardExpiry: 'Labour card expiry', licenseExpiry: 'Licence expiry', contractExpiry: 'Contract expiry', eidNo: 'EID number', bankName: 'Bank', iban: 'IBAN', basicSalary: 'Basic', housingSalary: 'Housing', transportSalary: 'Transport', foodSalary: 'Food' };
    let cols = String(req.query.cols || '').split(',').map(c => c.trim()).filter(c => COLS[c]);
    if (!cols.length) cols = ['empId', 'name', 'position', 'status'];
    const fStatus = String(req.query.status || '').trim();
    const fPos = String(req.query.position || '').trim().toLowerCase();
    const fLoc = String(req.query.location || '').trim().toLowerCase();
    const emps = (await query('SELECT * FROM employees ORDER BY empId', [])).rows.map(rowToEmp)
      .filter(e => (!fStatus || (e.status || '') === fStatus) && (!fPos || (e.position || '').toLowerCase().includes(fPos)) && (!fLoc || (e.location || '').toLowerCase().includes(fLoc)));
    const rows = emps.map(e => { const o = {}; cols.forEach(c => { o[COLS[c]] = e[c] != null ? e[c] : ''; }); return o; });
    sendXlsx(res, 'custom_employee_report', [['Employees', rows]]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard/metrics', auth, async (req, res) => { try { const emps = await query('SELECT * FROM employees ORDER BY empId', []); const leaves = await query('SELECT * FROM leaves WHERE status = ?', ['Pending']); const payslips = await query('SELECT * FROM payslips', []); const empList = emps.rows.map(rowToEmp); const activeAndWorking = empList.filter(e => e.status === 'Active'); const onLeave = empList.filter(e => e.status === 'On Leave'); const inactive = empList.filter(e => e.status === 'Inactive'); let totalNetPay = 0; payslips.rows.forEach(p => { const data = J(p.data, {}); totalNetPay += +(data.netPay || data.net_pay || 0); }); res.json({ totalEmployees: empList.length, pendingLeaves: leaves.rows.length, payslipsIssued: totalNetPay, details: { activeAndWorking: activeAndWorking.map(e => ({ id: e.id, empId: e.empId, name: e.name })), onLeave: onLeave.map(e => ({ id: e.id, empId: e.empId, name: e.name })), inactive: inactive.map(e => ({ id: e.id, empId: e.empId, name: e.name })) } }); } catch (e) { res.status(500).json({ error: e.message }); } });

/* ─── Accommodation ─────────────────────────────────────────────────────────
   Camp → Building → Floor → Room → Bed.  Bed allocations link an employee to a
   specific camp/room/bed with a check-in date.  Reads are permission-gated the
   same way as the rest of the system: an employee can only ever see their own
   allocation, regardless of what the browser requests. */
function canManageAcc(req) { return isSuperAdmin(req) || hasPermission(req, 'manage_accommodation'); }
function canAssignBeds(req) { return canManageAcc(req) || hasPermission(req, 'assign_beds'); }
function enrichAlloc(a, camps, rooms, emps) {
  const camp = camps.find(c => c.id === a.campId) || {};
  const room = rooms.find(r => r.id === a.roomId) || {};
  const emp  = emps.find(e => e.id === a.employeeId) || {};
  return Object.assign({}, a, { campName: camp.name || '', roomNo: room.roomNo || '', empName: emp.name || '', empCode: emp.empId || '' });
}

// Camps (with room count + capacity/occupancy summary)
app.get('/api/accommodation/camps', auth, async (req, res) => {
  try {
    const camps  = (await query('SELECT * FROM camps ORDER BY name', [])).rows.map(rowToCamp);
    const rooms  = (await query('SELECT * FROM acc_rooms', [])).rows.map(rowToRoom);
    const allocs = (await query('SELECT * FROM bed_allocations', [])).rows.map(rowToAlloc);
    res.json(camps.map(c => {
      const cr  = rooms.filter(r => r.campId === c.id);
      const cap = cr.reduce((s, r) => s + (+r.capacity || 0), 0);
      const occ = allocs.filter(a => a.campId === c.id).length;
      return Object.assign({}, c, { rooms: cr.length, capacity: cap, occupied: occ, vacant: Math.max(0, cap - occ) });
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/accommodation/camps', auth, async (req, res) => {
  try {
    if (!canManageAcc(req)) return res.status(403).json({ error: 'No permission' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Camp name is required' });
    const dup = await query('SELECT id FROM camps WHERE LOWER(name) = ?', [name.toLowerCase()]);
    if (dup.rows.length) return res.status(409).json({ error: 'A camp with that name already exists' });
    const id = uid('C');
    await query('INSERT INTO camps (id, name, data) VALUES (?, ?, ?)', [id, name, JSON.stringify({ createdAt: today() })]);
    await audit(req.user.name, `Camp added: ${name}`);
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/accommodation/camps/:id', auth, async (req, res) => {
  try {
    if (!canManageAcc(req)) return res.status(403).json({ error: 'No permission' });
    const rooms = await query('SELECT id FROM acc_rooms WHERE campId = ?', [req.params.id]);
    if (rooms.rows.length) return res.status(409).json({ error: 'Delete this camp\'s rooms first' });
    await query('DELETE FROM camps WHERE id = ?', [req.params.id]);
    await audit(req.user.name, 'Camp deleted');
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rooms (with per-bed occupancy)
app.get('/api/accommodation/rooms', auth, async (req, res) => {
  try {
    const camps  = (await query('SELECT * FROM camps', [])).rows.map(rowToCamp);
    const emps   = (await query('SELECT * FROM employees', [])).rows.map(rowToEmp);
    const allocs = (await query('SELECT * FROM bed_allocations', [])).rows.map(rowToAlloc);
    let rooms    = (await query('SELECT * FROM acc_rooms', [])).rows.map(rowToRoom);
    if (req.query.campId) rooms = rooms.filter(r => r.campId === req.query.campId);
    const campName = id => (camps.find(c => c.id === id) || {}).name || '';
    const empName  = id => (emps.find(e => e.id === id) || {}).name || '';
    rooms.sort((a, b) => String(campName(a.campId)).localeCompare(String(campName(b.campId))) || String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true }));
    res.json(rooms.map(r => {
      const beds = allocs.filter(a => a.roomId === r.id).map(a => ({ bed: a.bed, employeeId: a.employeeId, empName: empName(a.employeeId) }));
      return Object.assign({}, r, { campName: campName(r.campId), occupied: beds.length, vacant: Math.max(0, (+r.capacity || 0) - beds.length), beds });
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/accommodation/rooms', auth, async (req, res) => {
  try {
    if (!canManageAcc(req)) return res.status(403).json({ error: 'No permission' });
    const campId = req.body.campId;
    const roomNo = String(req.body.roomNo || '').trim();
    if (!campId || !roomNo) return res.status(400).json({ error: 'Camp and room number are required' });
    const camp = await query('SELECT id FROM camps WHERE id = ?', [campId]);
    if (!camp.rows.length) return res.status(404).json({ error: 'Camp not found' });
    const cap = Math.max(1, parseInt(req.body.capacity, 10) || 1);
    const building = String(req.body.building || '').trim();
    const floor = String(req.body.floor || '').trim();
    const id = uid('R');
    await query('INSERT INTO acc_rooms (id, campId, building, floor, roomNo, capacity, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, campId, building, floor, roomNo, cap, JSON.stringify({ building, floor, createdAt: today() })]);
    await audit(req.user.name, `Room added: ${roomNo} (capacity ${cap})`);
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/accommodation/rooms/:id', auth, async (req, res) => {
  try {
    if (!canManageAcc(req)) return res.status(403).json({ error: 'No permission' });
    const r = await query('SELECT * FROM acc_rooms WHERE id = ?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const room = rowToRoom(r.rows[0]);
    const cap = req.body.capacity != null ? Math.max(1, parseInt(req.body.capacity, 10) || 1) : room.capacity;
    const occRow = (await query('SELECT COUNT(*) AS c FROM bed_allocations WHERE roomId = ?', [req.params.id])).rows[0];
    const occN = +(occRow.c ?? occRow.count ?? 0);
    if (cap < occN) return res.status(409).json({ error: `Capacity can't be below current occupancy (${occN})` });
    const building = req.body.building != null ? String(req.body.building).trim() : room.building;
    const floor    = req.body.floor != null ? String(req.body.floor).trim() : room.floor;
    const roomNo   = req.body.roomNo != null ? String(req.body.roomNo).trim() : room.roomNo;
    const data = Object.assign(J(r.rows[0].data, {}), { building, floor });
    await query('UPDATE acc_rooms SET campId = ?, building = ?, floor = ?, roomNo = ?, capacity = ?, data = ? WHERE id = ?',
      [room.campId, building, floor, roomNo, cap, JSON.stringify(data), req.params.id]);
    await audit(req.user.name, `Room updated: ${roomNo}`);
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/accommodation/rooms/:id', auth, async (req, res) => {
  try {
    if (!canManageAcc(req)) return res.status(403).json({ error: 'No permission' });
    const occRow = (await query('SELECT COUNT(*) AS c FROM bed_allocations WHERE roomId = ?', [req.params.id])).rows[0];
    if (+(occRow.c ?? occRow.count ?? 0)) return res.status(409).json({ error: 'Vacate all beds in this room first' });
    await query('DELETE FROM acc_rooms WHERE id = ?', [req.params.id]);
    await audit(req.user.name, 'Room deleted');
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bed allocations
app.get('/api/accommodation/allocations', auth, async (req, res) => {
  try {
    const camps  = (await query('SELECT * FROM camps', [])).rows.map(rowToCamp);
    const rooms  = (await query('SELECT * FROM acc_rooms', [])).rows.map(rowToRoom);
    const emps   = (await query('SELECT * FROM employees', [])).rows.map(rowToEmp);
    let allocs   = (await query('SELECT * FROM bed_allocations', [])).rows.map(rowToAlloc);
    if (req.user.role === 'employee') allocs = allocs.filter(a => a.employeeId === req.user.employeeId);
    res.json(allocs.map(a => enrichAlloc(a, camps, rooms, emps)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/accommodation/allocations', auth, async (req, res) => {
  try {
    if (!canAssignBeds(req)) return res.status(403).json({ error: 'No permission' });
    const { employeeId, campId, roomId } = req.body;
    const bed = String(req.body.bed || '').trim();
    const checkIn = req.body.checkIn || today();
    if (!employeeId || !campId || !roomId || !bed) return res.status(400).json({ error: 'Employee, camp, room and bed are all required' });
    const roomRow = await query('SELECT * FROM acc_rooms WHERE id = ?', [roomId]);
    if (!roomRow.rows.length) return res.status(404).json({ error: 'Room not found' });
    const room = rowToRoom(roomRow.rows[0]);
    if (room.campId !== campId) return res.status(400).json({ error: 'That room is not in the selected camp' });
    const bedN = parseInt(bed, 10);
    if (!(bedN >= 1 && bedN <= room.capacity)) return res.status(400).json({ error: `Bed must be between 1 and ${room.capacity}` });
    const clash = await query('SELECT employeeId FROM bed_allocations WHERE roomId = ? AND bed = ?', [roomId, bed]);
    if (clash.rows.length) {
      const holder = clash.rows[0].employeeid ?? clash.rows[0].employeeId;
      if (holder !== employeeId) return res.status(409).json({ error: 'That bed is already occupied' });
    }
    const data = { checkIn };
    const existing = await query('SELECT id FROM bed_allocations WHERE employeeId = ?', [employeeId]);
    if (existing.rows.length) {
      await query('UPDATE bed_allocations SET campId = ?, roomId = ?, bed = ?, checkIn = ?, data = ? WHERE employeeId = ?',
        [campId, roomId, bed, checkIn, JSON.stringify(data), employeeId]);
    } else {
      await query('INSERT INTO bed_allocations (id, employeeId, campId, roomId, bed, checkIn, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uid('B'), employeeId, campId, roomId, bed, checkIn, JSON.stringify(data)]);
    }
    const accCampRow = (await query('SELECT * FROM camps WHERE id = ?', [campId])).rows[0];
    const accCampName = accCampRow ? (rowToCamp(accCampRow).name || 'camp') : 'camp';
    const accEmpRow = (await query('SELECT * FROM employees WHERE id = ?', [employeeId])).rows[0];
    const accEmp = accEmpRow ? rowToEmp(accEmpRow) : {};
    await notify(employeeId, 'approved', 'Accommodation assigned', `You have been allocated accommodation at ${accCampName} \u2014 Room ${room.roomNo}, Bed ${bed}.`);
    await notifyAdmins(`Accommodation assigned \u2014 ${accEmp.name || ''}`, `${accEmp.name || ''} (${accEmp.empId || ''}) was allocated ${accCampName}, Room ${room.roomNo}, Bed ${bed} by ${req.user.name}.`, ['manage_accommodation', 'assign_beds']);
    await audit(req.user.name, `Bed allocated: emp ${employeeId} → room ${room.roomNo}, bed ${bed}`);
    res.json({ message: 'Allocated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/accommodation/allocations/:id', auth, async (req, res) => {
  try {
    if (!canAssignBeds(req)) return res.status(403).json({ error: 'No permission' });
    await query('DELETE FROM bed_allocations WHERE id = ?', [req.params.id]);
    await audit(req.user.name, 'Bed vacated');
    res.json({ message: 'Vacated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Record an accommodation exit: archive the stay (check-in -> check-out) then free the bed.
app.post('/api/accommodation/allocations/:id/exit', auth, upload.single('file'), async (req, res) => {
  try {
    if (!canAssignBeds(req)) return res.status(403).json({ error: 'No permission' });
    if (!req.file) return res.status(400).json({ error: 'An exit form must be attached before the exit date can be recorded.' });
    const r = await query('SELECT * FROM bed_allocations WHERE id = ?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Allocation not found' });
    const a = rowToAlloc(r.rows[0]);
    const checkOut = req.body.checkOut || today();
    if (a.checkIn && String(checkOut) < String(a.checkIn)) return res.status(400).json({ error: 'Exit date cannot be before the check-in date' });
    const exEmpRow = (await query('SELECT * FROM employees WHERE id = ?', [a.employeeId])).rows[0];
    const exEmp = exEmpRow ? rowToEmp(exEmpRow) : {};
    const exitFormPath = placeFile(req.file, 'acc', exEmp.empId || a.employeeId);
    await addDoc(a.employeeId, 'Accommodation Exit Form', req.file.mimetype, req.file.size, exitFormPath, req.user.name);
    await query('INSERT INTO acc_history (id, employeeId, campId, roomId, bed, checkIn, checkOut, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uid('AH'), a.employeeId, a.campId, a.roomId, a.bed, a.checkIn || '', checkOut, JSON.stringify({ checkIn: a.checkIn || '', checkOut, exitForm: exitFormPath })]);
    await query('DELETE FROM bed_allocations WHERE id = ?', [req.params.id]);
    await notify(a.employeeId, 'info', 'Accommodation exit recorded', `Your accommodation stay has been closed with an exit date of ${checkOut}. This does not change your job status.`);
    await notifyAdmins(`Accommodation exit \u2014 ${exEmp.name || ''}`, `${exEmp.name || ''} (${exEmp.empId || ''}) checked out of accommodation on ${checkOut} (recorded by ${req.user.name}).`, ['manage_accommodation', 'assign_beds']);
    await audit(req.user.name, `Accommodation exit: emp ${a.employeeId} checked out ${checkOut}`);
    res.json({ message: 'Exit recorded' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Past accommodation stays (check-in/check-out records)
app.get('/api/accommodation/history', auth, async (req, res) => {
  try {
    const camps = (await query('SELECT * FROM camps', [])).rows.map(rowToCamp);
    const rooms = (await query('SELECT * FROM acc_rooms', [])).rows.map(rowToRoom);
    const emps  = (await query('SELECT * FROM employees', [])).rows.map(rowToEmp);
    let rows = (await query('SELECT * FROM acc_history', [])).rows.map(h => ({
      id: h.id, employeeId: h.employeeid ?? h.employeeId, campId: h.campid ?? h.campId,
      roomId: h.roomid ?? h.roomId, bed: String(h.bed ?? ''), checkIn: h.checkin ?? h.checkIn, checkOut: h.checkout ?? h.checkOut
    }));
    if (req.user.role === 'employee') rows = rows.filter(h => h.employeeId === req.user.employeeId);
    else if (req.query.employeeId)    rows = rows.filter(h => h.employeeId === req.query.employeeId);
    rows.sort((a, b) => String(b.checkOut || '').localeCompare(String(a.checkOut || '')));
    res.json(rows.map(h => {
      const c = camps.find(x => x.id === h.campId) || {};
      const rm = rooms.find(x => x.id === h.roomId) || {};
      const e = emps.find(x => x.id === h.employeeId) || {};
      return Object.assign({}, h, { campName: c.name || '', roomNo: rm.roomNo || '', empName: e.name || '', empCode: e.empId || '' });
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── Fleet Assets: bikes, SIM cards, and custom assets ───── */
function canManageAssets(req) { return isSuperAdmin(req) || hasPermission(req, 'manage_assets'); }
function canAssignAssets(req) { return canManageAssets(req) || hasPermission(req, 'assign_assets'); }
function canImportAssets(req) { return canManageAssets(req) || hasPermission(req, 'import_assets'); }

// days until a YYYY-MM-DD date (negative = already expired); null if no date
function daysUntil(d) {
  if (!d) return null;
  const t = new Date(String(d).split('T')[0]);
  if (isNaN(t)) return null;
  return Math.ceil((t - new Date(today())) / 86400000);
}

function enrichAsset(a, emps) {
  const e = emps.find(x => x.id === a.assignedTo) || {};
  return Object.assign({}, a, { holderName: e.name || '', holderCode: e.empId || '' });
}

app.get('/api/assets', auth, async (req, res) => {
  try {
    const emps = (await query('SELECT * FROM employees', [])).rows.map(rowToEmp);
    let assets = (await query('SELECT * FROM assets', [])).rows.map(rowToAsset);
    if (req.user.role === 'employee') assets = assets.filter(a => a.assignedTo === req.user.employeeId);
    if (req.query.type)       assets = assets.filter(a => a.type === req.query.type);
    if (req.query.status)     assets = assets.filter(a => a.status === req.query.status);
    if (req.query.assignedTo) assets = assets.filter(a => a.assignedTo === req.query.assignedTo);
    assets.sort((a, b) => String(a.type).localeCompare(String(b.type)) || String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
    res.json(assets.map(a => enrichAsset(a, emps)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dashboard counts + registration/insurance expiry alerts
app.get('/api/assets/summary', auth, async (req, res) => {
  try {
    const emps   = (await query('SELECT * FROM employees', [])).rows.map(rowToEmp);
    const assets = (await query('SELECT * FROM assets', [])).rows.map(rowToAsset);
    const byType = t => assets.filter(a => a.type === t);
    const countStatus = (arr, s) => arr.filter(a => a.status === s).length;
    const bikes = byType('bike'), sims = byType('sim'), other = byType('other');

    const within = (d, lo, hi) => { const n = daysUntil(d); return n != null && n >= lo && n <= hi; };
    const expSoon = (field) => bikes
      .filter(b => { const n = daysUntil(b[field]); return n != null && n <= 30; })
      .map(b => ({ id: b.id, code: b.code, name: b.name, plateNo: b.plateNo || '', date: b[field] || '', days: daysUntil(b[field]),
                   holder: (emps.find(e => e.id === b.assignedTo) || {}).name || '' }))
      .sort((a, b) => a.days - b.days);

    res.json({
      bike: {
        total: bikes.length,
        assigned: countStatus(bikes, 'Assigned'),
        available: countStatus(bikes, 'Available'),
        maintenance: countStatus(bikes, 'Maintenance'),
        accident: countStatus(bikes, 'Accident'),
        inactive: countStatus(bikes, 'Inactive'),
        registrationExpiring: bikes.filter(b => { const n = daysUntil(b.registrationExpiry); return n != null && n <= 30; }).length,
        insuranceExpiring: bikes.filter(b => { const n = daysUntil(b.insuranceExpiry); return n != null && n <= 30; }).length,
      },
      sim: {
        total: sims.length,
        assigned: countStatus(sims, 'Assigned'),
        available: countStatus(sims, 'Available'),
        blocked: countStatus(sims, 'Blocked'),
        lost: countStatus(sims, 'Lost'),
        inactive: countStatus(sims, 'Inactive'),
      },
      other: { total: other.length, assigned: countStatus(other, 'Assigned'), available: countStatus(other, 'Available') },
      registrationAlerts: expSoon('registrationExpiry'),
      insuranceAlerts: expSoon('insuranceExpiry'),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assets', auth, async (req, res) => {
  try {
    if (!canManageAssets(req)) return res.status(403).json({ error: 'No permission' });
    const type = ['bike', 'sim', 'other'].includes(req.body.type) ? req.body.type : 'other';
    const code = String(req.body.code || '').trim();
    if (!code) return res.status(400).json({ error: (type === 'bike' ? 'Bike ID' : type === 'sim' ? 'SIM ID' : 'Asset ID') + ' is required' });
    const dup = await query('SELECT id FROM assets WHERE type = ? AND LOWER(code) = ?', [type, code.toLowerCase()]);
    if (dup.rows.length) return res.status(409).json({ error: 'An asset with that ID already exists' });
    const status = String(req.body.status || 'Available').trim() || 'Available';
    const name = String(req.body.name || '').trim();
    const data = (req.body.data && typeof req.body.data === 'object') ? req.body.data : {};
    data.createdAt = today();
    const id = uid('AS');
    await query('INSERT INTO assets (id, type, code, name, status, assignedTo, assignedDate, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, type, code, name, status, null, null, JSON.stringify(data)]);
    await audit(req.user.name, `Asset added: ${type} ${code}`);
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/assets/:id', auth, async (req, res) => {
  try {
    const isMgr = canManageAssets(req);
    if (!isMgr && !canAssignAssets(req)) return res.status(403).json({ error: 'No permission' });
    const r = await query('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const cur = rowToAsset(r.rows[0]);
    // assign-only admins may change status, but not master fields (code/name/extra data)
    const code = (isMgr && req.body.code != null) ? String(req.body.code).trim() : cur.code;
    const name = (isMgr && req.body.name != null) ? String(req.body.name).trim() : cur.name;
    const status = req.body.status != null ? String(req.body.status).trim() : cur.status;
    const base = J(r.rows[0].data, {});
    const incoming = (isMgr && req.body.data && typeof req.body.data === 'object') ? req.body.data : {};
    const data = Object.assign({}, base, incoming);
    await query('UPDATE assets SET code = ?, name = ?, status = ?, data = ? WHERE id = ?',
      [code, name, status, JSON.stringify(data), req.params.id]);
    await audit(req.user.name, `Asset updated: ${cur.type} ${code}`);
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assets/:id/assign', auth, async (req, res) => {
  try {
    if (!canAssignAssets(req)) return res.status(403).json({ error: 'No permission' });
    const employeeId = req.body.employeeId;
    if (!employeeId) return res.status(400).json({ error: 'Employee is required' });
    const r = await query('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const emp = await query('SELECT id FROM employees WHERE id = ?', [employeeId]);
    if (!emp.rows.length) return res.status(404).json({ error: 'Employee not found' });
    const assignedDate = req.body.assignedDate || today();
    await query('UPDATE assets SET assignedTo = ?, assignedDate = ?, status = ? WHERE id = ?',
      [employeeId, assignedDate, 'Assigned', req.params.id]);
    const a = rowToAsset(r.rows[0]);
    const asLabel = a.type === 'sim' ? 'SIM' : a.type === 'bike' ? 'Bike' : 'Asset';
    const asEmpRow = (await query('SELECT * FROM employees WHERE id = ?', [employeeId])).rows[0];
    const asEmp = asEmpRow ? rowToEmp(asEmpRow) : {};
    await notify(employeeId, 'approved', 'Asset assigned', `${asLabel} ${a.code}${a.name ? ' (' + a.name + ')' : ''} has been assigned to you.`);
    await notifyAdmins(`Asset assigned \u2014 ${a.code}`, `${asLabel} ${a.code} was assigned to ${asEmp.name || ''} (${asEmp.empId || ''}) by ${req.user.name}.`, ['manage_assets', 'assign_assets']);
    await audit(req.user.name, `Asset ${a.code} assigned to emp ${employeeId}`);
    res.json({ message: 'Assigned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assets/:id/unassign', auth, upload.single('file'), async (req, res) => {
  try {
    if (!canAssignAssets(req)) return res.status(403).json({ error: 'No permission' });
    const r = await query('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const a = rowToAsset(r.rows[0]);
    const isBike = a.type === 'bike';
    const returnDate = req.body.returnDate || today();
    if (isBike && !req.file) return res.status(400).json({ error: 'A signed return form must be attached before a bike return can be recorded.' });
    const status = String(req.body.status || 'Available').trim() || 'Available';
    let formPath = '';
    if (req.file) {
      const prevId = a.assignedTo;
      const empNo = prevId ? await empNoOf(prevId) : 'unassigned';
      formPath = placeFile(req.file, 'bike', empNo);
      if (prevId) await addDoc(prevId, `${isBike ? 'Bike' : 'Asset'} return form \u2014 ${a.code}`, req.file.mimetype, req.file.size, formPath, req.user.name);
    }
    const base = J(r.rows[0].data, {});
    base.lastReturnDate = returnDate;
    if (formPath) base.lastReturnForm = formPath;
    await query('UPDATE assets SET assignedTo = ?, assignedDate = ?, status = ?, data = ? WHERE id = ?',
      [null, null, status, JSON.stringify(base), req.params.id]);
    await audit(req.user.name, `Asset ${a.code} returned on ${returnDate}`);
    res.json({ message: 'Returned', returnDate });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/assets/:id', auth, async (req, res) => {
  try {
    if (!canManageAssets(req)) return res.status(403).json({ error: 'No permission' });
    await query('DELETE FROM assets WHERE id = ?', [req.params.id]);
    await audit(req.user.name, 'Asset deleted');
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk import bikes / SIMs / other assets from a spreadsheet (mass create + update).
app.post('/api/assets/bulk/import', auth, async (req, res) => {
  try {
    if (!canImportAssets(req)) return res.status(403).json({ error: 'No permission' });
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const KNOWN = { bike: ['plateNo', 'chassisNo', 'engineNo', 'brand', 'model', 'registrationExpiry', 'insuranceExpiry'], sim: ['number', 'provider', 'puk', 'remarks'], other: [] };
    const empRows = (await query('SELECT id, empId FROM employees', [])).rows;
    const empMap = {}; empRows.forEach(e => { const eid = e.empid ?? e.empId; if (eid) empMap[String(eid).trim().toUpperCase()] = e.id; });
    const cleanDate = v => (/^\d{4}-\d{1,2}-\d{1,2}/.test(String(v || '')) ? String(v).slice(0, 10) : '');
    let added = 0, updated = 0, skipped = 0; const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const type = ['bike', 'sim', 'other'].includes(row.type) ? row.type : 'other';
      const code = String(row.code || '').trim();
      if (!code) { skipped++; if (errors.length < 50) errors.push(`Row ${i + 1}: missing asset ID — skipped`); continue; }
      const name = String(row.name || '').trim();
      let statusIn = String(row.status || '').trim();
      const data = {};
      KNOWN[type].forEach(k => { if (row[k] != null && String(row[k]).trim() !== '') data[k] = String(row[k]).trim(); });
      // optional assignment to an employee (by Employee ID, e.g. SN0002)
      let assignedTo, assignedDate;
      const assignRaw = String(row.assignTo || '').trim();
      if (assignRaw) {
        const aid = empMap[assignRaw.toUpperCase()];
        if (aid) { assignedTo = aid; assignedDate = cleanDate(row.assignedDate) || today(); statusIn = 'Assigned'; }
        else if (errors.length < 50) errors.push(`Row ${i + 1} (${code}): employee "${assignRaw}" not found — imported but left unassigned`);
      }
      const existing = await query('SELECT * FROM assets WHERE type = ? AND LOWER(code) = ?', [type, code.toLowerCase()]);
      if (existing.rows.length) {
        const cur = rowToAsset(existing.rows[0]);
        const merged = Object.assign(J(existing.rows[0].data, {}), data);
        const newAssignedTo   = assignedTo !== undefined ? assignedTo : cur.assignedTo;
        const newAssignedDate = assignedTo !== undefined ? assignedDate : cur.assignedDate;
        await query('UPDATE assets SET name = ?, status = ?, assignedTo = ?, assignedDate = ?, data = ? WHERE id = ?', [name || cur.name, statusIn || cur.status, newAssignedTo ?? null, newAssignedDate ?? null, JSON.stringify(merged), cur.id]);
        updated++;
      } else {
        data.createdAt = today();
        await query('INSERT INTO assets (id, type, code, name, status, assignedTo, assignedDate, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [uid('AS'), type, code, name, statusIn || 'Available', assignedTo ?? null, assignedDate ?? null, JSON.stringify(data)]);
        added++;
      }
    }
    await audit(req.user.name, `Asset bulk import: +${added}, ~${updated}, skipped ${skipped}`);
    res.json({ added, updated, skipped, total: added + updated, errors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, engine, timestamp: now() }));

init().then(async () => { const email = (process.env.SUPER_ADMIN_EMAIL || 'mauradhi@noon.com').toLowerCase(); const r = await query('SELECT id FROM admins WHERE isSuperAdmin = 1', []); if (!r.rows.length) { await query('INSERT INTO admins (id, email, name, isSuperAdmin, permissions, createdAt) VALUES (?, ?, ?, 1, ?, ?)', ['admin-001', email, 'Super Admin', '[]', today()]); console.log(`✓ Super admin created: ${email}`); } app.listen(PORT, () => console.log(`✓ HRMS server running on port ${PORT}`)); }).catch(e => { console.error('✗ Startup failed:', e.message); process.exit(1); });

module.exports = app;
