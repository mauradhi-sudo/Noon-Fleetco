// Noon Fleet HRMS — production API server.
// Express + PostgreSQL (or built-in SQLite for local/dev) + JWT + email OTP + file uploads + Drive.
// Enhanced: Dynamic field management, admin can edit any field, comprehensive onboarding fields
'use strict';
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cron = require('node-cron');
const { query, init, engine, DATA_DIR } = require('./db');
const mailer = require('./mailer');
const gdrive = require('./drive');
const { DEFAULT_FIELDS, CORE_FIELDS, validateFieldValue } = require('./fields');

const app = express();
const PORT = +(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const p = path.join(DATA_DIR, '.jwt_secret');
  if (!fs.existsSync(p)) fs.writeFileSync(p, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(p, 'utf8');
})();

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/[^\w.\-]/g, '_')),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

/* ───────────────────────── helpers ───────────────────────── */
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const uid = (p) => p + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const J = (v, fb) => { try { return JSON.parse(v); } catch { return fb; } };

function rowToEmp(r) { return Object.assign(J(r.data, {}), { id: r.id, empId: r.empid ?? r.empId, passportNo: r.passportno ?? r.passportNo, name: r.name, email: r.email, status: r.status }); }
function rowToLeave(r) { return Object.assign(J(r.data, {}), { id: r.id, employeeId: r.employeeid ?? r.employeeId, status: r.status }); }
function rowToPs(r) { return Object.assign(J(r.data, {}), { id: r.id, employeeId: r.employeeid ?? r.employeeId, month: r.month }); }
function rowToNotif(r) { return Object.assign(J(r.data, {}), { id: r.id, employeeId: r.employeeid ?? r.employeeId, isRead: +(r.isread ?? r.isRead) }); }
function rowToAdmin(r) { return { id: r.id, email: r.email, name: r.name, isSuperAdmin: +(r.issuperadmin ?? r.isSuperAdmin), permissions: J(r.permissions, []), createdAt: r.createdat ?? r.createdAt }; }

// Get field schema from config or use defaults
async function getFieldSchema() {
  const { rows } = await query("SELECT v FROM config WHERE k = 'field_schema'", []);
  return rows.length ? J(rows[0].v, DEFAULT_FIELDS) : DEFAULT_FIELDS;
}

async function saveFieldSchema(schema) {
  const json = JSON.stringify(schema);
  await query("INSERT INTO config (k, v) VALUES ('field_schema', ?) ON CONFLICT (k) DO UPDATE SET v = ?", [json, json]);
}

async function audit(user, action) {
  await query('INSERT INTO audit (t, usr, action) VALUES (?, ?, ?)', [new Date().toLocaleString(), user || 'System', action]);
}

async function notify(employeeId, type, title, message) {
  await query('INSERT INTO notifications (id, employeeId, isRead, data) VALUES (?, ?, 0, ?)',
    [uid('N'), employeeId, JSON.stringify({ type, title, message, createdAt: today() })]);
}

function token(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' }); }

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'Not signed in' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired — sign in again' }); }
}

function can(req, perm) {
  const u = req.user;
  return u.role === 'admin' && (u.isSuperAdmin || (u.permissions || []).includes(perm));
}
function needPerm(perm) {
  return (req, res, next) => can(req, perm) ? next() : res.status(403).json({ error: 'No permission: ' + perm });
}
function adminOnly(req, res, next) {
  return req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' });
}
function superOnly(req, res, next) {
  return req.user.role === 'admin' && req.user.isSuperAdmin ? next() : res.status(403).json({ error: 'Main admin only' });
}

/* ───────────────────────── OTP auth ───────────────────────── */
async function issueOtp(target) {
  const code = String(crypto.randomInt(100000, 999999));
  await query('DELETE FROM otps WHERE target = ?', [target]);
  await query('INSERT INTO otps (target, code, expires) VALUES (?, ?, ?)', [target, code, Date.now() + 10 * 60 * 1000]);
  return code;
}
async function checkOtp(target, code) {
  const { rows } = await query('SELECT * FROM otps WHERE target = ?', [target]);
  if (!rows.length) return false;
  if (rows[0].expires < Date.now()) return false;
  if (rows[0].code !== String(code)) return false;
  await query('DELETE FROM otps WHERE target = ?', [target]);
  return true;
}

