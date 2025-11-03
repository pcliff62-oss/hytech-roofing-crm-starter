require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const validatorLib = require('validator');
const nodemailer = require('nodemailer');
const zxcvbn = require('zxcvbn');
// Use global fetch when running on Node 18+. If unavailable, fail with a clear message.
const fetch = (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function')
  ? globalThis.fetch.bind(globalThis)
  : (..._args) => { throw new Error('Global fetch is not available. Please run on Node 18+ or install a compatible fetch polyfill.'); };
const helmet = require('helmet');
const emails = require('./emails');
const alerts = require('./alerts');

const cors = require('cors');
const app = express();
app.use(helmet());
// Allow larger JSON payloads for base64-encoded DOCX exports (default is too small for full documents)
// Allow larger JSON payloads for base64-encoded DOCX exports (default is too small for full documents)
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());
// Allow dev frontend origin and credentials; allow extra live origins via CORS_ORIGINS env var
const extraOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5177',
    'http://localhost:5178',
    ...extraOrigins
  ],
  credentials: true
}));

// Logging
const morgan = require('morgan');
const winston = require('winston');
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Optional CSRF protection (enable by setting ENABLE_CSRF=true)
const ENABLE_CSRF = process.env.ENABLE_CSRF === 'true';
let csurfMiddleware = null;
if (ENABLE_CSRF) {
  const csurf = require('csurf');
  csurfMiddleware = csurf({ cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' } });
  // expose endpoint to fetch token
  app.get('/api/auth/csrf', csurfMiddleware, (req, res) => res.json({ csrfToken: req.csrfToken() }));
}

// Rate limiting (basic) for auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.AUTH_RATE_LIMIT || 100),
  standardHeaders: true, legacyHeaders: false,
  message: 'Too many requests, please try again later.'
});
app.use('/api/auth/', authLimiter);

const DB_PATH = path.join(__dirname, 'data.json');
const USE_PG = !!process.env.DATABASE_URL;
let pg = null;
if (USE_PG) {
  try {
    pg = require('./pg_adapter');
    pg.init().catch((e) => logger.error('PG init failed', e));
    logger.info('Using Postgres for auth storage');
  } catch (e) {
    logger.error('Failed to load pg_adapter, falling back to file DB', e);
  }
}

function readDb() {
  if (USE_PG && pg) return null; // not used when PG active
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeDb(data) {
  if (USE_PG && pg) return; // not used when PG active
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function initDb() {
  if (USE_PG && pg) {
    await pg.init();
    // ensure admin user exists
    const r = await pg.query('SELECT id FROM users WHERE username=$1', ['admin']);
    if (r.rows.length === 0) {
      const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
      const pass = bcrypt.hashSync(process.env.DEV_ADMIN_PASS || 'password', rounds);
      await pg.query('INSERT INTO users(username, password_hash, verified) VALUES($1,$2,true)', ['admin', pass]);
      logger.info('Created demo user: admin (pg)');
    }
    return;
  }
  let data = readDb();
  if (!data) data = { users: [], refresh_tokens: [], lastUserId: 0, lastTokenId: 0 };
  if (!data.users || data.users.length === 0) {
    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const pass = bcrypt.hashSync(process.env.DEV_ADMIN_PASS || 'password', rounds);
    data.users.push({ id: ++data.lastUserId, username: 'admin', password_hash: pass, verified: true });
    logger.info('Created demo user: admin');
  }
  writeDb(data);
}

initDb();

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'dev_access_secret_change_me';
const ACCESS_TOKEN_EXP = process.env.ACCESS_TOKEN_EXP || '15m';
const REFRESH_TOKEN_EXP_SECONDS = Number(process.env.REFRESH_TOKEN_EXP_SECONDS || 60 * 60 * 24 * 14); // 14 days

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXP });
}

function hashToken(token) {
  // simple hash for storage (not reversible). Use bcrypt to make reuse detection costly
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  return bcrypt.hashSync(token, rounds);
}

function insertRefreshToken({ jti, user_id, token, issuedAt, expiresAt, ip, ua }) {
  const tokenHash = hashToken(token);
  if (USE_PG && pg) {
    return pg.query('INSERT INTO refresh_tokens(jti,user_id,token_hash,issued_at,expires_at,ip,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7)', [jti, user_id, tokenHash, issuedAt, expiresAt, ip || null, ua || null]);
  }
  const data = readDb();
  const nextId = (data.lastTokenId || 0) + 1;
  data.refresh_tokens = data.refresh_tokens || [];
  data.refresh_tokens.push({ id: nextId, jti, user_id, token_hash: tokenHash, issued_at: issuedAt, expires_at: expiresAt, revoked: 0, replaced_by_jti: null, last_used_at: null, ip: ip || null, user_agent: ua || null });
  data.lastTokenId = nextId;
  writeDb(data);
}

