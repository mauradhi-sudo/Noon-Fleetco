# ── Noon Fleet HRMS — environment configuration ──────────────────
# Copy this file to ".env" and fill in what you have.
# Everything is OPTIONAL for local testing: with no .env at all, the app runs
# with a local SQLite database and "dev mode" OTPs printed in the server log.

# Server
PORT=3000
SUPER_ADMIN_EMAIL=mauradhi@noon.com
SUPER_ADMIN_NAME=Super Admin
# JWT_SECRET=generate-a-long-random-string          # auto-generated if omitted

# Database — leave empty to use built-in SQLite (fine for pilot).
# For production use PostgreSQL (Railway/Render give you this URL):
# DATABASE_URL=postgres://user:pass@host:5432/hrms

# Email (OTP codes + notifications). Example: Gmail with an App Password.
# Without these, OTPs are shown in the server log instead (dev mode).
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=hr@yourcompany.com
# SMTP_PASS=your-gmail-app-password
# SMTP_FROM="Noon Fleet HRMS" <hr@yourcompany.com>
# HR_NOTIFY_EMAIL=hr@yourcompany.com                # gets a copy of new leave requests

# Google Drive (documents copy + daily backups)
# 1. console.cloud.google.com → create project → enable "Google Drive API"
# 2. Create a Service Account → download its JSON key
# 3. Create a Drive folder, share it with the service account's email (Editor)
# GOOGLE_SERVICE_ACCOUNT_JSON=./service-account.json
# DRIVE_FOLDER_ID=the-folder-id-from-its-url

# Daily backup time (cron format, server time). Default 03:00.
# BACKUP_CRON=0 3 * * *