app.post('/api/auth/admin/request-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { rows } = await query('SELECT * FROM admins WHERE LOWER(email) = ?', [email]);
  if (!rows.length) return res.status(404).json({ error: 'No admin account found for that email address' });
  const code = await issueOtp('admin:' + email);
  try {
    const sent = await mailer.sendOtp(email, code);
    res.json({ message: 'OTP sent to ' + email, ...(sent && sent.dev ? { _devOtp: code } : {}) });
  } catch (e) {
    res.json({ message: 'OTP sent to ' + email, _devOtp: code });
  }
});

app.post('/api/auth/admin/verify-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!await checkOtp('admin:' + email, req.body.otp)) return res.status(401).json({ error: 'Incorrect or expired code' });
  const { rows } = await query('SELECT * FROM admins WHERE LOWER(email) = ?', [email]);
  if (!rows.length) return res.status(404).json({ error: 'Admin not found' });
  const a = rowToAdmin(rows[0]);
  await audit(a.name, 'Admin signed in: ' + a.email);
  res.json({ token: token({ role: 'admin', adminId: a.id, name: a.name, email: a.email, isSuperAdmin: a.isSuperAdmin, permissions: a.permissions }), role: 'admin', name: a.name, email: a.email, isSuperAdmin: a.isSuperAdmin, permissions: a.permissions });
});

app.post('/api/auth/employee/login', async (req, res) => {
  const empId = String(req.body.empId || '').trim().toUpperCase();
  const pass = String(req.body.passportNo || '').trim();
  const { rows } = await query('SELECT * FROM employees WHERE UPPER(empId) = ?', [empId]);
  if (!rows.length || (rows[0].passportno ?? rows[0].passportNo) !== pass) return res.status(401).json({ error: 'Invalid Employee ID or passport number' });
  if (rows[0].status === 'Inactive') return res.status(403).json({ error: 'Account inactive. Contact HR.' });
  const e = rowToEmp(rows[0]);
  if (!e.email) return res.status(400).json({ error: 'No registered email on your profile — contact HR to add one' });
  const code = await issueOtp('emp:' + e.empId);
  try {
    const sent = await mailer.sendOtp(e.email, code);
    const masked = e.email.replace(/^(..).*(@.*)$/, '$1•••$2');
    res.json({ otpRequired: true, message: 'OTP sent to ' + masked, email: masked, ...(sent && sent.dev ? { _devOtp: code } : {}) });
  } catch (err) {
    const masked = e.email.replace(/^(..).*(@.*)$/, '$1•••$2');
    res.json({ otpRequired: true, message: 'OTP sent to ' + masked, email: masked, _devOtp: code });
  }
});

app.post('/api/auth/employee/verify-otp', async (req, res) => {
  const empId = String(req.body.empId || '').trim().toUpperCase();
  if (!await checkOtp('emp:' + empId, req.body.otp)) return res.status(401).json({ error: 'Incorrect or expired code' });
  const { rows } = await query('SELECT * FROM employees WHERE UPPER(empId) = ?', [empId]);
  if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
  const e = rowToEmp(rows[0]);
  await audit(e.name, 'Employee signed in: ' + e.empId);
  res.json({ token: token({ role: 'employee', employeeId: e.id, empId: e.empId, name: e.firstName || e.name }), role: 'employee', empId: e.empId, name: e.firstName || e.name });
});

/* ───────────────────────── field management ───────────────────────── */
app.get('/api/fields/schema', auth, adminOnly, async (req, res) => {
  const schema = await getFieldSchema();
  res.json(schema);
});

app.get('/api/fields/sections', auth, adminOnly, async (req, res) => {
  const schema = await getFieldSchema();
  const sections = [...new Set(Object.values(schema).map(f => f.section))];
  res.json(sections.sort());
});

