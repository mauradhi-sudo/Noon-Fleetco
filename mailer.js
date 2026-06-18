// Email sender for OTP codes. Uses Resend API when configured, otherwise "dev mode"
// (OTP is returned in the API response so you can test without an email account).
'use strict';
require('dotenv').config();

const configured = !!process.env.SMTP_PASS;
const RESEND_API_KEY = process.env.SMTP_PASS; // API key in SMTP_PASS for Resend

async function sendOtp(to, code) {
  if (!configured) {
    console.log(`[DEV MODE] OTP for ${to}: ${code} (configure SMTP_PASS with Resend API key to send real emails)`);
    return { dev: true };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.SMTP_FROM || 'noreply@noonfleet.com',
        to,
        subject: `${code} is your Noon Fleet HRMS login code`,
        html: `<div style="font-family:Arial,sans-serif;max-width:420px">
          <h2 style="color:#1D9E75">Noon Fleet HRMS</h2>
          <p>Your one-time login code is:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:8px;font-family:monospace">${code}</p>
          <p style="color:#666;font-size:13px">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
        </div>`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Resend API error: ${error.message}`);
    }

    console.log(`[MAIL] OTP sent to ${to}`);
    return { dev: false };
  } catch (e) {
    console.error(`[MAIL] OTP send failed: ${e.message}`);
    // Fallback to dev mode
    console.log(`[DEV MODE FALLBACK] OTP for ${to}: ${code}`);
    return { dev: true };
  }
}

async function sendNotice(to, subject, text) {
  if (!configured || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.SMTP_FROM || 'noreply@noonfleet.com',
        to,
        subject,
        text,
      }),
    });
  } catch (e) { console.warn('notice email failed:', e.message); }
}

module.exports = { sendOtp, sendNotice, configured };
