// Google Drive integration (optional). Activates when both env vars are set:
//   GOOGLE_SERVICE_ACCOUNT_JSON  — path to a service-account key file (or the JSON itself)
//   DRIVE_FOLDER_ID              — the Drive folder shared with that service account
// Used for: per-employee document copies + daily database backups.
'use strict';
require('dotenv').config();
const fs = require('fs');

let drive = null;

function configured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.DRIVE_FOLDER_ID);
}

function client() {
  if (drive) return drive;
  if (!configured()) return null;
  let google;
  try { google = require('googleapis').google; }
  catch { console.warn('googleapis not installed — run: npm install googleapis'); return null; }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const creds = raw.trim().startsWith('{') ? JSON.parse(raw) : JSON.parse(fs.readFileSync(raw, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  drive = google.drive({ version: 'v3', auth });
  return drive;
}

// Upload a file buffer; returns a shareable webViewLink or null.
async function uploadFile(name, mimeType, buffer, subfolder) {
  const d = client();
  if (!d) return null;
  try {
    const { Readable } = require('stream');
    const res = await d.files.create({
      requestBody: {
        name: subfolder ? `${subfolder}__${name}` : name,
        parents: [process.env.DRIVE_FOLDER_ID],
      },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id, webViewLink',
    });
    return res.data.webViewLink || null;
  } catch (e) {
    console.warn('Drive upload failed:', e.message);
    return null;
  }
}

async function uploadBackup(jsonString) {
  const stamp = new Date().toISOString().slice(0, 10);
  return uploadFile(`hrms_backup_${stamp}.json`, 'application/json', Buffer.from(jsonString), 'backups');
}

module.exports = { configured, uploadFile, uploadBackup };