app.post('/api/fields', auth, superOnly, async (req, res) => {
  const { fieldName, label, type, section, options, required, placeholder } = req.body;
  if (!fieldName || !label || !type) return res.status(400).json({ error: 'fieldName, label, type required' });
  if (CORE_FIELDS.includes(fieldName)) return res.status(403).json({ error: 'Cannot add core field' });

  const schema = await getFieldSchema();
  if (schema[fieldName]) return res.status(409).json({ error: 'Field already exists' });

  schema[fieldName] = {
    label, type, section: section || 'Other', required: !!required, readonly: false,
    ...(placeholder && { placeholder }),
    ...(options && { options }),
  };
  await saveFieldSchema(schema);
  await audit(req.user.name, `Added field: ${fieldName} (${label})`);
  res.json({ message: 'Field added', fieldName });
});

app.put('/api/fields/:fieldName', auth, superOnly, async (req, res) => {
  const { fieldName } = req.params;
  const { label, type, section, options, required, placeholder } = req.body;
  if (CORE_FIELDS.includes(fieldName)) return res.status(403).json({ error: 'Cannot modify core field properties' });

  const schema = await getFieldSchema();
  if (!schema[fieldName]) return res.status(404).json({ error: 'Field not found' });

  const updated = { ...schema[fieldName] };
  if (label) updated.label = label;
  if (type) updated.type = type;
  if (section) updated.section = section;
  if (options) updated.options = options;
  if (required !== undefined) updated.required = !!required;
  if (placeholder) updated.placeholder = placeholder;

  schema[fieldName] = updated;
  await saveFieldSchema(schema);
  await audit(req.user.name, `Updated field: ${fieldName}`);
  res.json({ message: 'Field updated' });
});

app.delete('/api/fields/:fieldName', auth, superOnly, async (req, res) => {
  const { fieldName } = req.params;
  if (CORE_FIELDS.includes(fieldName)) return res.status(403).json({ error: 'Cannot delete core field' });

  const schema = await getFieldSchema();
  if (!schema[fieldName]) return res.status(404).json({ error: 'Field not found' });

  delete schema[fieldName];
  await saveFieldSchema(schema);
  await audit(req.user.name, `Deleted field: ${fieldName}`);
  res.json({ message: 'Field deleted' });
});

/* ───────────────────────── employees ───────────────────────── */
app.get('/api/employees', auth, async (req, res) => {
  if (req.user.role === 'employee') {
    const { rows } = await query('SELECT * FROM employees WHERE id = ?', [req.user.employeeId]);
    return res.json(rows.map(rowToEmp));
  }
  if (!can(req, 'view_employees')) return res.status(403).json({ error: 'No permission' });
  const { rows } = await query('SELECT * FROM employees ORDER BY empId', []);
  res.json(rows.map(rowToEmp));
});

app.get('/api/employees/:id', auth, async (req, res) => {
  const id = req.params.id;
  if (req.user.role === 'employee' && req.user.employeeId !== id && req.user.empId !== id.toUpperCase())
    return res.status(403).json({ error: 'Not allowed' });
  const { rows } = await query('SELECT * FROM employees WHERE id = ? OR UPPER(empId) = ?', [id, id.toUpperCase()]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rowToEmp(rows[0]));
});

async function upsertEmployee(body, existingId) {
  const id = existingId || uid('E');
  const { empId, passportNo, name, email, status, ...rest } = body;

  if (existingId) {
    const { rows } = await query('SELECT * FROM employees WHERE id = ?', [existingId]);
    const cur = rows.length ? rowToEmp(rows[0]) : {};
    const merged = Object.assign({}, cur, body);
    await query('UPDATE employees SET empId = ?, passportNo = ?, name = ?, email = ?, status = ?, data = ? WHERE id = ?',
      [merged.empId, merged.passportNo || '', merged.name || '', merged.email || '', merged.status || 'Active', JSON.stringify(merged), existingId]);
    return merged;
  }

  const full = Object.assign({ id, status: 'Active' }, body);
  await query('INSERT INTO employees (id, empId, passportNo, name, email, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, empId, passportNo || '', name || '', email || '', full.status, JSON.stringify(full)]);
  return full;
}

app.post('/api/employees', auth, needPerm('add_employees'), async (req, res) => {
  if (!req.body.empId) return res.status(400).json({ error: 'Employee ID required' });
  const dup = await query('SELECT id FROM employees WHERE UPPER(empId) = ?', [String(req.body.empId).toUpperCase()]);
  if (dup.rows.length) return res.status(409).json({ error: 'Employee ID already exists' });
  const e = await upsertEmployee(req.body);
  await audit(req.user.name, `Added employee ${e.empId} — ${e.name}`);
  res.json({ id: e.id, message: 'Created' });
});

// Admin can edit any field without permission check (super admin feature)
app.put('/api/employees/:id', auth, async (req, res) => {
  if (req.user.role === 'admin' && !req.user.isSuperAdmin && !can(req, 'edit_employees'))
    return res.status(403).json({ error: 'No permission' });

  await upsertEmployee(req.body, req.params.id);
  await audit(req.user.name, `Edited employee ${req.params.id}`);
  res.json({ message: 'Updated' });
});

// Admins can edit any single field
app.patch('/api/employees/:id/field/:fieldName', auth, async (req, res) => {
  if (req.user.role === 'admin' && !req.user.isSuperAdmin && !can(req, 'edit_employees'))
    return res.status(403).json({ error: 'No permission' });

  const { rows } = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });

  const e = rowToEmp(rows[0]);
  e[req.params.fieldName] = req.body.value;

  await query('UPDATE employees SET data = ? WHERE id = ?', [JSON.stringify(e), req.params.id]);
  await audit(req.user.name, `Updated ${req.params.fieldName} for employee ${req.params.id}`);
  res.json({ message: 'Field updated' });
});