function findRefreshTokenByJti(jti) {
  if (USE_PG && pg) {
    return pg.query('SELECT * FROM refresh_tokens WHERE jti=$1', [jti]).then((r) => r.rows[0]);
  }
  const data = readDb();
  return (data.refresh_tokens || []).find((r) => r.jti === jti);
}

function revokeRefreshTokenByJti(jti, replacedBy) {
  if (USE_PG && pg) {
    return pg.query('UPDATE refresh_tokens SET revoked=true, replaced_by_jti=$2 WHERE jti=$1', [jti, replacedBy || null]);
  }
  const data = readDb();
  const row = (data.refresh_tokens || []).find((r) => r.jti === jti);
  if (row) {
    row.revoked = 1;
    row.replaced_by_jti = replacedBy || null;
    writeDb(data);
  }
}

function revokeAllForUser(userId) {
  if (USE_PG && pg) return pg.query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [userId]);
  const data = readDb();
  for (const r of (data.refresh_tokens || []).filter((x) => x.user_id === userId)) r.revoked = 1;
  writeDb(data);
}

function matchTokenHash(token, row) {
  if (!row) return false;
  try {
    if (USE_PG && pg) {
      // row.token_hash exists on row
      return bcrypt.compareSync(token, row.token_hash);
    }
    return bcrypt.compareSync(token, row.token_hash);
  } catch (e) {
    return false;
  }
}

function setRefreshCookie(res, token, maxAgeSeconds) {
  res.cookie('refresh', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: (maxAgeSeconds || REFRESH_TOKEN_EXP_SECONDS) * 1000,
  });
}

app.post('/api/auth/login',
  // validation/sanitization
  body('username').trim().isLength({ min: 1 }).escape(),
  body('password').isLength({ min: 1 }),
  async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });
  const { username, password } = req.body;
  let user = null;
  if (USE_PG && pg) {
    const r = await pg.query('SELECT * FROM users WHERE lower(username)=lower($1)', [username]);
    user = r.rows[0];
  } else {
    const data = readDb();
    user = (data && data.users || []).find((u) => String(u.username).toLowerCase() === String(username).toLowerCase());
  }
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  // check lockout
  const now = Date.now();
  if (user.locked_until && Number(user.locked_until) > now) return res.status(423).json({ error: 'Account locked. Try again later.' });
  if (!user.verified) return res.status(403).json({ error: 'Email not verified' });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    // increment failed attempts
    if (USE_PG && pg) {
      try {
        await pg.query('UPDATE users SET failed_attempts = COALESCE(failed_attempts,0) + 1 WHERE id=$1', [user.id]);
        const r2 = await pg.query('SELECT failed_attempts FROM users WHERE id=$1', [user.id]);
        const failed = r2.rows[0].failed_attempts || 0;
        const lockThreshold = Number(process.env.LOCK_THRESHOLD || 5);
        if (failed >= lockThreshold) {
          const lockMs = Number(process.env.LOCK_TIME_MS || 15 * 60 * 1000);
          await pg.query('UPDATE users SET locked_until=$1 WHERE id=$2', [Date.now() + lockMs, user.id]);
          alerts.alertSuspicious('Account locked due to failed attempts', { user: user.username, failed });
        }
      } catch (e) { logger.error('Failed to update failed_attempts', e); }
    } else {
      try {
        const data = readDb();
        const u = (data && data.users || []).find((x) => x.id === user.id);
        u.failed_attempts = (u.failed_attempts || 0) + 1;
        if ((u.failed_attempts || 0) >= Number(process.env.LOCK_THRESHOLD || 5)) {
          u.locked_until = Date.now() + Number(process.env.LOCK_TIME_MS || 15 * 60 * 1000);
          alerts.alertSuspicious('Account locked due to failed attempts', { user: user.username, failed: u.failed_attempts });
        }
        writeDb(data);
      } catch (e) { logger.error('Failed to persist failed_attempts', e); }
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  // reset failed attempts on success
  if (USE_PG && pg) {
    try { await pg.query('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1', [user.id]); } catch (e) { logger.error('Failed to reset failed_attempts', e); }
  } else {
    try {
      const data = readDb();
      const u = (data && data.users || []).find((x) => x.id === user.id);
      if (u) { u.failed_attempts = 0; u.locked_until = null; writeDb(data); }
    } catch (e) { logger.error('Failed to reset failed_attempts', e); }
  }

  const accessToken = signAccessToken(user);
  const refreshToken = uuidv4();
  const jti = uuidv4();
  const expiresAt = now + REFRESH_TOKEN_EXP_SECONDS * 1000;
  await insertRefreshToken({ jti, user_id: user.id, token: refreshToken, issuedAt: now, expiresAt, ip: req.ip, ua: req.get('User-Agent') });
  setRefreshCookie(res, refreshToken, REFRESH_TOKEN_EXP_SECONDS);
  res.json({ accessToken, expiresIn: REFRESH_TOKEN_EXP_SECONDS });
});

