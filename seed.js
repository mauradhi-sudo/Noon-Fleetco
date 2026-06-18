// Seed / import tool with comprehensive field support
//   node seed.js                      → ensures super admin + adds sample employees (if DB empty)
//   node seed.js path/to/file.xlsx    → bulk-imports employees from Excel file
'use strict';
require('dotenv').config();
const { query, init } = require('./db');
const crypto = require('crypto');

const uid = (p) => p + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const today = () => new Date().toISOString().slice(0, 10);

// Comprehensive column mapping from your data sheet to field keys
const COLMAP = {
  // Identification
  'Employee ID': 'empId',
  'Full Name (Passport)': 'name',
  'First Name': 'firstName',
  'Last Name': 'lastName',
  'Father Name': 'fatherName',
  'Passport Number': 'passportNo',
  'Date of Birth': 'dob',
  'Gender': 'gender',
  'Nationality': 'nationality',
  'Contact Number': 'contact',
  'Contact number': 'contact',
  'Email Address': 'email',

  // Employment Details
  'WHITE/BLUE COLLAR': 'collar',
  'Collar Type': 'collar',
  'POSITION': 'position',
  'Position': 'position',
  'Work Level': 'workLevel',
  'Contract Type': 'contractType',
  'Contract Start Date (For Temp/Intern)': 'contractStartDate',
  'Contract End Date (For Temp/Intern)': 'contractEndDate',
  'Joining Date': 'joiningDate',
  'Official Joining Date with payrol': 'joiningDate',
  'Tentative Joining date': 'tentativeJoiningDate',
  'Tentative Joining Date ONB Team': 'tentativeJoiningDate',
  'Status': 'status',
  'Candidate Status': 'status',

  // Organization
  'Department': 'department',
  'Location': 'location',
  'Select from list': 'location',
  'Line Manager Name': 'lineManager',
  'Line Manager Email Address': 'lineManagerEmail',
  'Org Unit': 'orgUnit',
  'Nub Details': 'nubDetails',
  'Agency Name': 'agencyName',
  'Recruiter': 'recruiter',
  'Recruiter Company Name': 'recruiterCompanyName',
  'Overseas / Local (type of hire)': 'hireType',

  // Visa & Immigration
  'Current Visa Status (drop down same as previous tracker)': 'visaStatus',
  'Current Visa Status': 'visaStatus',
  'If on Visit Visa- Expiry Date': 'evisaExpiry',
  'E-Visa Expiry': 'evisaExpiry',
  'E-visa Expiry Date': 'evisaExpiry',
  'Evisa Expiry Date': 'evisaExpiry',
  'Visa Title': 'visaTitle',
  'Visa Charge Status': 'visaChargeStatus',
  'Evisa Date-': 'evisaDate',
  'Relocation Required (Y/N)': 'relocationRequired',
  'Required to travel to KSA for business trip': 'travelToKSA',

  // Onboarding & Process
  'ONB Reprsentative': 'onbRepresentative',
  'ONB Call Date': 'onbCallDate',
  'ONB Form Filled Saved in the file (Yes/No)': 'onbFormFilled',
  'Handover to ONB Date': 'handoverToONBDate',
  'Handover to ONB Month': 'handoverToONBMonth',
  'Docs Received Date': 'docsReceivedDate',
  'Employment contract sent date': 'employmentContractSentDate',
  'Employment contract accepted date': 'employmentContractAcceptedDate',
  'Employment offer Rejected/Retracted date': 'employmentOfferRejectedDate',
  'Status Change Completion Date': 'statusChangeCompletionDate',
  'Current Status': 'currentStatus',

  // Government/MOHRE
  'Request for MOHRE JO- Date - ONB Team': 'requestForMOHREJODate',
  'MOHRE JO Received- Date - ONB Team': 'mohreJOReceivedDate',
  'MOHRE JO Signed- Date- ONB Team': 'mohreJOSignedDate',
  'Labor Approval Date- ONB Team': 'laborApprovalDate',
  'MOL Person Code': 'molPersonCode',

  // Medical & EID
  'Medical Test Date - Riyas': 'medicalDate',
  'Medical Insurance - Enrollment Date': 'medicalInsuranceEnrollmentDate',
  'Medical Insurance Card Received Date': 'medicalInsuranceCardReceivedDate',
  'EID Application + biometrics -Riyas': 'eidApplicationDate',
  'E-residency received date Date': 'eresidencyReceivedDate',
  'EID Received Date': 'eidReceivedDate',
  'EID Dispatch Date': 'eidDispatchDate',
  'Passport Received Date- Admin team': 'passportReceivedDate',

  // Biometric & Documents
  'Biometric Date': 'biometricDate',
  'MyZoi Cards - Request Date': 'myzoiCardsRequestDate',
  'MyZoi Cards - Dispatch Date': 'myzoiCardsDispatchDate',

  // Salary & Banking
  'Basic Salary': 'basicSalary',
  'Housing Allowance': 'housingSalary',
  'Transport Allowance': 'transportSalary',
  'Food Allowance': 'foodSalary',
  'muskan- food allowance': 'foodSalary',
  'Bank Name': 'bankName',
  'IBAN': 'iban',

  // Travel & Logistics
  'Tawjeeh Contract submission date (FleetCo team)': 'tawjeehContractSubmissionDate',
  'Labor card & contract - Generated / Saved date (FleetCo team)': 'laborCardGeneratedDate',
  'ILOE Registration Completed Date (FleetCo team)': 'iloeRegistrationDate',
  'Travel Date': 'travelDate',
  'Travel from': 'travelFrom',
  'Travel Booked': 'travelBooked',
  'Airline': 'airline',
  'Arrival Airport': 'arrivalAirport',
  'Arrival Time': 'arrivalTime',
  'Accommodation Camp': 'accommodationCamp',
  'Accommodation Arrival Date': 'accommodationArrivalDate',
  'Driving School': 'drivingSchool',
  'Driving School Start Date': 'drivingSchoolStartDate',
  'Drive name': 'driveName',

  // Other
  'Rehire': 'rehire',
  'Induction Date': 'induction',
  'Deployment Date': 'deploymentDate',
  'Rider ID': 'riderId',
  'TA comments': 'taComments',
  'Remarks': 'remarks',
  'Comments/EID Numbers': 'commentsEidNumbers',
  'Joined': 'joined',
  'DOB': 'dob',
  'Rehire': 'rehire',
  'ONB Status': 'onbStatus',
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

      // Map known columns using COLMAP
      for (const [label, key] of Object.entries(COLMAP)) {
        if (raw[label] !== undefined && raw[label] !== '') {
          emp[key] = String(raw[label]).trim();
        }
      }

      // Also accept already-keyed columns and custom fields
      for (const [k, v] of Object.entries(raw)) {
        if (!COLMAP[k] && v !== '' && !emp[k]) {
          // Accept custom fields that start with cf_ or direct field names
          const fieldKey = k.startsWith('cf_') ? k : k.replace(/\s+/g, '_').toLowerCase();
          if (!emp[fieldKey]) emp[fieldKey] = String(v).trim();
        }
      }

      if (!emp.empId || String(emp.empId).match(/required|optional/i)) {
        skipped++;
        continue;
      }

      const r = await upsert(emp);
      r === 'added' ? added++ : updated++;
    }

    console.log(`\nImport complete: ${added} added, ${updated} updated, ${skipped} skipped (no/invalid Employee ID).`);
    process.exit(0);
  }

  // Default seed: sample employees so you can log in and test immediately
  const count = await query('SELECT COUNT(*) AS c FROM employees', []);
  const c = +(count.rows[0].c ?? count.rows[0].count ?? 0);

  if (c === 0) {
    // Sample with all comprehensive fields
    await upsert({
      empId: 'SN1366',
      name: 'Dilpreet Singh Satnam Singh',
      firstName: 'Dilpreet',
      lastName: 'Singh',
      passportNo: 'AA254035',
      gender: 'Male',
      nationality: 'India',
      dob: '1990-05-15',
      contact: '971501234567',
      email: process.env.TEST_EMPLOYEE_EMAIL || 'dilpreet.test@example.com',
      collar: 'Blue Collar',
      position: 'Delivery Rider',
      workLevel: 'L7b',
      contractType: 'full_time',
      department: 'Fleetco',
      location: 'DXB - HSBC',
      lineManager: 'Abdul Basit',
      lineManagerEmail: 'abdul.basit@noon.com',
      orgUnit: 'nub_fleetco>AE>Manpower',
      agencyName: 'Synergy',
      recruiter: 'HR Team',
      hireType: 'Local',
      joiningDate: '2025-12-12',
      tentativeJoiningDate: '2025-12-10',
      visaStatus: 'Employment Visa',
      evisaExpiry: '2026-06-22',
      riderId: 'DXB-001',
      basicSalary: 2500,
      housingSalary: 500,
      transportSalary: 300,
      foodSalary: 200,
      bankName: 'Mashreq Neo',
      iban: 'AE070331000000012345678',
      status: 'Active',
    });

    console.log('✓ Seeded sample employee SN1366 (passport AA254035).');

    // ── Sample accommodation: camps, rooms, and one bed allocation ──
    const campIds = {};
    for (const cname of ['Al Quoz', 'Sonapur', 'DIP', 'Jebel Ali']) {
      const cid = uid('C');
      campIds[cname] = cid;
      await query('INSERT INTO camps (id, name, data) VALUES (?, ?, ?)',
        [cid, cname, JSON.stringify({ createdAt: today() })]);
    }

    const roomDefs = [
      { camp: 'Al Quoz', building: 'A', floor: '1', roomNo: '101', capacity: 4 },
      { camp: 'Al Quoz', building: 'A', floor: '1', roomNo: '102', capacity: 6 },
      { camp: 'Sonapur', building: 'B', floor: '2', roomNo: '201', capacity: 4 },
    ];
    const roomIds = {};
    for (const rd of roomDefs) {
      const rid = uid('R');
      roomIds[rd.camp + '/' + rd.roomNo] = rid;
      await query('INSERT INTO acc_rooms (id, campId, building, floor, roomNo, capacity, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [rid, campIds[rd.camp], rd.building, rd.floor, rd.roomNo, rd.capacity,
         JSON.stringify({ building: rd.building, floor: rd.floor, createdAt: today() })]);
    }

    // Allocate SN1366 → Al Quoz / Room 101 / Bed 1, check-in 12-Jun-2026
    const sn = await query('SELECT id FROM employees WHERE empId = ?', ['SN1366']);
    if (sn.rows.length) {
      await query('INSERT INTO bed_allocations (id, employeeId, campId, roomId, bed, checkIn, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uid('B'), sn.rows[0].id, campIds['Al Quoz'], roomIds['Al Quoz/101'], '1', '2026-06-12',
         JSON.stringify({ checkIn: '2026-06-12' })]);
    }

    console.log('✓ Seeded 4 camps, 3 rooms, and 1 bed allocation (SN1366 → Al Quoz 101, Bed 1).');

    // ── Sample fleet assets: bikes + SIM cards (one of each assigned to SN1366) ──
    const plus = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
    const snRow = await query('SELECT id FROM employees WHERE empId = ?', ['SN1366']);
    const snId = snRow.rows.length ? snRow.rows[0].id : null;
    const assetSeed = [
      { type: 'bike', code: 'BIKE001', name: '', status: snId ? 'Assigned' : 'Available', to: snId, data: { plateNo: 'DXB 12345', chassisNo: 'MLHJC4110', engineNo: 'JC41E', brand: 'Honda', model: 'CB125F', registrationExpiry: plus(20), insuranceExpiry: plus(75) } },
      { type: 'bike', code: 'BIKE002', name: '', status: 'Maintenance', to: null, data: { plateNo: 'DXB 12346', brand: 'Honda', model: 'CB125F', registrationExpiry: plus(120), insuranceExpiry: plus(8) } },
      { type: 'bike', code: 'BIKE003', name: '', status: 'Available', to: null, data: { plateNo: 'DXB 12347', brand: 'Yamaha', model: 'NMAX', registrationExpiry: plus(200), insuranceExpiry: plus(210) } },
      { type: 'sim', code: 'SIM001', name: '', status: snId ? 'Assigned' : 'Available', to: snId, data: { number: '971501234567', provider: 'Du', puk: '12345678', remarks: '' } },
      { type: 'sim', code: 'SIM002', name: '', status: 'Available', to: null, data: { number: '971501234568', provider: 'Etisalat', puk: '87654321', remarks: '' } },
    ];
    for (const a of assetSeed) {
      const data = Object.assign({}, a.data, { createdAt: today() });
      await query('INSERT INTO assets (id, type, code, name, status, assignedTo, assignedDate, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uid('AS'), a.type, a.code, a.name, a.status, a.to, a.to ? today() : null, JSON.stringify(data)]);
    }
    console.log('✓ Seeded 3 bikes + 2 SIM cards (BIKE001 & SIM001 assigned to SN1366).');
  } else {
    console.log(`✓ Database already has ${c} employees — nothing to seed.`);
  }

  console.log('\n✓ Done. Start the server with: npm start\n');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