app.patch('/api/employees/:id/status', auth, needPerm('edit_employees'), async (req, res) => {
  const { rows } = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const e = rowToEmp(rows[0]); e.status = req.body.status;
  await query('UPDATE employees SET status = ?, data = ? WHERE id = ?', [e.status, JSON.stringify(e), e.id]);
  await audit(req.user.name, `Employee ${e.empId} set to ${e.status}`);
  res.json({ message: 'ok' });
});

app.delete('/api/employees/:id', auth, superOnly, async (req, res) => {
  const { rows } = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const e = rowToEmp(rows[0]);
  for (const t of ['leaves', 'payslips', 'documents', 'notifications'])
    await query(`DELETE FROM ${t} WHERE employeeId = ?`, [e.id]);
  await query('DELETE FROM employees WHERE id = ?', [e.id]);
  await audit(req.user.name, `PERMANENTLY DELETED employee ${e.name} (${e.empId}) and all related data`);
  res.json({ message: 'Employee and all related data permanently deleted', empId: e.empId, name: e.name });
});

app.post('/api/employees/bulk/import', auth, needPerm('import_employees'), async (req, res) => {
  const rows = req.body.rows || [];
  let imported = 0, updated = 0;
  for (const r of rows) {
    if (!r.empId) continue;
    const ex = await query('SELECT id FROM employees WHERE UPPER(empId) = ?', [String(r.empId).toUpperCase()]);
    if (ex.rows.length) { await upsertEmployee(r, ex.rows[0].id); updated++; }
    else { await upsertEmployee(r); imported++; }
  }
  await audit(req.user.name, `Bulk import applied: ${imported} new, ${updated} updated`);
  res.json({ imported, updated, skipped: rows.length - imported - updated });
});

/* ───────────────────────── leaves ───────────────────────── */
app.get('/api/leaves', auth, async (req, res) => {
  if (req.user.role === 'employee') {
    const { rows } = await query('SELECT * FROM leaves WHERE employeeId = ?', [req.user.employeeId]);
    return res.json(rows.map(rowToLeave));
  }
  if (!can(req, 'view_leaves')) return res.status(403).json({ error: 'No permission' });
  const { rows } = await query('SELECT * FROM leaves', []);
  res.json(rows.map(rowToLeave).sort((a, b) => (b.appliedOn || '').localeCompare(a.appliedOn || '')));
});

