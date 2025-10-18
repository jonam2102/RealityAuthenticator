const { spawn } = require('child_process');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SERVER_SCRIPT = path.join(ROOT, 'server.js');
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const USERNAME = process.env.SMOKE_USER || 'ci-smoke';
const PASSWORD = process.env.SMOKE_PASS || 'CiPass!234';
const START_SERVER = !(process.env.SKIP_START === 'true');

async function waitForServer(timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(SERVER_URL + '/');
      if (res.status === 200) return true;
    } catch (e) {
      // server not up yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

function cleanupLocalDb(user) {
  try {
    const usersPath = path.join(ROOT, 'db', 'users.json');
    const sessionsPath = path.join(ROOT, 'db', 'sessions.json');

    if (fs.existsSync(usersPath)) {
      const users = JSON.parse(fs.readFileSync(usersPath, 'utf8') || '{}');
      if (users[user]) {
        delete users[user];
        fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
        console.log('Removed user from users.json');
      }
    }

    if (fs.existsSync(sessionsPath)) {
      const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8') || '{}');
      let removed = 0;
      for (const token of Object.keys(sessions)) {
        if (sessions[token] && sessions[token].username === user) { delete sessions[token]; removed++; }
      }
      if (removed) {
        fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));
        console.log(`Removed ${removed} session(s) for user`);
      }
    }
  } catch (e) { console.warn('Local DB cleanup failed', e); }
}

async function runTest() {
  // register
  let res = await fetch(SERVER_URL + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USERNAME, password: PASSWORD }) });
  if (![200,409].includes(res.status)) throw new Error('Register failed: ' + res.status);

  // login
  res = await fetch(SERVER_URL + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USERNAME, password: PASSWORD }) });
  if (res.status !== 200) throw new Error('Login failed: ' + res.status);
  const data = await res.json();
  const token = data.token;
  if (!token) throw new Error('No token returned');

  // post protected log
  res = await fetch(SERVER_URL + '/log', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': token }, body: JSON.stringify({ type: 'ci-smoke', message: 'ok' }) });
  if (res.status !== 200) throw new Error('Log post failed: ' + res.status);
}

(async () => {
  let server = null;
  try {
    if (START_SERVER) {
      console.log('Starting server for smoke test...');
      server = spawn(process.execPath, [SERVER_SCRIPT], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      server.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
      server.stderr.on('data', d => process.stderr.write(`[server-err] ${d}`));
    } else {
      console.log('SKIP_START=true: not starting server, assuming external service');
    }

    const up = await waitForServer(12000);
    if (!up) {
      console.error('Server did not start in time');
      if (server) server.kill();
      process.exit(2);
    }

    await runTest();
    console.log('Smoke test passed');

    // cleanup local DB entries so CI runs are idempotent
    cleanupLocalDb(USERNAME);

    if (server) server.kill();
    process.exit(0);
  } catch (e) {
    console.error('Smoke test failed', e);
    // attempt cleanup even on failure
    try { cleanupLocalDb(USERNAME); } catch (e2) { /* ignore */ }
    if (server) server.kill();
    process.exit(3);
  }
})();
