require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const query = async (sql, params) => {
  try { return await pool.query(sql, params); } 
  catch(e) { console.error('DB Error:', e); throw e; }
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ 
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/[^\w.-]/g, '_'))
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Auth Middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};

// ==================== AUTHENTICATION ====================

app.post('/api/auth/login', async (req, res) => {
  const { empId, passportNo } = req.body;
  try {
    const r = await query('SELECT * FROM employees WHERE "empId" = $1', [empId]);
    if (!r.rows.length || r.rows[0].passportNo !== passportNo) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const emp = r.rows[0];
    const token = jwt.sign({ role: 'employee', id: emp.id, empId: emp.empId }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, role: 'employee', empId: emp.empId, name: emp.name });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/admin-login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await query('SELECT * FROM admins WHERE email = $1', [email]);
    if (!r.rows.length || r.rows[0].password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const admin = r.rows[0];
    const token = jwt.sign({ role: 'admin', id: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, role: 'admin', email: admin.email, name: admin.name });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== EMPLOYEES ====================

app.get('/api/employees', auth, adminOnly, async (req, res) => {
  try {
    const r = await query('SELECT * FROM employees ORDER BY "empId" LIMIT 100');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/employees/me', auth, async (req, res) => {
  try {
    const r = await query('SELECT * FROM employees WHERE id = $1', [req.user.id]);
    res.json(r.rows[0] || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', auth, adminOnly, async (req, res) => {
  const { empId, name, passportNo, email } = req.body;
  try {
    const id = uuidv4();
    await query(
      'INSERT INTO employees (id, "empId", name, "passportNo", email) VALUES ($1, $2, $3, $4, $5)',
      [id, empId, name, passportNo, email]
    );
    res.json({ id, message: 'Created' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== LEAVES ====================

app.get('/api/leaves', auth, async (req, res) => {
  try {
    const empId = req.user.role === 'employee' ? req.user.id : null;
    const query_str = empId 
      ? 'SELECT * FROM leaves WHERE "employeeId" = $1 LIMIT 100'
      : 'SELECT * FROM leaves LIMIT 100';
    const params = empId ? [empId] : [];
    const r = await query(query_str, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leaves', auth, async (req, res) => {
  const { fromDate, toDate, type, reason, days } = req.body;
  try {
    const id = uuidv4();
    await query(
      'INSERT INTO leaves (id, "employeeId", type, "fromDate", "toDate", reason, days, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, req.user.id, type, fromDate, toDate, reason, days || 1, 'Pending']
    );
    res.json({ id, message: 'Leave applied' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/leaves/:id/approve', auth, adminOnly, async (req, res) => {
  const { decision } = req.body;
  try {
    await query('UPDATE leaves SET status = $1 WHERE id = $2', [decision, req.params.id]);
    res.json({ message: 'Updated' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== PAYROLL ====================

app.get('/api/payslips', auth, async (req, res) => {
  try {
    const empId = req.user.role === 'employee' ? req.user.id : null;
    const query_str = empId 
      ? 'SELECT * FROM payslips WHERE "employeeId" = $1 LIMIT 100'
      : 'SELECT * FROM payslips LIMIT 100';
    const params = empId ? [empId] : [];
    const r = await query(query_str, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payslips', auth, adminOnly, async (req, res) => {
  const { employeeId, month, basicSalary, allowances, deductions } = req.body;
  try {
    const id = uuidv4();
    const netSalary = (basicSalary || 0) + (allowances || 0) - (deductions || 0);
    await query(
      'INSERT INTO payslips (id, "employeeId", month, "basicSalary", allowances, deductions, "netSalary") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, employeeId, month, basicSalary, allowances, deductions, netSalary]
    );
    res.json({ id, message: 'Payslip created' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== ASSETS ====================

app.get('/api/assets', auth, async (req, res) => {
  try {
    const r = await query('SELECT * FROM assets LIMIT 100');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/assets/:id', auth, async (req, res) => {
  try {
    const r = await query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    res.json(r.rows[0] || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assets', auth, adminOnly, async (req, res) => {
  const { name, type, serialNumber, registrationDate, insuranceExpiry, maintenanceDate } = req.body;
  try {
    const id = uuidv4();
    await query(
      'INSERT INTO assets (id, name, type, "serialNumber", "registrationDate", "insuranceExpiry", "maintenanceDate", status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, name, type, serialNumber, registrationDate, insuranceExpiry, maintenanceDate, 'Available']
    );
    res.json({ id, message: 'Asset created' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assets/:id/assign', auth, adminOnly, async (req, res) => {
  const { employeeId, assignmentDate } = req.body;
  try {
    const assignId = uuidv4();
    await query(
      'INSERT INTO "assetAssignments" (id, "assetId", "employeeId", "assignmentDate", status) VALUES ($1, $2, $3, $4, $5)',
      [assignId, req.params.id, employeeId, assignmentDate, 'Active']
    );
    await query('UPDATE assets SET status = $1 WHERE id = $2', ['Assigned', req.params.id]);
    res.json({ id: assignId, message: 'Asset assigned' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assets/:id/return', auth, async (req, res) => {
  const { returnDate, condition } = req.body;
  try {
    const r = await query('SELECT * FROM "assetAssignments" WHERE "assetId" = $1 AND status = $2', [req.params.id, 'Active']);
    if (r.rows.length) {
      await query('UPDATE "assetAssignments" SET status = $1, "returnDate" = $2, condition = $3 WHERE id = $4',
        ['Returned', returnDate, condition, r.rows[0].id]
      );
      await query('UPDATE assets SET status = $1 WHERE id = $2', ['Available', req.params.id]);
    }
    res.json({ message: 'Asset returned' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/assets/employee/:empId', auth, async (req, res) => {
  try {
    const r = await query(
      'SELECT a.* FROM assets a JOIN "assetAssignments" aa ON a.id = aa."assetId" WHERE aa."employeeId" = $1 AND aa.status = $2',
      [req.params.empId, 'Active']
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== ACCOMMODATION ====================

app.get('/api/accommodation/camps', auth, async (req, res) => {
  try {
    const r = await query('SELECT * FROM camps');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/accommodation/camps', auth, adminOnly, async (req, res) => {
  const { name, location, manager } = req.body;
  try {
    const id = uuidv4();
    await query('INSERT INTO camps (id, name, location, manager) VALUES ($1, $2, $3, $4)', [id, name, location, manager]);
    res.json({ id, message: 'Camp created' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/accommodation/rooms/:campId', auth, async (req, res) => {
  try {
    const r = await query('SELECT * FROM rooms WHERE "campId" = $1', [req.params.campId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/accommodation/rooms', auth, adminOnly, async (req, res) => {
  const { campId, roomNumber, capacity, subdivision } = req.body;
  try {
    const id = uuidv4();
    await query('INSERT INTO rooms (id, "campId", "roomNumber", capacity, subdivision, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, campId, roomNumber, capacity, subdivision, 'Available']
    );
    res.json({ id, message: 'Room created' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/accommodation/assign', auth, adminOnly, async (req, res) => {
  const { employeeId, roomId, checkInDate } = req.body;
  try {
    const id = uuidv4();
    await query('INSERT INTO "roomAssignments" (id, "roomId", "employeeId", "checkInDate", status) VALUES ($1, $2, $3, $4, $5)',
      [id, roomId, employeeId, checkInDate, 'Active']
    );
    await query('UPDATE rooms SET status = $1 WHERE id = $2', ['Occupied', roomId]);
    res.json({ id, message: 'Room assigned' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/accommodation/employee/:empId', auth, async (req, res) => {
  try {
    const r = await query(
      'SELECT r.*, ra."checkInDate" FROM rooms r JOIN "roomAssignments" ra ON r.id = ra."roomId" WHERE ra."employeeId" = $1 AND ra.status = $2',
      [req.params.empId, 'Active']
    );
    res.json(r.rows[0] || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== DOCUMENTS ====================

app.get('/api/documents', auth, async (req, res) => {
  try {
    const empId = req.user.role === 'employee' ? req.user.id : null;
    const query_str = empId 
      ? 'SELECT * FROM documents WHERE "employeeId" = $1'
      : 'SELECT * FROM documents';
    const params = empId ? [empId] : [];
    const r = await query(query_str, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/documents/upload', auth, upload.single('file'), async (req, res) => {
  const { category, expiryDate } = req.body;
  try {
    const id = uuidv4();
    await query(
      'INSERT INTO documents (id, "employeeId", name, category, filename, "expiryDate", "uploadDate") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, req.user.id, req.file.originalname, category, req.file.filename, expiryDate, new Date().toISOString()]
    );
    res.json({ id, message: 'Document uploaded' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/documents/:id/download', auth, async (req, res) => {
  try {
    const r = await query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const file = path.join(uploadDir, r.rows[0].filename);
    res.download(file);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== NOTIFICATIONS ====================

app.get('/api/notifications', auth, async (req, res) => {
  try {
    const r = await query('SELECT * FROM notifications WHERE "employeeId" = $1 ORDER BY "createdAt" DESC', [req.user.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    await query('UPDATE notifications SET "isRead" = true WHERE id = $1', [req.params.id]);
    res.json({ message: 'Marked as read' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== EXIT REQUESTS ====================

app.post('/api/exit-request', auth, async (req, res) => {
  const { reason } = req.body;
  try {
    const id = uuidv4();
    await query('INSERT INTO "exitRequests" (id, "employeeId", reason, status, "requestDate") VALUES ($1, $2, $3, $4, $5)',
      [id, req.user.id, reason, 'Pending', new Date().toISOString()]
    );
    res.json({ id, message: 'Exit request submitted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/exit-requests', auth, adminOnly, async (req, res) => {
  try {
    const r = await query('SELECT * FROM "exitRequests" WHERE status = $1', ['Pending']);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/exit-requests/:id/approve', auth, adminOnly, async (req, res) => {
  const { decision } = req.body;
  try {
    await query('UPDATE "exitRequests" SET status = $1, "approvedDate" = $2 WHERE id = $3',
      [decision === 'approved' ? 'Approved' : 'Rejected', new Date().toISOString(), req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== DASHBOARD ====================

app.get('/api/dashboard', auth, adminOnly, async (req, res) => {
  try {
    const emps = await query('SELECT COUNT(*) as count FROM employees');
    const leaves = await query('SELECT COUNT(*) as count FROM leaves WHERE status = $1', ['Pending']);
    const payslips = await query('SELECT COUNT(*) as count FROM payslips');
    const assets = await query('SELECT COUNT(*) as count FROM assets WHERE status = $1', ['Available']);
    const rooms = await query('SELECT COUNT(*) as count FROM rooms WHERE status = $1', ['Available']);
    const docs = await query('SELECT COUNT(*) as count FROM documents');
    
    res.json({
      totalEmployees: emps.rows[0]?.count || 0,
      pendingLeaves: leaves.rows[0]?.count || 0,
      payslipsIssued: payslips.rows[0]?.count || 0,
      availableAssets: assets.rows[0]?.count || 0,
      availableRooms: rooms.rows[0]?.count || 0,
      documents: docs.rows[0]?.count || 0
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== HEALTH ====================

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'HRMS running' });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`✅ NOON FLEET HRMS running on port ${PORT}`);
  console.log(`📊 Admin Portal: http://localhost:${PORT}/admin-portal.html`);
  console.log(`👤 Employee Portal: http://localhost:${PORT}/employee-portal.html`);
});

module.exports = app;