app.post('/api/leaves', auth, async (req, res) => {
  const employeeId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId;
  const { rows } = await query('SELECT * FROM employees WHERE id = ?', [employeeId]);
  if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
  const e = rowToEmp(rows[0]);
  if (e.joiningDate && (Date.now() - new Date(e.joiningDate)) / 864e5 < 182)
    return res.status(403).json({ error: 'Leave applications are locked during the 6-month probation period' });
  const id = uid('L');
  const lv = {
    type: req.body.type, fromDate: req.body.fromDate, toDate: req.body.toDate,
    days: +req.body.days || 1, reason: req.body.reason || '',
    certificate: !!req.body.certificate, certificateName: req.body.certificateName || '',
    empName: e.name, empId: e.empId, appliedOn: today(),
  };
  await query('INSERT INTO leaves (id, employeeId, status, data) VALUES (?, ?, ?, ?)', [id, e.id, 'Pending', JSON.stringify(lv)]);
  await notify(e.id, 'pending', 'Leave submitted', `Your ${lv.type} (${lv.days} day${lv.days > 1 ? 's' : ''}) is pending approval.`);
  await audit(e.name, `Applied for ${lv.type} (${lv.days}d)`);
  mailer.sendNotice(process.env.HR_NOTIFY_EMAIL, `Leave request: ${e.name}`, `${e.empId} ${e.name} applied for ${lv.type} ${lv.fromDate} → ${lv.toDate} (${lv.days}d).\nReason: ${lv.reason}`);
  res.json({ id, emailSentTo: e.email });
});

app.patch('/api/leaves/:id/decide', auth, needPerm('approve_leaves'), async (req, res) => {
  const { rows } = await query('SELECT * FROM leaves WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const lv = rowToLeave(rows[0]);
  const newSt = req.body.decision === 'Approved' ? 'Approved' : 'Rejected';
  lv.status = newSt; lv.decidedAt = today(); lv.decidedBy = req.user.name;
  await query('UPDATE leaves SET status = ?, data = ? WHERE id = ?', [newSt, JSON.stringify(lv), lv.id]);
  await notify(lv.employeeId, newSt === 'Approved' ? 'approved' : 'rejected', 'Leave ' + newSt.toLowerCase(),
    `Your ${lv.type} (${lv.days} day${lv.days > 1 ? 's' : ''}) has been ${newSt.toLowerCase()}.`);
  await audit(req.user.name, `Leave ${lv.id} (${lv.empId}): ${newSt}`);
  const emp = await query('SELECT email FROM employees WHERE id = ?', [lv.employeeId]);
  if (emp.rows.length) mailer.sendNotice(emp.rows[0].email, `Your leave was ${newSt.toLowerCase()}`, `Dear ${lv.empName},\nYour ${lv.type} (${lv.fromDate} → ${lv.toDate}) status: ${newSt}.\n\nNoon Fleet HR Team`);
  res.json({ message: newSt, emailPreview: { body: `Dear ${lv.empName},\nYour ${lv.type} status: ${newSt}.\n\nRegards,\nNoon Fleet HR Team` } });
});

/* ───────────────────────── payslips ───────────────────────── */
app.get('/api/payslips', auth, async (req, res) => {
  if (req.user.role === 'employee') {
    const { rows } = await query('SELECT * FROM payslips WHERE employeeId = ?', [req.user.employeeId]);
    return res.json(rows.map(rowToPs));
  }
  if (!can(req, 'view_payroll')) return res.status(403).json({ error: 'No permission' });
  const { rows } = await query('SELECT * FROM payslips', []);
  res.json(rows.map(rowToPs));
});

app.post('/api/payslips/bulk', auth, needPerm('upload_payroll'), async (req, res) => {
  const { rows: incoming = [], month } = req.body;
  let published = 0;
  for (const r of incoming) {
    const e = await query('SELECT * FROM employees WHERE UPPER(empId) = ? OR LOWER(email) = ?',
      [String(r['Employee ID'] || '').toUpperCase(), String(r['Email ID'] || '').toLowerCase()]);
    if (!e.rows.length) continue;
    const emp = rowToEmp(e.rows[0]);
    await query('INSERT INTO payslips (id, employeeId, month, data) VALUES (?, ?, ?, ?)',
      [uid('PS'), emp.id, month || 'Unknown', JSON.stringify({ empName: emp.name, empId: emp.empId, data: r })]);
    await notify(emp.id, 'approved', 'Payslip available - ' + (month || ''),
      `Your payslip for ${month || 'this month'} is ready. Net Pay: AED ${r['Employee Net Pay'] || '0'}.`);
    published++;
  }
  await audit(req.user.name, `Published ${published} payslips for ${month}`);
  res.json({ published, skipped: incoming.length - published });
});

/* ───────────────────────── documents ───────────────────────── */
app.get('/api/documents', auth, async (req, res) => {
  if (req.user.role === 'employee') {
    const { rows } = await query('SELECT * FROM documents WHERE employeeId = ?', [req.user.employeeId]);
    return res.json(rows.map(d => docOut(d)));
  }
  if (!can(req, 'view_documents')) return res.status(403).json({ error: 'No permission' });
  const { rows } = await query('SELECT * FROM documents', []);
  const emps = await query('SELECT id, name FROM employees', []);
  const nameById = Object.fromEntries(emps.rows.map(e => [e.id, e.name]));
  res.json(rows.map(d => Object.assign(docOut(d), { empName: nameById[d.employeeid ?? d.employeeId] || '' })));
});
function docOut(d) {
  return { id: d.id, employeeId: d.employeeid ?? d.employeeId, name: d.name, type: d.type, size: d.size, filename: d.filename, driveLink: d.drivelink ?? d.driveLink, uploadedAt: d.uploadedat ?? d.uploadedAt, uploader: d.uploader };
}

app.post('/api/documents', auth, upload.single('file'), async (req, res) => {
  const employeeId = req.user.role === 'employee' ? req.user.employeeId : (req.body.employeeId || '');
  if (req.user.role === 'admin' && !can(req, 'upload_documents')) return res.status(403).json({ error: 'No permission' });
  const f = req.file;
  const id = uid('D');
  let driveLink = null;
  if (f && gdrive.configured()) {
    const empRow = await query('SELECT empId FROM employees WHERE id = ?', [employeeId]);
    const prefix = empRow.rows.length ? (empRow.rows[0].empid ?? empRow.rows[0].empId) : 'unknown';
    driveLink = await gdrive.uploadFile(f.originalname, f.mimetype, fs.readFileSync(f.path), prefix);
  }
  await query('INSERT INTO documents (id, employeeId, name, type, size, filename, driveLink, uploadedAt, uploader) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, employeeId, req.body.name || (f ? f.originalname : 'Document'), req.body.type || 'Other',
      f ? (f.size / 1048576).toFixed(2) + ' MB' : '—', f ? path.basename(f.path) : '', driveLink, today(), req.user.name]);
  await audit(req.user.name, `Uploaded document "${req.body.name || (f && f.originalname) || 'Document'}"${driveLink ? ' (+Drive)' : ''}`);
  res.json({ id, message: 'Uploaded', driveLink });
});

