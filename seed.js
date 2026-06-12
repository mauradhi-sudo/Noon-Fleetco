// Seed / import tool.
//   node seed.js                      → ensures super admin + adds 3 sample employees (if DB empty)
//   node seed.js path/to/file.xlsx    → bulk-imports employees from an Excel file
//                                       (columns matching the HRMS employee template)
'use strict';
require('dotenv').config();
const { query, init } = require('./db');
const crypto = require('crypto');

const uid = (p) => p + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const today = () => new Date().toISOString().slice(0, 10);

// Template column label -> field key (matches the frontend EMP_COLS)
const COLMAP = {
  'Employee ID': 'empId', 'Full Name (Passport)': 'name', 'First Name': 'firstName', 'Last Name': 'lastName',
  'Father Name': 'fatherName', 'Passport Number': 'passportNo', 'Gender': 'gender', 'Nationality': 'nationality',
  'Date of Birth': 'dob', 'Contact Number': 'contact', 'Email Address': 'email', 'Collar Type': 'collar',
  'Position': 'position', 'Department': 'department', 'Work Level': 'workLevel', 'Contract Type': 'contractType',
  'Location': 'location', 'Line Manager': 'lineManager', 'Line Manager Email': 'lineManagerEmail',
  'Org Unit': 'orgUnit', 'Agency Name': 'agencyName', 'Recruiter': 'recruiter', 'Joining Date': 'joiningDate',
  'Visa Status': 'visaStatus', 'E-Visa Expiry': 'evisaExpiry', 'Visa Charge Status': 'visaChargeStatus',
  'Basic Salary': 'basicSalary', 'Housing Allowance': 'housingSalary', 'Transport Allowance': 'transportSalary',
  'Food Allowance': 'foodSalary', 'Rider ID': 'riderId', 'Medical Date': 'medicalDate',
  'Biometric Date': 'biometricDate', 'Deployment Date': 'deploymentDate', 'Bank Name': 'bankName', 'IBAN': 'iban',
};

async function upsert(emp) {
  const ex = await query('SELECT id FROM employees WHERE UPPER(empId) = ?', [String(emp.empId).toUpperCase()]);
  const id = ex.rows.length ? ex.rows[0].id : uid('E');
  const full = Object.assign({ id, status: emp.status || 'Active' }, emp);
  if (ex.rows.length) {
    await query('UPDATE employees SET passportNo=?, name=?, email=?, status=?, data=? WHERE id=?',
      [full.passportNo || '', full.name || '', full.email || '', full.status, JSON.stringify(full), id]);
    return 'updated';
  }
  await query('INSERT INTO employees (id, empId, passportNo, name, email, status, data) VALUES (?,?,?,?,?,?,?)',
    [id, full.empId, full.passportNo || '', full.name || '', full.email || '', full.status, JSON.stringify(full)]);
  return 'added';
}

(async () => {
  await init();

  const file = process.argv[2];
  if (file) {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(file);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    let added = 0, updated = 0, skipped = 0;
    for (const raw of rows) {
      const emp = {};
      for (const [label, key] of Object.entries(COLMAP))
        if (raw[label] !== undefined && raw[label] !== '') emp[key] = String(raw[label]).trim();
      // also accept already-keyed columns and custom cf_ fields
      for (const [k, v] of Object.entries(raw))
        if (!COLMAP[k] && v !== '' && !emp[k]) emp[k.startsWith('cf_') ? k : k] = String(v).trim();
      if (!emp.empId || String(emp.empId).match(/required|optional/i)) { skipped++; continue; }
      const r = await upsert(emp);
      r === 'added' ? added++ : updated++;
    }
    console.log(`Import complete: ${added} added, ${updated} updated, ${skipped} skipped (no/invalid Employee ID).`);
    process.exit(0);
  }

  // default seed: sample employees so you can log in and test immediately
  const count = await query('SELECT COUNT(*) AS c FROM employees', []);
  const c = +(count.rows[0].c ?? count.rows[0].count ?? 0);
  if (c === 0) {
    await upsert({ empId: 'SN1366', name: 'Dilpreet Singh Satnam Singh', firstName: 'Dilpreet', lastName: 'Singh',
      passportNo: 'AA254035', gender: 'Male', nationality: 'India', contact: '8360247733',
      email: process.env.TEST_EMPLOYEE_EMAIL || 'dilpreet.test@example.com',
      collar: 'Blue collar', position: 'Delivery Rider', department: 'Fleetco', workLevel: 'L7b',
      contractType: 'full_time', location: 'DXB - HSBC', lineManager: 'Abdul Basit',
      orgUnit: 'nub_fleetco>AE>Manpower', agencyName: 'Synergy', joiningDate: '2025-12-12',
      visaStatus: 'Employment Visa', evisaExpiry: '2026-06-22', riderId: 'DXB-001',
      basicSalary: 2500, housingSalary: 500, transportSalary: 300, foodSalary: 200,
      bankName: 'Mashreq Neo', iban: 'AE070331000000012345678' });
    console.log('Seeded sample employee SN1366 (passport AA254035).');
  } else {
    console.log(`Database already has ${c} employees — nothing to seed.`);
  }
  console.log('Done. Start the server with: npm start');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
