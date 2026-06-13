// Email sender for OTP codes.
// Uses Resend API (RESEND_API_KEY) when configured, otherwise falls back to SMTP or dev mode.
'use strict';
require('dotenv').config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SMTP_HOST = process.env.SMTP_HOST;
const configured = !!(RESEND_API_KEY || SMTP_HOST);

async function sendViaResend(to, subject, text, html) {
  const from = process.env.SMTP_FROM || 'Noon Fleet HRMS <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Resend API error ' + res.status + ': ' + err);
  }
}

let transporter = null;
if (!RESEND_API_KEY && SMTP_HOST) {
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: +(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

async function sendOtp(to, code) {
  if (!configured) {
    console.log('[DEV MODE] OTP for ' + to + ': ' + code + ' (set RESEND_API_KEY to send real emails)');
    return { dev: true };
  }
  const subject = code + ' is your Noon Fleet HRMS login code';
  const text = 'Your one-time login code is: ' + code + '\n\nIt expires in 10 minutes.\n\nNoon Fleet HR Team';
  const html = '<div style="font-family:Arial,sans-serif;max-width:420px"><h2 style="color:#1D9E75">Noon Fleet HRMS</h2><p>Your one-time login code is:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px;font-family:monospace">' + code + '</p><p style="color:#666;font-size:13px">Expires in 10 minutes.</p></div>';
  try {
    if (RESEND_API_KEY) {
      await sendViaResend(to, subject, text, html);
    } else {
      const from = process.env.SMTP_FROM || '"Noon Fleet HRMS" <' + process.env.SMTP_USER + '>';
      await transporter.sendMail({ from, to, subject, text, html });
    }
  } catch (e) {
    console.error('sendOtp failed:', e.message);
    throw new Error('Failed to send login code email. Please try again later.');
  }
  return { dev: false };
}

async function sendNotice(to, subject, text) {
  if (!configured || !to) return;
  try {
    if (RESEND_API_KEY) {
      await sendViaResend(to, subject, text, text);
    } else {
      const from = process.env.SMTP_FROM || '"Noon Fleet HRMS" <' + process.env.SMTP_USER + '>';
      await transporter.sendMail({ from, to, subject, text });
    }
  } catch (e) { console.warn('notice email failed:', e.message); }
}

module.exports = { sendOtp, sendNotice, configured };