app.delete('/api/documents/:id', auth, needPerm('upload_documents'), async (req, res) => {
  const { rows } = await query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
  if (rows.length && rows[0].filename) { try { fs.unlinkSync(path.join(UPLOAD_DIR, rows[0].filename)); } catch {} }
  await query('DELETE FROM documents WHERE id = ?', [req.params.id]);
  await audit(req.user.name, 'Deleted document ' + req.params.id);
  res.json({ message: 'Deleted' });
});

/* ───────────────────────── notifications ───────────────────────── */
app.get('/api/notifications', auth, async (req, res) => {
  const id = req.user.role === 'employee' ? req.user.employeeId : '__none__';
  const { rows } = await query('SELECT * FROM notifications WHERE employeeId = ?', [id]);
  res.json(rows.map(rowToNotif).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
});
app.patch('/api/notifications/read-all', auth, async (req, res) => {
  if (req.user.role === 'employee')
    await query('UPDATE notifications SET isRead = 1 WHERE employeeId = ?', [req.user.employeeId]);
  res.json({ message: 'ok' });
});

/* ───────────────────────── admins ───────────────────────── */
app.get('/api/admins', auth, superOnly, async (req, res) => {
  const { rows } = await query('SELECT * FROM admins ORDER BY createdAt', []);
  res.json(rows.map(rowToAdmin));
});
app.post('/api/admins', auth, superOnly, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !req.body.name) return res.status(400).json({ error: 'Name and email required' });
  const id = uid('ADM');
  await query('INSERT INTO admins (id, email, name, isSuperAdmin, permissions, createdAt) VALUES (?, ?, ?, 0, ?, ?)',
    [id, email, req.body.name, JSON.stringify(req.body.permissions || []), today()]);
  await audit(req.user.name, `Created limited admin ${email} [${(req.body.permissions || []).join(', ') || 'view-only'}]`);
  mailer.sendNotice(email, 'You have been added as a Noon Fleet HRMS admin',
    `Hello ${req.body.name},\n\nYou now have admin access to Noon Fleet HRMS. Sign in with this email — a one-time code will be sent each time.\n\nNoon Fleet HR Team`);
  res.json({ id, message: 'Sub-admin created and invite email sent' });
});
app.put('/api/admins/:id', auth, superOnly, async (req, res) => {
  await query('UPDATE admins SET name = ?, email = ?, permissions = ? WHERE id = ? AND isSuperAdmin = 0',
    [req.body.name, String(req.body.email || '').toLowerCase(), JSON.stringify(req.body.permissions || []), req.params.id]);
  await audit(req.user.name, `Updated admin ${req.body.email}`);
  res.json({ message: 'Updated' });
});
app.delete('/api/admins/:id', auth, superOnly, async (req, res) => {
  await query('DELETE FROM admins WHERE id = ? AND isSuperAdmin = 0', [req.params.id]);
  await audit(req.user.name, 'Removed admin ' + req.params.id);
  res.json({ message: 'Deleted' });
});