// Register new user (dev/demo). Creates a user and returns tokens (auto-login)
// Registration with validation, password strength, uniqueness and optional recaptcha
app.post('/api/auth/register',
  body('username').trim().isLength({ min: 3, max: 254 }).custom((val) => {
    // allow either an email address or a username with safe chars
    if (val.includes('@')) return validatorLib.isEmail(val);
    return /^[A-Za-z0-9_\-\.]+$/.test(val);
  }).withMessage('Invalid username or email'),
  body('password').isLength({ min: 8 }),
  async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

  const { username, password, recaptchaToken } = req.body;
  // Optional recaptcha verification (if RECAPTCHA_SECRET set)
  if (process.env.RECAPTCHA_SECRET) {
    try {
      const resp = await fetch(`https://www.google.com/recaptcha/api/siteverify`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `secret=${encodeURIComponent(process.env.RECAPTCHA_SECRET)}&response=${encodeURIComponent(recaptchaToken || '')}` });
      const jr = await resp.json();
      if (!jr.success || (jr.score && jr.score < 0.3)) return res.status(400).json({ error: 'Captcha verification failed' });
    } catch (e) { return res.status(400).json({ error: 'Captcha verification failed' }); }
  }

  // password strength check
  const strength = zxcvbn(password || '');
  if ((strength.score || 0) < 2) return res.status(400).json({ error: 'Password too weak' });

  // ensure uniqueness
  if (USE_PG && pg) {
    const r = await pg.query('SELECT id FROM users WHERE lower(username)=lower($1)', [username]);
    if (r.rows.length > 0) return res.status(409).json({ error: 'Username already taken' });
    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const passHash = bcrypt.hashSync(password, rounds);
    const ir = await pg.query('INSERT INTO users(username,password_hash,verified) VALUES($1,$2,false) RETURNING id', [username, passHash]);
    const nextId = ir.rows[0].id;
    // continue below with verification email
    user = { id: nextId, username };
  } else {
    const data = readDb();
    const existing = (data && data.users || []).find((u) => String(u.username).toLowerCase() === String(username).toLowerCase());
    if (existing) return res.status(409).json({ error: 'Username already taken' });
    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const passHash = bcrypt.hashSync(password, rounds);
    const nextId = (data.lastUserId || 0) + 1;
    data.users = data.users || [];
    data.users.push({ id: nextId, username, password_hash: passHash, verified: false });
    data.lastUserId = nextId;
    writeDb(data);
    user = { id: nextId, username };
  }

  // send verification email (development: print token to console)
  try {
    const verifyToken = jwt.sign({ sub: user.id, username }, process.env.ACCESS_TOKEN_SECRET || 'dev_access_secret_change_me', { expiresIn: process.env.EMAIL_VERIFY_EXP || '1d' });
    const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const verifyUrl = `${PUBLIC_BACKEND_URL}/api/auth/verify-email?token=${verifyToken}`;
    await emails.sendVerificationEmail(username, verifyUrl, username);
  } catch (e) { console.warn('Failed to send verification email', e); }

  // Return a success message but do not auto-login until verified
  res.json({ ok: true, message: 'Registered. Please verify your email before logging in.' });
});

