const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { startWeb } = require('../src/web');

test('HTTP authentication, CSRF, session revocation, limits and asset delivery', async t => {
  let actions = 0;
  const server = startWeb({ snapshot: () => ({ online: false, guilds: [] }), logs: () => [], control: () => actions++, settings: () => actions++, commands: () => actions++ }, { PANEL_PASSWORD: 'test-only-password-1234', PANEL_PORT: '0', PANEL_HOST: '127.0.0.1', TEST: true });
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, data, headers = {}) => fetch(base + url, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
  assert.equal((await request('/api/state')).status, 401);
  assert.equal((await request('/healthz')).status, 200);
  for (const url of ['/', '/style.css', '/app.js']) assert.equal((await request(url)).status, 200);
  assert.equal((await request('/api/login', { password: 'wrong' })).status, 401);
  assert.equal((await request('/api/login', { password: 'test-only-password-1234' }, { Origin: 'https://attacker.example' })).status, 403);
  const login = await request('/api/login', { password: 'test-only-password-1234' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  const { csrf } = await login.json();
  const auth = { Cookie: cookie.split(';')[0], 'X-CSRF-Token': csrf };
  assert.equal((await request('/api/state', undefined, auth)).status, 200);
  assert.equal((await request('/api/control', {}, { Cookie: auth.Cookie })).status, 403);
  assert.equal(actions, 0);
  assert.equal((await request('/api/control', {}, auth)).status, 200);
  assert.equal((await request('/api/settings', {}, auth)).status, 200);
  assert.equal((await request('/api/commands', {}, auth)).status, 200);
  assert.equal(actions, 3);
  assert.equal((await request('/api/control', { payload: 'x'.repeat(9000) }, auth)).status, 413);
  assert.equal((await request('/api/logout', {}, auth)).status, 200);
  assert.equal((await request('/api/state', undefined, auth)).status, 401);
  for (let i = 0; i < 10; i++) assert.equal((await request('/api/login', { password: 'wrong' })).status, 401);
  assert.equal((await request('/api/login', { password: 'test-only-password-1234' })).status, 429);
});

test('server refuses missing password and invalid ports', () => {
  assert.throws(() => startWeb({}, {}), /PANEL_PASSWORD/);
  assert.throws(() => startWeb({}, { PANEL_PASSWORD: 'test-only-password-1234', PANEL_PORT: '70000' }), /PANEL_PORT/);
});
