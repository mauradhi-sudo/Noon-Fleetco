// Email sender for OTP codes. Uses SMTP when fully configured, otherwise "dev mode"
// (OTP is returned in the API response so you can test without an email account).
'use strict';
require('dotenv').config();

let transporter = null;

// SMTP is only "configured" if ALL required vars are present
// This ensures dev mode works even if some SMTP vars are set
const configured = !!(
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS
);

if (configured) {
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: +(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      connectionTimeout: 5000,
      socketTimeout: 5000,
    });
  } catch (e) {
    console.warn('[MAIL] Failed to initialize SMTP:', e.message);
  }
}

async function sendOtp(to, code) {
  // Always use dev mode if not fully configured
  if (!configured || !transporter) {
    console.log(`\n✓ [DEV MODE] OTP for ${to}: ${code}`);
    console.log(`  (To send real emails, set SMTP_HOST, SMTP_USER, SMTP_PASS in .env)\n`);
    return { dev: true };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Noon Fleet HRMS" <${process.env.SMTP_USER}>`,
      to,
      subject: `${code} is your Noon Fleet HRMS login code`,
      text: `Your one-time login code is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.\n\nNoon Fleet HR Team`,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px">
        <h2 style="color:#1D9E75">Noon Fleet HRMS</h2>
        <p>Your one-time login code is:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;font-family:monospace">${code}</p>
        <p style="color:#666;font-size:13px">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>`,
    });
    return { dev: false };
  } catch (e) {
    console.warn(`[MAIL] OTP send failed: ${e.message}`);
    // Fall back to dev mode on SMTP error
    console.log(`✓ [DEV MODE FALLBACK] OTP for ${to}: ${code}\n`);
    return { dev: true };
  }
}

async function sendNotice(to, subject, text) {
  if (!configured || !transporter || !to) return;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Noon Fleet HRMS" <${process.env.SMTP_USER}>`,
      to, subject, text,
    });
  } catch (e) {
    console.warn(`[MAIL] Notice email failed: ${e.message}`);
  }
}

module.exports = { sendOtp, sendNotice, configured };
