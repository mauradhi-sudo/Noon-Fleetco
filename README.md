# NOON FLEET HRMS - Complete Unified System

Complete Employee, Payroll, Asset, Accommodation, and Document Management System.

## Quick Start (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Database
- Create PostgreSQL database on Render
- Run: `DATABASE-MIGRATIONS.sql`

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 4. Start Server
```bash
npm start
```

Server runs on: http://localhost:10000

## Access Portals

- **Admin Portal:** http://localhost:10000/admin-portal.html
- **Employee Portal:** http://localhost:10000/employee-portal.html

## Default Credentials

**Admin:**
- Email: mauradhi@noon.com
- Password: (set in database)

**Employee:**
- Employee ID: (from database)
- Passport Number: (from database)

## Features

### Employee Management
- Add/edit/delete employees
- View employee profiles
- Bulk import from Excel
- Export to PDF/Excel

### Leave Management
- Apply for leaves
- Admin approval workflow
- Leave balance tracking
- Reports

### Payroll
- Create payslips
- Calculate net salary
- Export payslips
- Payroll reports

### Asset Management (NEW)
- Add bikes, SIMs, accessories
- Assign to employees
- Track maintenance & expiry
- Assignment history
- Duplicate prevention

### Accommodation Management (NEW)
- Create camps & rooms
- Assign rooms to employees
- Check-in/check-out workflow
- Occupancy tracking
- No double booking

### Document Storage (NEW)
- Upload documents
- Import from Google Drive
- Set expiry dates
- Track missing documents
- Category management

### Exit Request Workflow (NEW)
- Employee submits request
- Admin approves/rejects
- Checkout confirmation
- Full audit trail

### Notifications
- System-wide alerts
- Asset assignments
- Room assignments
- Leave status updates
- Document expiry alerts

### Reports
- Employee reports
- Leave reports
- Asset inventory
- Occupancy reports
- All downloadable

## API Endpoints

### Authentication
- `POST /api/auth/login` - Employee login
- `POST /api/auth/admin-login` - Admin login

### Employees
- `GET /api/employees` - List employees
- `POST /api/employees` - Create employee
- `GET /api/employees/me` - Get my profile

### Leaves
- `GET /api/leaves` - List leaves
- `POST /api/leaves` - Apply for leave
- `PATCH /api/leaves/:id/approve` - Approve leave

### Payroll
- `GET /api/payslips` - List payslips
- `POST /api/payslips` - Create payslip

### Assets
- `GET /api/assets` - List assets
- `POST /api/assets` - Create asset
- `POST /api/assets/:id/assign` - Assign asset
- `POST /api/assets/:id/return` - Return asset
- `GET /api/assets/employee/:empId` - My assets

### Accommodation
- `GET /api/accommodation/camps` - List camps
- `POST /api/accommodation/camps` - Create camp
- `GET /api/accommodation/rooms/:campId` - List rooms
- `POST /api/accommodation/rooms` - Create room
- `POST /api/accommodation/assign` - Assign room
- `GET /api/accommodation/employee/:empId` - My accommodation

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents/upload` - Upload document
- `GET /api/documents/:id/download` - Download document

### Exit Requests
- `POST /api/exit-request` - Submit exit request
- `GET /api/exit-requests` - List pending requests
- `PATCH /api/exit-requests/:id/approve` - Approve/reject

### Notifications
- `GET /api/notifications` - List notifications
- `PATCH /api/notifications/:id/read` - Mark as read

### Dashboard
- `GET /api/dashboard` - Dashboard metrics
- `GET /api/health` - System health

## Deployment

### To Render

1. Push to GitHub
2. Connect repository to Render
3. Set environment variables in Render
4. Deploy

Auto-deploys on every git push.

### Environment Variables (Render)
```
PORT=10000
DATABASE_URL=<your-postgresql-url>
JWT_SECRET=<your-secret-key>
SUPER_ADMIN_EMAIL=mauradhi@noon.com
```

## Database Schema

### Tables
- employees
- leaves
- payslips
- assets
- assetAssignments
- assetHistory
- camps
- subdivisions
- rooms
- roomAssignments
- documents
- documentCategories
- notifications
- importLogs
- exitRequests
- admins

See: DATABASE-MIGRATIONS.sql

## Features in Detail

### Asset Management
- **Bikes:** Registration date, insurance expiry, maintenance schedule
- **SIM Cards:** Provider, plan, expiry date, renewal tracking
- **Accessories:** Helmet, gloves, etc. with quantity tracking
- **Assignment:** One asset per employee, no duplicates
- **History:** Full assignment/return history
- **Notifications:** Asset assignment/return alerts

### Accommodation
- **Hierarchy:** Camps → Subdivisions → Rooms
- **Unique Assignment:** One employee per room, no double booking
- **Check-in/Check-out:** Full workflow tracking
- **Exit Request:** Request → Approval → Checkout
- **Occupancy:** Real-time occupancy tracking
- **Reports:** Occupancy and capacity reports

### Documents
- **Upload:** Direct upload with categorization
- **Google Drive:** Import & keep synced
- **Expiry Tracking:** Set & track expiry dates
- **Missing Documents:** Report missing documents
- **Categories:** Passport, Visa, Medical, Bank, etc.
- **Notifications:** Expiry alerts for documents

## Support

For issues, check:
1. Database migrations ran successfully
2. Environment variables set correctly
3. API endpoints responding (/api/health)
4. Browser console for errors (F12)

## Development

```bash
# Install
npm install

# Run
npm start

# Stop
Ctrl+C
```

## License

All Rights Reserved - NOON Fleet

## Version
1.0.0 - Production Ready ✅