// Email verification endpoint
app.get('/api/auth/verify-email', async (req, res) => {
  const token = req.query.token;
  if (!token) {
    console.error('Email verification: Missing token');
    return res.status(400).json({ error: 'Missing token' });
  }
  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'dev_access_secret_change_me');
    console.log('Email verification: Token payload:', payload);
    // mark verified and issue a refresh cookie so the user can be auto-logged-in
    let user = null;
    if (USE_PG && pg) {
      const r = await pg.query('SELECT * FROM users WHERE id=$1', [payload.sub]);
      user = r.rows[0];
      if (!user) {
        console.error('Email verification: Invalid token user', payload.sub);
        return res.status(400).json({ error: 'Invalid token user' });
      }
      await pg.query('UPDATE users SET verified=true WHERE id=$1', [payload.sub]);
    } else {
      const data = readDb();
      const u = (data && data.users || []).find((u) => u.id === payload.sub);
      if (!u) {
        console.error('Email verification: Invalid token user', payload.sub);
        return res.status(400).json({ error: 'Invalid token user' });
      }
      u.verified = true;
      writeDb(data);
      user = u;
    }

    // create refresh token and set cookie
    const refreshToken = uuidv4();
    const jti = uuidv4();
    const now = Date.now();
    const expiresAt = now + REFRESH_TOKEN_EXP_SECONDS * 1000;
    await insertRefreshToken({ jti, user_id: payload.sub, token: refreshToken, issuedAt: now, expiresAt, ip: req.ip, ua: req.get('User-Agent') });
    setRefreshCookie(res, refreshToken, REFRESH_TOKEN_EXP_SECONDS);

  // redirect back to frontend; include verified flag so frontend can exchange refresh cookie for access token
  // Default to the production frontend on Vercel; allow override via FRONTEND_ORIGIN env var.
  const redirectBase = process.env.FRONTEND_ORIGIN || 'https://hytech-nine.vercel.app';
  return res.redirect(`${redirectBase}/?verified=1`);
  } catch (e) {
    console.error('Email verification: Invalid or expired token', e);
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  const cookie = req.cookies.refresh;
  if (!cookie) return res.status(401).json({ error: 'No refresh token' });
  const data = readDb();
  const rows = (data.refresh_tokens || []).filter((r) => r.revoked === 0);
  let matched = null;
  for (const r of rows) {
    if (matchTokenHash(cookie, r)) { matched = r; break; }
  }
  if (!matched) {
    console.warn('Refresh token not found or already used — possible reuse');
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
  const now = Date.now();
  if (matched.expires_at < now || matched.revoked) return res.status(401).json({ error: 'Refresh token expired or revoked' });
  const newRefresh = uuidv4();
  const newJti = uuidv4();
  await insertRefreshToken({ jti: newJti, user_id: matched.user_id, token: newRefresh, issuedAt: now, expiresAt: now + REFRESH_TOKEN_EXP_SECONDS * 1000, ip: req.ip, ua: req.get('User-Agent') });
  await revokeRefreshTokenByJti(matched.jti, newJti);
  const data2 = readDb();
  const user = (data2 && data2.users || []).find((u) => u.id === matched.user_id);
  if (!user) return res.status(500).json({ error: 'User not found' });
  const accessToken = signAccessToken(user);
  setRefreshCookie(res, newRefresh, REFRESH_TOKEN_EXP_SECONDS);
  res.json({ accessToken, expiresIn: REFRESH_TOKEN_EXP_SECONDS });
});

// Helper: get user payload from Authorization Bearer token (returns payload or null)
function getUserFromReq(req) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
    return payload; // contains sub and username
  } catch (e) {
    return null;
  }
}

// Persisted saves (per-user) API
// GET /api/saves -> returns saves for the authenticated user
app.get('/api/saves', async (req, res) => {
  try {
    const user = getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Missing or invalid token' });
    const data = readDb() || {};
    const proposals = data.proposals || [];
    const userSaves = proposals.filter((p) => String(p.username).toLowerCase() === String(user.username).toLowerCase());
    return res.json({ saves: userSaves });
  } catch (e) {
    logger.error('Failed to list saves', e);
    return res.status(500).json({ error: 'Failed to list saves' });
  }
});

// POST /api/saves -> create or update a save for the authenticated user
app.post('/api/saves', express.json(), async (req, res) => {
  try {
    const user = getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Missing or invalid token' });
    const { key, payload } = req.body || {};
    if (!key || !payload) return res.status(400).json({ error: 'Missing key or payload' });
    const data = readDb() || { users: [], refresh_tokens: [], lastUserId: 0 };
    data.proposals = data.proposals || [];
    data.lastProposalId = data.lastProposalId || 0;
    // upsert by key+username
    // Trim photos to avoid storing large base64 blobs — store counts instead and keep a small preview if available
    try {
      if (payload && payload.photos && typeof payload.photos === 'object') {
        const photos = payload.photos;
        const counts = Object.fromEntries(Object.keys(photos).map((k) => [k, Array.isArray(photos[k]) ? photos[k].length : 0]));
        payload.photosCount = counts;
        // remove actual photo arrays
        delete payload.photos;
      }
    } catch (e) { /* ignore */ }
    const existing = data.proposals.find((p) => p.key === key && String(p.username).toLowerCase() === String(user.username).toLowerCase());
    if (existing) {
      existing.payload = payload;
      existing.updatedAt = Date.now();
    } else {
      const id = ++data.lastProposalId;
      data.proposals.push({ id, key, username: user.username, payload, createdAt: Date.now(), updatedAt: Date.now() });
    }
    writeDb(data);
    return res.json({ ok: true, key });
  } catch (e) {
    logger.error('Failed to save proposal', e);
    return res.status(500).json({ error: 'Failed to save proposal' });
  }
});

