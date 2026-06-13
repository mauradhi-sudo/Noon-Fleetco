// Email sender for OTP codes — pure SMTP via nodemailer
'use strict';
require('dotenv').config();
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || `Noon Fleet HRMS <${SMTP_USER}>`;
// secure=true for port 465 (SSL), false for 587 (STARTTLS)
const SMTP_SECURE = SMTP_PORT === 465 ? true : (process.env.SMTP_SECURE === 'true');

const configured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

function createTransporter() {
    return nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_SECURE,
          auth: {
                  user: SMTP_USER,
                  pass: SMTP_PASS,
          },
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 20000,
          tls: {
                  rejectUnauthorized: false,
          },
    });
}

async function sendOtp(to, otp) {
    if (!configured) {
          console.log(`[DEV] OTP for ${to}: ${otp}`);
          return;
    }
    const transporter = createTransporter();
    const mailOptions = {
          from: SMTP_FROM,
          to,
          subject: 'Your Login OTP - Noon Fleet HRMS',
          text: `Your one-time login code is: ${otp}\n\nThis code expires in 10 minutes.`,
          html: `
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
                        <h2 style="color:#1a1a2e">Noon Fleet HRMS Login</h2>
                                <p>Your one-time login code is:</p>
                                        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#e94560;margin:16px 0">${otp}</div>
                                                <p style="color:#666">This code expires in 10 minutes. Do not share it with anyone.</p>
                                                      </div>`,
    };
    try {
          const info = await transporter.sendMail(mailOptions);
          console.log(`OTP sent to ${to}: ${info.messageId}`);
    } catch (err) {
          console.error('SMTP sendOtp failed:', err.message);
          throw err;
    }
}

async function sendNotice(to, subject, html) {
    if (!configured) {
          console.log(`[DEV] Notice to ${to}: ${subject}`);
          return;
    }
    const transporter = createTransporter();
    try {
          await transporter.sendMail({ from: SMTP_FROM, to, subject, html });
            } catch (err) {
          console.error('SMTP sendNotice failed:', err.message);
          throw err;
    }
}

module.exports = { sendOtp, sendNotice, configured };
