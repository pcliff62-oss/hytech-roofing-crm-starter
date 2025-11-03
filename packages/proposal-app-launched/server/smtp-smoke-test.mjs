
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

const result = dotenv.config({ path: './server/.env' });
if (result.error) {
  console.error('❌ Failed to load .env:', result.error);
} else {
  console.log('✅ .env loaded');
}

console.log('Loaded SMTP config:');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_SECURE:', process.env.SMTP_SECURE);
console.log('SMTP_FROM:', process.env.SMTP_FROM);

const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,            // smtp.ionos.com
  port: Number(process.env.SMTP_PORT),    // 465 or 587
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { minVersion: 'TLSv1.2' },         // important for IONOS
  // requireTLS: true,                    // uncomment if using port 587
});

try {
  console.log('Verifying connection…');
  await t.verify();                       // will throw if ports/TLS/auth are wrong
  console.log('✅ OK: transporter verified');
} catch (e) {
  console.error('❌ Verify failed:', e?.message || e);
}