// GET single save by key for authenticated user
app.get('/api/saves/:key', async (req, res) => {
  try {
    const user = getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Missing or invalid token' });
    const key = req.params.key;
    const data = readDb() || {};
    const proposals = data.proposals || [];
    const found = proposals.find((p) => p.key === key && String(p.username).toLowerCase() === String(user.username).toLowerCase());
    if (!found) return res.status(404).json({ error: 'Not found' });
    return res.json({ key: found.key, payload: found.payload, createdAt: found.createdAt, updatedAt: found.updatedAt });
  } catch (e) {
    logger.error('Failed to get save', e);
    return res.status(500).json({ error: 'Failed to get save' });
  }
});

// POST /api/saves/delete -> delete a save by key for authenticated user
app.post('/api/saves/delete', express.json(), async (req, res) => {
  try {
    const user = getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Missing or invalid token' });
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: 'Missing key' });
    const data = readDb() || {};
    data.proposals = (data.proposals || []).filter((p) => !(p.key === key && String(p.username).toLowerCase() === String(user.username).toLowerCase()));
    writeDb(data);
    return res.json({ ok: true });
  } catch (e) {
    logger.error('Failed to delete proposal', e);
    return res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const cookie = req.cookies.refresh;
  if (cookie) {
    const data = readDb();
    const rows = (data.refresh_tokens || []).filter((r) => r.revoked === 0);
    for (const r of rows) {
      if (matchTokenHash(cookie, r)) {
        revokeRefreshTokenByJti(r.jti);
        break;
      }
    }
  }
  res.clearCookie('refresh', { path: '/api/auth' });
  res.json({ ok: true });
});

// Endpoint: email an exported DOCX file
// Accepts JSON: { to, subject, filename, contentBase64 }
app.post('/api/export/email', async (req, res) => {
  try {
    const { to, subject, filename, contentBase64 } = req.body || {};
    if (!to || !contentBase64 || !filename) return res.status(400).json({ error: 'Missing parameters' });

    // Build transporter from environment (reuse emails.js logic)
    const smtpUrl = process.env.SMTP_URL;
    let transporter = null;
    try {
      transporter = nodemailer.createTransport(smtpUrl || {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      // verify SMTP connection before attempting send
      try {
        await transporter.verify();
        logger.info('SMTP transporter verified successfully for export email');
      } catch (vErr) {
        logger.warn('SMTP transporter verification failed', vErr);
        // continue — some providers don't allow verify but send may still succeed
      }
    } catch (e) {
      logger.error('Failed to create transporter for export email', e);
      return res.status(500).json({ error: 'Failed to create SMTP transporter' });
    }

    const buffer = Buffer.from(contentBase64, 'base64');
    const mailOptions = {
      from: process.env.SMTP_FROM || 'no-reply@example.com',
      to,
      subject: subject || `Proposal - ${filename}`,
      text: `Please find attached the proposal: ${filename}`,
      attachments: [
        { filename, content: buffer, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
      ]
    };

    try {
      if (emails.sendWithRetry) {
        await emails.sendWithRetry(mailOptions, transporter, 3);
      } else {
        await transporter.sendMail(mailOptions);
      }
      logger.info('Export email sent', { to, filename });
      return res.json({ ok: true });
    } catch (sendErr) {
      logger.error('Failed to send export email', sendErr);
      return res.status(500).json({ error: 'Failed to send email' });
    }
  } catch (e) {
    logger.error('Failed to send exported docx via email', e);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

// Protected route example
app.get('/api/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
  const data = readDb();
  const user = (data && data.users || []).find((u) => u.id === payload.sub);
  if (!user) return res.status(401).json({ error: 'Invalid token user' });
  res.json({ id: user.id, username: user.username });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`Auth server running on http://localhost:${PORT}`));