/* ───────────────────────── audit + config ───────────────────────── */
app.get('/api/audit', auth, superOnly, async (req, res) => {
  const { rows } = await query('SELECT * FROM audit ORDER BY seq DESC LIMIT 500', []);
  res.json(rows.map(r => ({ t: r.t, user: r.usr, action: r.action })));
});
app.post('/api/audit', auth, async (req, res) => {
  if (req.body.action) await audit(req.user.name, String(req.body.action).slice(0, 300));
  res.json({ ok: true });
});

app.get('/api/config', auth, async (req, res) => {
  const { rows } = await query("SELECT v FROM config WHERE k = 'cfg'", []);
  res.json(rows.length ? J(rows[0].v, {}) : { empFields: [], payEarn: [], payDed: [] });
});
app.put('/api/config', auth, needPerm('manage_settings'), async (req, res) => {
  const cfg = { empFields: req.body.empFields || [], payEarn: req.body.payEarn || [], payDed: req.body.payDed || [] };
  await query("INSERT INTO config (k, v) VALUES ('cfg', ?) ON CONFLICT (k) DO UPDATE SET v = ?", [JSON.stringify(cfg), JSON.stringify(cfg)]);
  await audit(req.user.name, 'Updated custom fields / payroll entities');
  res.json({ message: 'Saved' });
});

/* ───────────────────────── daily backup ───────────────────────── */
async function makeBackup() {
  const dump = {};
  for (const t of ['employees', 'leaves', 'payslips', 'documents', 'admins', 'config'])
    dump[t] = (await query(`SELECT * FROM ${t}`, [])).rows;
  const json = JSON.stringify(dump);
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `hrms_backup_${today()}.json`);
  fs.writeFileSync(file, json);
  const link = await gdrive.uploadBackup(json);
  console.log(`[backup] saved ${file}${link ? ' + uploaded to Google Drive' : gdrive.configured() ? '' : ' (Drive not configured)'}`);
}
cron.schedule(process.env.BACKUP_CRON || '0 3 * * *', () => makeBackup().catch(e => console.error('backup failed', e)));
app.post('/api/backup', auth, superOnly, async (req, res) => { await makeBackup(); res.json({ message: 'Backup created' }); });

