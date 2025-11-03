require('dotenv').config({ path: __dirname + '/.env' });
const nodemailer = require('nodemailer');
const winston = require('winston');
const logger = winston.createLogger({ level: process.env.LOG_LEVEL || 'info', transports: [new winston.transports.Console()] });

async function sendWithRetry(mailOptions, transporter, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      if (!transporter) throw new Error('No transporter');
      await transporter.sendMail(mailOptions);
      return true;
    } catch (e) {
      lastErr = e;
      logger.warn('Email send attempt failed', e);
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

function makeVerifyHtml(verifyUrl, username) {
  return `<!doctype html><html><body><p>Hello ${username},</p><p>Please verify your email by clicking the link below:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>If you did not register, you can ignore this message.</p></body></html>`;
}

async function sendVerificationEmail(to, verifyUrl, username) {
  const smtpUrl = process.env.SMTP_URL;
  let transporter = null;
  if (smtpUrl || process.env.SMTP_HOST) {
    try {
      transporter = nodemailer.createTransport(smtpUrl || {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      logger.info('SMTP transporter created with config:', {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER
      });
    } catch (e) {
      logger.error('Failed to create transporter', e);
      throw new Error('SMTP transporter could not be created. Check your .env config.');
    }
  } else {
    throw new Error('SMTP config missing. Please set SMTP_HOST and related variables in .env.');
  }

  const mail = {
    from: process.env.SMTP_FROM || 'no-reply@example.com',
    to,
    subject: 'Verify your email',
    text: `Please verify: ${verifyUrl}`,
    html: makeVerifyHtml(verifyUrl, username),
  };

  try {
    await sendWithRetry(mail, transporter, 3);
    logger.info('Verification email sent to', to);
    return true;
  } catch (e) {
    logger.error('Failed to send verification email after retries', e);
    logger.error('SMTP config used:', {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER
    });
    throw e;
  }
}

module.exports = { sendVerificationEmail, makeVerifyHtml, sendWithRetry };
