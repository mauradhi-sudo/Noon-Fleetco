# Noon Fleet HRMS — Production System

The real, multi-user HRMS: central database, email OTP login, file uploads, Google Drive backups.
The web app (in `public/`) is the same interface you approved in the prototype — now talking to a real server.

## Run it locally (5 minutes, nothing to configure)

Requires Node.js 22.5+ (nodejs.org).

```bash
cd noonfleet-hrms-server
npm install
node seed.js        # creates the super admin + one sample employee
npm start           # → http://localhost:3000
```

With no configuration it runs in **dev mode**: a local SQLite database, and OTP codes are
printed in the server window instead of emailed — so you can test the whole system immediately.

Logins after seeding:
- **Main admin:** mauradhi@noon.com → OTP appears in the server console
- **Sample employee:** SN1366 / AA254035 → OTP in console

## Import your real employees

Use your existing Excel files (the HRMS employee template format — same columns as the
template downloaded from Bulk Import):

```bash
node seed.js "C:\path\to\NoonFleet_Employee_Template.xlsx"
```

Rows are matched by Employee ID — existing employees are updated, new ones added.
You can also import from inside the app: Bulk Import → Employee Import.

## Going live — checklist

1. **Hosting** (Railway.app or Render.com, ~$10–25/month):
   - Create account → New Project → "Deploy from GitHub" (push this folder to a private repo)
     or use their CLI to upload directly.
   - Add a **PostgreSQL** database in the same project; copy its URL into `DATABASE_URL`.
   - Set the environment variables below in the dashboard.
   - Railway/Render give you an `https://...` URL automatically; add your own domain
     (e.g. `hrms.yourcompany.com`) in their settings when ready.

2. **Email OTP** — copy `.env.example` to `.env` (locally) or set as env vars (hosting):
   - Gmail: enable 2-step verification → create an **App Password** → use as `SMTP_PASS`
     with `SMTP_HOST=smtp.gmail.com`, `SMTP_USER=your@gmail.com`.
   - Once SMTP is set, real 6-digit codes are emailed; dev mode switches off automatically.

3. **Google Drive** (documents + nightly backups):
   - console.cloud.google.com → create project → enable **Google Drive API**
   - Create a **Service Account**, download its JSON key
   - Create a Drive folder, **share it with the service account's email** (Editor)
   - Set `GOOGLE_SERVICE_ACCOUNT_JSON` (path to the key) and `DRIVE_FOLDER_ID`
   - Run `npm install googleapis` once.
   - Every uploaded document is then copied to Drive, and a full backup is uploaded daily
     at 3 AM (also kept locally in `data/backups/`). Super admin can trigger one any time
     via POST `/api/backup`.

4. **Security notes**
   - All permissions are enforced server-side (an employee can only ever read their own
     leaves, payslips, documents and notifications, regardless of what the browser asks for).
   - Sessions are JWT, 12-hour expiry. OTPs are 6 digits, single-use, 10-minute expiry.
   - Set `SUPER_ADMIN_EMAIL` before first start (defaults to mauradhi@noon.com).
   - Keep `.env` and `service-account.json` out of any public repo.

## Environment variables

See `.env.example` for the full annotated list:
`PORT`, `DATABASE_URL`, `SUPER_ADMIN_EMAIL`, `SMTP_HOST/PORT/USER/PASS/FROM`,
`HR_NOTIFY_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `DRIVE_FOLDER_ID`, `BACKUP_CRON`, `JWT_SECRET`.

## What's where

| File | Purpose |
|---|---|
| `server.js` | All API routes, auth, permissions, daily backup cron |
| `db.js` | Database layer — PostgreSQL (`DATABASE_URL`) or built-in SQLite |
| `mailer.js` | OTP + notification emails (SMTP or dev mode) |
| `drive.js` | Google Drive uploads (optional) |
| `seed.js` | Super admin setup + Excel employee import |
| `public/index.html` | The web app (your approved frontend, production build) |
| `data/` | SQLite DB, uploaded files, local backups (auto-created; back this up if not on Postgres) |