/* ───────────────────────── start ───────────────────────── */
app.get('/api/health', (req, res) => res.json({ ok: true, engine, drive: gdrive.configured(), email: mailer.configured }));
/* ───────────────────────── dashboard metrics ───────────────────────── */
app.get('/api/dashboard/metrics', auth, needPerm('view_employees'), async (req, res) => {
  const { rows: emps } = await query('SELECT * FROM employees', []);
  const { rows: leaves } = await query('SELECT * FROM leaves', []);
  const today = new Date().toISOString().slice(0, 10);
  const active = emps.filter(e => e.status === 'Active');
  const onLeaveToday = leaves.filter(l => {
    const d = JSON.parse(l.data || '{}');
    return l.status === 'Approved' && d.fromDate <= today && d.toDate >= today;
  });
  const pendingLeaves = leaves.filter(l => l.status === 'Pending');
  const inactive = emps.filter(e => e.status === 'Inactive');
  const visasExpiring = emps.filter(e => {
    const d = JSON.parse(e.data || '{}');
    if (!d.evisaExpiry) return false;
    const days = Math.floor((new Date(d.evisaExpiry) - Date.now()) / 86400000);
    return days > 0 && days <= 90;
  });
  res.json({
    totalEmployees: emps.length,
    activeAndWorking: active.length,
    onLeaveToday: onLeaveToday.length,
    inactive: inactive.length,
    pendingLeaves: pendingLeaves.length,
    visasExpiring: visasExpiring.length,
    totalPayroll: active.reduce((sum, e) => sum + (parseFloat(JSON.parse(e.data || '{}').basicSalary) || 0), 0),
    details: {
      onLeaveTodayList: onLeaveToday.map(l => {
        const d = JSON.parse(l.data || '{}');
        const emp = emps.find(e => e.id === l.employeeid ?? l.employeeId);
        return { empId: emp?.empid ?? emp?.empId, name: emp?.name, leaveType: d.type, fromDate: d.fromDate, toDate: d.toDate };
      }),
      inactiveList: inactive.map(e => ({ empId: e.empid ?? e.empId, name: e.name, status: e.status })),
      visasExpiringList: visasExpiring.map(e => {
        const d = JSON.parse(e.data || '{}');
        const days = Math.floor((new Date(d.evisaExpiry) - Date.now()) / 86400000);
        return { empId: e.empid ?? e.empId, name: e.name, expiryDate: d.evisaExpiry, daysLeft: days };
      }),
      pendingLeavesList: pendingLeaves.map(l => {
        const d = JSON.parse(l.data || '{}');
        const emp = emps.find(e => e.id === l.employeeid ?? l.employeeId);
        return { empId: emp?.empid ?? emp?.empId, name: emp?.name, type: d.type, fromDate: d.fromDate, toDate: d.toDate, days: d.days, appliedOn: d.appliedOn };
      })
    }
  });
});

app.get('/api/leaves/export', auth, needPerm('view_leaves'), async (req, res) => {
  const { rows: leaves } = await query('SELECT * FROM leaves', []);
  const { rows: emps } = await query('SELECT * FROM employees', []);
  const empMap = Object.fromEntries(emps.map(e => [e.id, e]));
  const csv = 'Employee ID,Employee Name,Leave Type,From Date,To Date,Days,Status,Applied Date\n'
    + leaves.map(l => {
      const d = JSON.parse(l.data || '{}');
      const emp = empMap[l.employeeid ?? l.employeeId];
      return `${emp?.empid ?? emp?.empId || ''},${emp?.name || ''},"${d.type || ''}",${d.fromDate || ''},${d.toDate || ''},${d.days || '0'},${l.status || ''},${d.appliedOn || ''}`;
    }).join('\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename=leaves_export.csv');
  res.send(csv);
});
init().then(async () => {
  const email = (process.env.SUPER_ADMIN_EMAIL || 'mauradhi@noon.com').toLowerCase();
  const { rows } = await query('SELECT id FROM admins WHERE isSuperAdmin = 1', []);
  if (!rows.length) {
    await query('INSERT INTO admins (id, email, name, isSuperAdmin, permissions, createdAt) VALUES (?, ?, ?, 1, ?, ?)',
      ['admin-001', email, process.env.SUPER_ADMIN_NAME || 'Super Admin', '[]', today()]);
    console.log('Created super admin:', email);
  }
  // Initialize field schema if not present
  const { rows: cfgRows } = await query("SELECT v FROM config WHERE k = 'field_schema'", []);
  if (!cfgRows.length) {
    await saveFieldSchema(DEFAULT_FIELDS);
    console.log('Initialized default field schema with', Object.keys(DEFAULT_FIELDS).length, 'fields');
  }
  app.listen(PORT, () => console.log(`Noon Fleet HRMS running on http://localhost:${PORT}  (db: ${engine}, email: ${mailer.configured ? 'SMTP' : 'DEV MODE'}, drive: ${gdrive.configured() ? 'ON' : 'off'})`));
});

module.exports = app;
