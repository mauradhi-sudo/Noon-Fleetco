// Email sender for OTP codes. Uses SMTP when configured, otherwise "dev mode"
// (OTP is returned in the API response so you can test without an email account).
'use strict';
require('dotenv').config();

let transporter = null;
const configured = !!process.env.SMTP_HOST;

if (configured) {
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: +(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

async function sendOtp(to, code) {
  if (!configured) {
    console.log(`[DEV MODE] OTP for ${to}: ${code} (configure SMTP_* env vars to send real emails)`);
    return { dev: true };
  }
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
}

async function sendNotice(to, subject, text) {
  if (!configured || !to) return;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Noon Fleet HRMS" <${process.env.SMTP_USER}>`,
      to, subject, text,
    });
  } catch (e) { console.warn('notice email failed:', e.message); }
}

module.exports = { sendOtp, sendNotice, configured };
