const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Swagger UI
try {
  const swaggerUi = require('swagger-ui-express');
  const YAML = require('yamljs');
  const spec = YAML.load(path.join(__dirname, 'openapi.yaml'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
  console.log('Swagger UI mounted at /docs');
} catch (e) {
  console.warn('Swagger dependencies not installed yet. Run npm install to enable /docs');
}

const DB_DIR = path.join(__dirname, 'db');
const USERS_FILE = path.join(DB_DIR, 'users.json');
const SESSIONS_FILE = path.join(DB_DIR, 'sessions.json');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'validation.log');

function ensureDirs() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');
  if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, JSON.stringify({}), 'utf8');
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf8');
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); }
function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); }

function hashPassword(password, salt = null) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function createToken() { return crypto.randomBytes(32).toString('hex'); }

// Session TTL in milliseconds (default: 7 days)
const SESSION_TTL = (process.env.SESSION_TTL_MS) ? parseInt(process.env.SESSION_TTL_MS, 10) : 7 * 24 * 60 * 60 * 1000;

ensureDirs();

// Serve static files (index.html, login.html, etc.)
app.use(express.static(path.join(__dirname)));

// Register endpoint
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: 'missing_fields' });

  const users = readJson(USERS_FILE);
  if (users[username]) return res.status(409).json({ ok: false, error: 'user_exists' });

  const { salt, hash } = hashPassword(password);
  // allow optional roles array in registration body (admin provisioning should be protected in prod)
  const roles = Array.isArray(req.body.roles) ? req.body.roles : [];
  users[username] = { salt, hash, roles, createdAt: new Date().toISOString() };
  writeJson(USERS_FILE, users);
  res.json({ ok: true });
});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: 'missing_fields' });

  const users = readJson(USERS_FILE);
  const user = users[username];
  if (!user) return res.status(401).json({ ok: false, error: 'invalid' });

  const { hash } = hashPassword(password, user.salt);
  if (hash !== user.hash) return res.status(401).json({ ok: false, error: 'invalid' });

  const sessions = readJson(SESSIONS_FILE);
  const token = createToken();
  sessions[token] = { username, createdAt: new Date().toISOString() };
  writeJson(SESSIONS_FILE, sessions);

  // append login to flat log too
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} | LOGIN | ${username}\n`);

  res.json({ ok: true, token });
});

function verifyToken(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.token;
  if (!token) return res.status(401).json({ ok: false, error: 'no_token' });
  const sessions = readJson(SESSIONS_FILE);
  const entry = sessions[token];
  if (!entry) return res.status(401).json({ ok: false, error: 'invalid_token' });
  // Enforce TTL
  const created = new Date(entry.createdAt).getTime();
  if (Date.now() - created > SESSION_TTL) {
    // expired - remove the session and return 401
    delete sessions[token];
    writeJson(SESSIONS_FILE, sessions);
    return res.status(401).json({ ok: false, error: 'token_expired' });
  }
  req.sessionUser = entry.username;
  next();
}

// Protected logging endpoint
app.post('/log', verifyToken, (req, res) => {
  const entry = req.body || {};
  entry._user = req.sessionUser;
  entry._ts = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `${entry._ts} | ${JSON.stringify(entry)}\n`);
  res.json({ ok: true });
});

// Logout / revoke session
app.post('/api/logout', verifyToken, (req, res) => {
  try {
    const token = req.headers['x-session-token'];
    const sessions = readJson(SESSIONS_FILE);
    if (sessions[token]) {
      delete sessions[token];
      writeJson(SESSIONS_FILE, sessions);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'logout_failed' }); }
});

// Simple admin guard middleware (for demo: user 'admin' is admin)
function requireAdmin(req, res, next) {
  try {
    const users = readJson(USERS_FILE);
    const u = users[req.sessionUser] || {};
    const roles = Array.isArray(u.roles) ? u.roles : [];
    if (!roles.includes('admin')) return res.status(403).json({ ok: false, error: 'forbidden' });
    next();
  } catch (e) { return res.status(500).json({ ok: false, error: 'server_error' }); }
}

// Admin: read raw logs
app.get('/admin/logs', verifyToken, requireAdmin, (req, res) => {
  try {
    const txt = fs.readFileSync(LOG_FILE, 'utf8');
    res.setHeader('Content-Type', 'text/plain');
    res.send(txt);
  } catch (e) { res.status(500).json({ ok: false, error: 'read_error' }); }
});

// Admin: list users
app.get('/admin/users', verifyToken, requireAdmin, (req, res) => {
  try {
    const users = readJson(USERS_FILE);
    res.json(users);
  } catch (e) { res.status(500).json({ ok: false, error: 'read_error' }); }
});

// Admin: list active sessions
app.get('/admin/sessions', verifyToken, requireAdmin, (req, res) => {
  try {
    const sessions = readJson(SESSIONS_FILE);
    res.json(sessions);
  } catch (e) { res.status(500).json({ ok: false, error: 'read_error' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
