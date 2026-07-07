// Database adapter: PostgreSQL when DATABASE_URL is set, otherwise built-in SQLite (node:sqlite).
// Same query(sql, params) API for both. SQL kept portable across the two engines.
'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

let query; // async (sql, params) => { rows }
let engine;

if (process.env.DATABASE_URL) {
  engine = 'postgres';
  const { Pool, types } = require('pg');
  // Parse BIGINT (OID 20) as a JS number so OTP-expiry comparisons work without string coercion.
  try { types.setTypeParser(20, v => parseInt(v, 10)); } catch (e) {}
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
    max: +(process.env.PG_POOL_MAX || 10),   // reuse connections instead of reconnecting per request
    keepAlive: true,                          // keep sockets warm (avoids re-handshake latency on Render)
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', (err) => { console.error('PG pool error:', err.message); });
  // translate ? placeholders to $1..$n
  query = async (sql, params = []) => {
    let i = 0;
    const pgSql = sql.replace(/\?/g, () => '$' + (++i));
    const res = await pool.query(pgSql, params);
    return { rows: res.rows };
  };
} else {
  engine = 'sqlite';
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(DATA_DIR, 'hrms.db'));
  db.exec('PRAGMA journal_mode = WAL');
  query = async (sql, params = []) => {
    const stmt = db.prepare(sql);
    if (/^\s*(select|with)/i.test(sql) || /returning/i.test(sql)) {
      return { rows: stmt.all(...params) };
    }
    stmt.run(...params);
    return { rows: [] };
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  empId TEXT UNIQUE,
  passportNo TEXT,
  name TEXT,
  email TEXT,
  status TEXT DEFAULT 'Active',
  data TEXT
);
CREATE TABLE IF NOT EXISTS leaves (
  id TEXT PRIMARY KEY,
  employeeId TEXT,
  status TEXT DEFAULT 'Pending',
  data TEXT
);
CREATE TABLE IF NOT EXISTS payslips (
  id TEXT PRIMARY KEY,
  employeeId TEXT,
  month TEXT,
  data TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  employeeId TEXT,
  name TEXT,
  type TEXT,
  size TEXT,
  filename TEXT,
  driveLink TEXT,
  uploadedAt TEXT,
  uploader TEXT,
  reviewStatus TEXT DEFAULT 'Pending',
  reviewedBy TEXT,
  reviewedAt TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  employeeId TEXT,
  isRead INTEGER DEFAULT 0,
  data TEXT
);
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  isSuperAdmin INTEGER DEFAULT 0,
  permissions TEXT DEFAULT '[]',
  createdAt TEXT
);
CREATE TABLE IF NOT EXISTS otps (
  target TEXT PRIMARY KEY,
  code TEXT,
  expires BIGINT
);
CREATE TABLE IF NOT EXISTS audit (
  seq INTEGER PRIMARY KEY ${'$'}{AUTOINC},
  t TEXT,
  usr TEXT,
  action TEXT
);
CREATE TABLE IF NOT EXISTS config (
  k TEXT PRIMARY KEY,
  v TEXT
);
CREATE TABLE IF NOT EXISTS camps (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE,
  data TEXT
);
CREATE TABLE IF NOT EXISTS acc_rooms (
  id TEXT PRIMARY KEY,
  campId TEXT,
  building TEXT,
  floor TEXT,
  roomNo TEXT,
  capacity INTEGER DEFAULT 1,
  data TEXT
);
CREATE TABLE IF NOT EXISTS bed_allocations (
  id TEXT PRIMARY KEY,
  employeeId TEXT,
  campId TEXT,
  roomId TEXT,
  bed TEXT,
  checkIn TEXT,
  data TEXT
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'other',
  code TEXT,
  name TEXT,
  status TEXT DEFAULT 'Available',
  assignedTo TEXT,
  assignedDate TEXT,
  data TEXT
);
CREATE TABLE IF NOT EXISTS acc_history (
  id TEXT PRIMARY KEY,
  employeeId TEXT,
  campId TEXT,
  roomId TEXT,
  bed TEXT,
  checkIn TEXT,
  checkOut TEXT,
  data TEXT
);
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employeeId TEXT,
  date TEXT,
  status TEXT,
  updatedAt TEXT,
  updatedBy TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance (employeeId, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance (date);
`;

async function init() {
  const autoinc = engine === 'postgres' ? 'GENERATED ALWAYS AS IDENTITY' : 'AUTOINCREMENT';
  const ddl = SCHEMA.replace('${AUTOINC}', autoinc);
  for (const stmt of ddl.split(';').map(s => s.trim()).filter(Boolean)) {
    await query(stmt);
  }
  // migration: fix the OTP expiry column on databases created before this fix
  if (engine === 'postgres') {
    try { await query('ALTER TABLE otps ALTER COLUMN expires TYPE BIGINT'); } catch (e) {}
    try { await query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS reviewStatus TEXT DEFAULT 'Pending'"); } catch (e) {}
    try { await query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS reviewedBy TEXT'); } catch (e) {}
    try { await query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS reviewedAt TEXT'); } catch (e) {}
  } else {
    try { await query("ALTER TABLE documents ADD COLUMN reviewStatus TEXT DEFAULT 'Pending'"); } catch (e) {}
    try { await query('ALTER TABLE documents ADD COLUMN reviewedBy TEXT'); } catch (e) {}
    try { await query('ALTER TABLE documents ADD COLUMN reviewedAt TEXT'); } catch (e) {}
  }
}  

module.exports = { query, init, engine, DATA_DIR };
