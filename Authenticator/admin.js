async function apiGet(path, token) {
  const res = await fetch(path, { headers: { 'x-session-token': token } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return text; }
}

function renderJson(preEl, obj) {
  if (typeof obj === 'string') preEl.textContent = obj; else preEl.textContent = JSON.stringify(obj, null, 2);
}

document.getElementById('loadBtn').addEventListener('click', async () => {
  const token = document.getElementById('tokenInput').value.trim();
  if (!token) return alert('Paste admin session token');
  try {
    const users = await apiGet('/admin/users', token);
    renderJson(document.getElementById('usersBox'), users);
  } catch (e) { renderJson(document.getElementById('usersBox'), `Error: ${e.message}`); }
  try {
    const sessions = await apiGet('/admin/sessions', token);
    renderJson(document.getElementById('sessionsBox'), sessions);
  } catch (e) { renderJson(document.getElementById('sessionsBox'), `Error: ${e.message}`); }
  try {
    const logs = await apiGet('/admin/logs', token);
    renderJson(document.getElementById('logsBox'), logs);
  } catch (e) { renderJson(document.getElementById('logsBox'), `Error: ${e.message}`); }
});

document.getElementById('refreshBtn').addEventListener('click', () => document.getElementById('loadBtn').click());
