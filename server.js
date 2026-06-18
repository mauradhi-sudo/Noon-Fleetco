require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const { Pool } = require('pg');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Initialize Resend for OTP emails
const resend = new Resend(process.env.RESEND_API_KEY);

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const query = async (sql, params) => {
  try { 
    return await pool.query(sql, params); 
  } catch(e) { 
    console.error('DB Error:', e.message);
    throw e; 
  }
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(__dirname));
// Serve static files from root
app.use(express.static(__dirname));

// Serve portals
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-portal.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-portal.html'));
});

app.get('/employee', (req, res) => {
  res.sendFile(path.join(__dirname, 'employee-portal.html'));
});

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

// Store OTPs in memory (use database for production)
const otpStore = new Map();

// ==================== ADMIN OTP LOGIN ====================

app.post('/api/auth/admin/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP with 10-minute expiry
    otpStore.set(`admin:${email}`, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    // Send email via Resend
    try {
      await resend.emails.send({
        from: 'NOON HRMS <onboarding@resend.dev>',
        to: email,
        subject: 'Your NOON HRMS OTP - ' + otp,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>🔐 Your NOON Fleet HRMS Login OTP</h2>
            <p>Hello Admin,</p>
            <p>Your One-Time Password (OTP) is:</p>
            <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h1 style="margin: 0; color: #667eea; font-size: 36px; letter-spacing: 5px;">${otp}</h1>
            </div>
            <p>This OTP will expire in 10 minutes.</p>
            <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">NOON Fleet HRMS System</p>
          </div>
        `
      });
      
      console.log(`✅ OTP sent to ${email}`);
      res.json({ 
        message: 'OTP sent successfully', 
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        // For development only - remove in production
        _devOtp: process.env.NODE_ENV === 'development' ? otp : undefined
      });
    } catch (emailError) {
      console.error('Resend email error:', emailError);
      res.status(500).json({ error: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/admin/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP required' });
    }

    // Check OTP
    const storedOtp = otpStore.get(`admin:${email}`);
    
    if (!storedOtp) {
      return res.status(401).json({ error: 'OTP expired or not found' });
    }

    if (Date.now() > storedOtp.expiresAt) {
      otpStore.delete(`admin:${email}`);
      return res.status(401).json({ error: 'OTP expired' });
    }

    if (storedOtp.otp !== otp.toString()) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    // OTP verified - generate token
    otpStore.delete(`admin:${email}`);

    const token = jwt.sign({ 
      role: 'admin', 
      email: email,
      adminId: uuidv4()
    }, JWT_SECRET, { expiresIn: '12h' });

    res.json({ 
      token, 
      role: 'admin', 
      email: email,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== EMPLOYEE OTP LOGIN ====================

app.post('/api/auth/employee/request-otp', async (req, res) => {
  try {
    const { empId, email } = req.body;

    if (!empId || !email) {
      return res.status(400).json({ error: 'Employee ID and email required' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    otpStore.set(`emp:${empId}`, {
      otp,
      email,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    // Send email
    try {
      await resend.emails.send({
        from: 'NOON HRMS <onboarding@resend.dev>',
        to: email,
        subject: 'Your NOON HRMS OTP - ' + otp,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>🔐 Your NOON Fleet HRMS Login OTP</h2>
            <p>Hello Employee,</p>
            <p>Your One-Time Password (OTP) is:</p>
            <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h1 style="margin: 0; color: #27ae60; font-size: 36px; letter-spacing: 5px;">${otp}</h1>
            </div>
            <p>This OTP will expire in 10 minutes.</p>
            <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">NOON Fleet HRMS System</p>
          </div>
        `
      });

      res.json({ 
        message: 'OTP sent successfully',
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        _devOtp: process.env.NODE_ENV === 'development' ? otp : undefined
      });
    } catch (emailError) {
      console.error('Resend error:', emailError);
      res.status(500).json({ error: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/employee/verify-otp', async (req, res) => {
  try {
    const { empId, otp } = req.body;

    if (!empId || !otp) {
      return res.status(400).json({ error: 'Employee ID and OTP required' });
    }

    const storedOtp = otpStore.get(`emp:${empId}`);
    
    if (!storedOtp) {
      return res.status(401).json({ error: 'OTP expired or not found' });
    }

    if (Date.now() > storedOtp.expiresAt) {
      otpStore.delete(`emp:${empId}`);
      return res.status(401).json({ error: 'OTP expired' });
    }

    if (storedOtp.otp !== otp.toString()) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    otpStore.delete(`emp:${empId}`);

    const token = jwt.sign({ 
      role: 'employee', 
      empId: empId,
      email: storedOtp.email
    }, JWT_SECRET, { expiresIn: '12h' });

    res.json({ 
      token, 
      role: 'employee', 
      empId: empId,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CONFIG ====================

app.get('/api/config', (req, res) => {
  res.json({ 
    ok: true, 
    status: 'HRMS running',
    version: '1.0.0'
  });
});

// ==================== EMPLOYEES ====================

app.get('/api/employees', auth, adminOnly, async (req, res) => {
  try {
    const r = await query('SELECT * FROM employees ORDER BY "empId" LIMIT 100');
    res.json(r.rows || []);
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

app.get('/api/employees/me', auth, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.json({ 
        id: req.user.adminId, 
        email: req.user.email,
        role: 'admin',
        name: 'Admin'
      });
    }
    const r = await query('SELECT * FROM employees WHERE "empId" = $1', [req.user.empId]);
    res.json(r.rows[0] || {});
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

app.post('/api/employees', auth, adminOnly, async (req, res) => {
  try {
    const { empId, name, email, passportNo } = req.body;
    const id = uuidv4();
    await query(
      'INSERT INTO employees (id, "empId", name, email, "passportNo") VALUES ($1, $2, $3, $4, $5)',
      [id, empId, name, email, passportNo]
    );
    res.json({ id, message: 'Employee created' });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// ==================== LEAVES ====================

app.get('/api/leaves', auth, async (req, res) => {
  try {
    const empId = req.user.role === 'employee' ? req.user.empId : null;
    const query_str = empId 
      ? 'SELECT * FROM leaves WHERE "empId" = $1 LIMIT 100'
      : 'SELECT * FROM leaves LIMIT 100';
    const params = empId ? [empId] : [];
    const r = await query(query_str, params);
    res.json(r.rows || []);
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

app.post('/api/leaves', auth, async (req, res) => {
  try {
    const { fromDate, toDate, type, reason, days } = req.body;
    const id = uuidv4();
    const empId = req.user.empId || req.user.email;
    await query(
      'INSERT INTO leaves (id, "empId", type, "fromDate", "toDate", reason, days, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, empId, type, fromDate, toDate, reason, days || 1, 'Pending']
    );
    res.json({ id, message: 'Leave applied' });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    status: 'HRMS running',
    timestamp: new Date().toISOString()
  });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`✅ NOON FLEET HRMS running on port ${PORT}`);
  console.log(`📊 Admin Portal: http://localhost:${PORT}/admin-portal.html`);
  console.log(`👤 Employee Portal: http://localhost:${PORT}/employee-portal.html`);
  console.log(`🔐 OTP via Resend enabled`);
});

module.exports = app;
