const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SERVER = process.env.SERVER || 'http://localhost:3000';
const testUser = 'test-runner';
const testPass = 'TestPass!234';

async function run() {
  // register
  let res = await fetch(SERVER + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: testUser, password: testPass }) });
  if (![200,409].includes(res.status)) throw new Error('register failed ' + res.status);

  // login
  res = await fetch(SERVER + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: testUser, password: testPass }) });
  if (res.status !== 200) throw new Error('login failed ' + res.status);
  const d = await res.json();
  const token = d.token;
  if (!token) throw new Error('no token');

  // post log
  res = await fetch(SERVER + '/log', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': token }, body: JSON.stringify({ type: 'test', message: 'ok' }) });
  if (res.status !== 200) throw new Error('log post failed ' + res.status);

  // logout
  res = await fetch(SERVER + '/api/logout', { method: 'POST', headers: { 'x-session-token': token } });
  if (res.status !== 200) throw new Error('logout failed ' + res.status);

  console.log('tests passed');
}

run().catch(e => { console.error('tests failed', e); process.exit(1); });
