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

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const LEAVE_ATTACHMENTS_DIR = path.join(UPLOAD_DIR, 'leaves');
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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));
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

async function audit(user, action) { try { await query('INSERT INTO audit (t, usr, action) VALUES (?, ?, ?)', [new Date().toLocaleString(), user || 'System', action]); } catch (e) { } }
async function notify(employeeId, type, title, message) { try { await query('INSERT INTO notifications (id, employeeId, isRead, data) VALUES (?, ?, 0, ?)', [uid('N'), employeeId, JSON.stringify({ type, title, message, createdAt: today() })]); } catch (e) { } }

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

app.post('/api/auth/employee/verify-otp', async (req, res) => { try { const empId = String(req.body.empId || '').trim().toUpperCase(); if (!await checkOtp('emp:' + empId, req.body.otp)) return res.status(401).json({ error: 'Incorrect code' }); const r = await query('SELECT * FROM employees WHERE UPPER(empId) = ?', [empId]); if (!r.rows.length) return res.status(404).json({ error: 'Employee not found' }); const e = rowToEmp(r.rows[0]); await audit(e.name, 'Employee login'); res.json({ token: token({ role: 'employee', employeeId: e.id, empId: e.empId, name: e.name }), role: 'employee', empId: e.empId, name: e.name }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/employees', auth, async (req, res) => { try { if (req.user.role === 'employee') { const r = await query('SELECT * FROM employees WHERE id = ?', [req.user.employeeId]); return res.json(r.rows.map(rowToEmp)); } const r = await query('SELECT * FROM employees ORDER BY empId', []); res.json(r.rows.map(rowToEmp)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/employees/:id', auth, async (req, res) => { try { const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); res.json(rowToEmp(r.rows[0])); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/employees', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'manage_employees')) return res.status(403).json({ error: 'No permission' }); const id = uid('E'); const emp = req.body; await query('INSERT INTO employees (id, empId, passportNo, name, email, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, emp.empId, emp.passportNo, emp.name, emp.email, emp.status || 'Active', JSON.stringify(emp)]); res.json({ id }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.patch('/api/employees/:id', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'manage_employees')) return res.status(403).json({ error: 'No permission' }); const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const e = rowToEmp(r.rows[0]); Object.assign(e, req.body); await query('UPDATE employees SET name = ?, email = ?, status = ?, passportNo = ?, data = ? WHERE id = ?', [e.name, e.email, e.status, e.passportNo, JSON.stringify(e), e.id]); res.json({ message: 'Updated' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.put('/api/employees/:id', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'manage_employees')) return res.status(403).json({ error: 'No permission' }); const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const e = rowToEmp(r.rows[0]); Object.assign(e, req.body); await query('UPDATE employees SET name = ?, email = ?, status = ?, passportNo = ?, data = ? WHERE id = ?', [e.name, e.email, e.status, e.passportNo, JSON.stringify(e), e.id]); res.json({ message: 'Updated' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.patch('/api/employees/:id/status', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'manage_employees')) return res.status(403).json({ error: 'No permission' }); const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const e = rowToEmp(r.rows[0]); e.status = req.body.status; await query('UPDATE employees SET status = ?, data = ? WHERE id = ?', [req.body.status, JSON.stringify(e), e.id]); res.json({ message: 'Updated' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.delete('/api/employees/:id', auth, async (req, res) => { try { if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' }); const r = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const e = rowToEmp(r.rows[0]); await query('DELETE FROM employees WHERE id = ?', [req.params.id]); await query('DELETE FROM leaves WHERE employeeId = ?', [e.id]); await query('DELETE FROM payslips WHERE employeeId = ?', [e.id]); await query('DELETE FROM documents WHERE employeeId = ?', [e.id]); await query('DELETE FROM bed_allocations WHERE employeeId = ?', [e.id]); res.json({ message: 'Deleted' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/employees/bulk/import', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'manage_employees')) return res.status(403).json({ error: 'No permission' }); const rows = req.body.rows || []; let added = 0, updated = 0; for (const row of rows) { const existing = await query('SELECT id FROM employees WHERE empId = ?', [row.empId]); if (existing.rows.length) { const e = rowToEmp(await query('SELECT * FROM employees WHERE empId = ?', [row.empId])); Object.assign(e, row); await query('UPDATE employees SET name = ?, email = ?, status = ?, passportNo = ?, data = ? WHERE empId = ?', [e.name, e.email, e.status || 'Active', e.passportNo, JSON.stringify(e), row.empId]); updated++; } else { const id = uid('E'); await query('INSERT INTO employees (id, empId, passportNo, name, email, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, row.empId, row.passportNo, row.name, row.email, row.status || 'Active', JSON.stringify(row)]); added++; } } await audit(req.user.name, `Bulk import: +${added}, ~${updated}`); res.json({ message: 'Imported', added, updated, total: added + updated }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/leaves', auth, async (req, res) => { try { if (req.user.role === 'employee') { const r = await query('SELECT * FROM leaves WHERE employeeId = ?', [req.user.employeeId]); return res.json(r.rows.map(rowToLeave)); } const r = await query('SELECT * FROM leaves ORDER BY id DESC', []); res.json(r.rows.map(rowToLeave)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/leaves', auth, async (req, res) => { try { const empId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId; const r = await query('SELECT * FROM employees WHERE id = ?', [empId]); if (!r.rows.length) return res.status(404).json({ error: 'Employee not found' }); const e = rowToEmp(r.rows[0]); const id = uid('L'); const lv = { type: req.body.type, fromDate: req.body.fromDate, toDate: req.body.toDate, days: +req.body.days || 1, reason: req.body.reason || '', empName: e.name, empId: e.empId, appliedOn: today() }; await query('INSERT INTO leaves (id, employeeId, status, data) VALUES (?, ?, ?, ?)', [id, e.id, 'Pending', JSON.stringify(lv)]); await notify(e.id, 'pending', 'Leave submitted', 'Pending approval'); res.json({ id }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.patch('/api/leaves/:id/decide', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'approve_leaves')) return res.status(403).json({ error: 'No permission' }); const r = await query('SELECT * FROM leaves WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const lv = rowToLeave(r.rows[0]); const newSt = req.body.decision === 'Approved' ? 'Approved' : 'Rejected'; lv.status = newSt; lv.decidedAt = today(); lv.decidedBy = req.user.name; await query('UPDATE leaves SET status = ?, data = ? WHERE id = ?', [newSt, JSON.stringify(lv), lv.id]); await notify(lv.employeeId, newSt === 'Approved' ? 'approved' : 'rejected', 'Leave ' + newSt, newSt); res.json({ message: newSt }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/leaves/:id/attachments', auth, uploadLeaveAttachment.single('file'), async (req, res) => { try { if (!req.file) return res.status(400).json({ error: 'No file' }); const r = await query('SELECT * FROM leaves WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Leave not found' }); const lv = rowToLeave(r.rows[0]); if (lv.employeeId !== req.user.employeeId && req.user.role === 'employee') return res.status(403).json({ error: 'No permission' }); if (!lv.attachments) lv.attachments = []; lv.attachments.push({ name: req.body.name || req.file.originalname, filename: req.file.filename, uploadedAt: today(), uploadedBy: req.user.name }); await query('UPDATE leaves SET data = ? WHERE id = ?', [JSON.stringify(lv), lv.id]); res.json({ message: 'Attachment added', filename: req.file.filename }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/leaves/:id/attachments', auth, async (req, res) => { try { const r = await query('SELECT * FROM leaves WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Leave not found' }); const lv = rowToLeave(r.rows[0]); res.json(lv.attachments || []); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/leaves/:id/attachments/:filename/download', async (req, res) => { try { const r = await query('SELECT * FROM leaves WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Leave not found' }); const lv = rowToLeave(r.rows[0]); const att = (lv.attachments || []).find(a => a.filename === req.params.filename); if (!att) return res.status(404).json({ error: 'Attachment not found' }); const filepath = path.join(LEAVE_ATTACHMENTS_DIR, att.filename); if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' }); res.download(filepath, att.name || att.filename); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/leaves/export', async (req, res) => { try { const r = await query('SELECT * FROM leaves ORDER BY id DESC', []); const leaves = r.rows.map(rowToLeave).map(l => ({ 'Employee ID': l.empId || '', 'Employee Name': l.empName || '', 'Type': l.type || '', 'From Date': l.fromDate || '', 'To Date': l.toDate || '', 'Days': l.days || 0, 'Status': l.status || '', 'Applied On': l.appliedOn || '', 'Decided By': l.decidedBy || '', 'Decided At': l.decidedAt || '' })); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(leaves); XLSX.utils.book_append_sheet(wb, ws, 'Leaves'); const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="leaves_${today()}.xlsx"`); res.send(buf); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/employees/export', async (req, res) => { try { const r = await query('SELECT * FROM employees ORDER BY empId', []); const emps = r.rows.map(rowToEmp).map(e => ({ 'Employee ID': e.empId || '', 'Name': e.name || '', 'Email': e.email || '', 'Passport': e.passportNo || '', 'Status': e.status || 'Active', 'Position': e.position || '', 'Department': e.department || '', 'Location': e.location || '' })); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(emps); XLSX.utils.book_append_sheet(wb, ws, 'Employees'); const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="employees_${today()}.xlsx"`); res.send(buf); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/payslips/export', async (req, res) => { try { const r = await query('SELECT * FROM payslips ORDER BY month DESC', []); const ps = r.rows.map(rowToPs).map(p => ({ 'Employee ID': p.employeeId || '', 'Month': p.month || '', 'Basic': p.basic || 0, 'Allowances': p.allowances || 0, 'Deductions': p.deductions || 0, 'Net Pay': p.netPay || p.net_pay || 0 })); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(ps); XLSX.utils.book_append_sheet(wb, ws, 'Payslips'); const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="payslips_${today()}.xlsx"`); res.send(buf); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/payslips', auth, async (req, res) => { try { if (req.user.role === 'employee') { const r = await query('SELECT * FROM payslips WHERE employeeId = ?', [req.user.employeeId]); return res.json(r.rows.map(rowToPs)); } const r = await query('SELECT * FROM payslips ORDER BY month DESC', []); res.json(r.rows.map(rowToPs)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/payslips/bulk', auth, async (req, res) => { try { if (!isSuperAdmin(req) && !hasPermission(req, 'manage_payroll')) return res.status(403).json({ error: 'No permission' }); const rows = req.body.rows || []; for (const row of rows) await query('INSERT INTO payslips (id, employeeId, month, data) VALUES (?, ?, ?, ?)', [uid('P'), row.employeeId, req.body.month, JSON.stringify(row)]); await audit(req.user.name, `Payslips generated: ${rows.length}`); res.json({ message: 'Generated', count: rows.length }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/documents', auth, async (req, res) => { try { if (req.user.role === 'employee') { const r = await query('SELECT * FROM documents WHERE employeeId = ?', [req.user.employeeId]); return res.json(r.rows.map(d => ({ id: d.id, employeeId: d.employeeid ?? d.employeeId, name: d.name, type: d.type, filename: d.filename }))); } const r = await query('SELECT * FROM documents ORDER BY uploadedAt DESC', []); res.json(r.rows.map(d => ({ id: d.id, employeeId: d.employeeid ?? d.employeeId, name: d.name, type: d.type, filename: d.filename }))); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/documents', auth, upload.single('file'), async (req, res) => { try { if (!req.file) return res.status(400).json({ error: 'No file' }); const empId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId; const id = uid('D'); await query('INSERT INTO documents (id, employeeId, name, type, size, filename, uploadedAt, uploader) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, empId, req.body.name || req.file.originalname, req.file.mimetype, req.file.size, req.file.filename, today(), req.user.name]); res.json({ id, filename: req.file.filename }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/documents/:id/download', async (req, res) => { try { const r = await query('SELECT * FROM documents WHERE id = ?', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); const d = r.rows[0]; const filepath = path.join(UPLOAD_DIR, d.filename); if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' }); res.download(filepath, d.name || d.filename); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/notifications', auth, async (req, res) => { try { const id = req.user.role === 'employee' ? req.user.employeeId : '__none__'; const r = await query('SELECT * FROM notifications WHERE employeeId = ? ORDER BY id DESC', [id]); res.json(r.rows.map(rowToNotif)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.patch('/api/notifications/read-all', auth, async (req, res) => { try { const id = req.user.role === 'employee' ? req.user.employeeId : '__none__'; await query('UPDATE notifications SET isRead = 1 WHERE employeeId = ?', [id]); res.json({ message: 'Marked as read' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/admins', auth, async (req, res) => { try { if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' }); const r = await query('SELECT * FROM admins ORDER BY createdAt', []); res.json(r.rows.map(rowToAdmin)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/admins', auth, async (req, res) => { try { if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' }); const id = uid('A'); const code = await issueOtp('admin:' + req.body.email.toLowerCase()); await mailer.sendOtp(req.body.email, code); await query('INSERT INTO admins (id, email, name, isSuperAdmin, permissions, createdAt) VALUES (?, ?, ?, 0, ?, ?)', [id, req.body.email.toLowerCase(), req.body.name, JSON.stringify(req.body.permissions || []), today()]); await audit(req.user.name, `Admin created: ${req.body.email}`); res.json({ id, message: 'OTP sent to ' + req.body.email }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/audit', auth, async (req, res) => { try { if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' }); const r = await query('SELECT * FROM audit ORDER BY seq DESC LIMIT 500', []); res.json(r.rows.map(x => ({ t: x.t, user: x.usr, action: x.action }))); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/config', auth, async (req, res) => { try { const r = await query('SELECT v FROM config WHERE k = ?', ['cfg']); res.json(r.rows.length ? J(r.rows[0].v, {}) : {}); } catch (e) { res.status(500).json({ error: e.message }); } });

app.put('/api/config', auth, async (req, res) => { try { if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Super admin only' }); await query('DELETE FROM config WHERE k = ?', ['cfg']); await query('INSERT INTO config (k, v) VALUES (?, ?)', ['cfg', JSON.stringify(req.body)]); res.json({ message: 'Saved' }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/dashboard/metrics', auth, async (req, res) => { try { const emps = await query('SELECT * FROM employees ORDER BY empId', []); const leaves = await query('SELECT * FROM leaves WHERE status = ?', ['Pending']); const payslips = await query('SELECT * FROM payslips', []); const empList = emps.rows.map(rowToEmp); const activeAndWorking = empList.filter(e => e.status === 'Active'); const onLeave = empList.filter(e => e.status === 'On Leave'); const inactive = empList.filter(e => e.status === 'Inactive'); let totalNetPay = 0; payslips.rows.forEach(p => { const data = J(p.data, {}); totalNetPay += +(data.netPay || data.net_pay || 0); }); res.json({ totalEmployees: empList.length, pendingLeaves: leaves.rows.length, payslipsIssued: totalNetPay, details: { activeAndWorking: activeAndWorking.map(e => ({ id: e.id, empId: e.empId, name: e.name })), onLeave: onLeave.map(e => ({ id: e.id, empId: e.empId, name: e.name })), inactive: inactive.map(e => ({ id: e.id, empId: e.empId, name: e.name })) } }); } catch (e) { res.status(500).json({ error: e.message }); } });

/* ─── Accommodation ─────────────────────────────────────────────────────────
   Camp → Building → Floor → Room → Bed.  Bed allocations link an employee to a
   specific camp/room/bed with a check-in date.  Reads are permission-gated the
   same way as the rest of the system: an employee can only ever see their own
   allocation, regardless of what the browser requests. */
function canManageAcc(req) { return isSuperAdmin(req) || hasPermission(req, 'manage_accommodation'); }
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
    if (!canManageAcc(req)) return res.status(403).json({ error: 'No permission' });
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
    await notify(employeeId, 'approved', 'Accommodation assigned', `Room ${room.roomNo}, Bed ${bed}`);
    await audit(req.user.name, `Bed allocated: emp ${employeeId} → room ${room.roomNo}, bed ${bed}`);
    res.json({ message: 'Allocated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/accommodation/allocations/:id', auth, async (req, res) => {
  try {
    if (!canManageAcc(req)) return res.status(403).json({ error: 'No permission' });
    await query('DELETE FROM bed_allocations WHERE id = ?', [req.params.id]);
    await audit(req.user.name, 'Bed vacated');
    res.json({ message: 'Vacated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, engine, timestamp: now() }));

init().then(async () => { const email = (process.env.SUPER_ADMIN_EMAIL || 'mauradhi@noon.com').toLowerCase(); const r = await query('SELECT id FROM admins WHERE isSuperAdmin = 1', []); if (!r.rows.length) { await query('INSERT INTO admins (id, email, name, isSuperAdmin, permissions, createdAt) VALUES (?, ?, ?, 1, ?, ?)', ['admin-001', email, 'Super Admin', '[]', today()]); console.log(`✓ Super admin created: ${email}`); } app.listen(PORT, () => console.log(`✓ HRMS server running on port ${PORT}`)); }).catch(e => { console.error('✗ Startup failed:', e.message); process.exit(1); });

module.exports = app;
