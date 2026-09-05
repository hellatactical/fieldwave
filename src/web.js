const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Small, same-process HTTP server. No database or frontend build required.
function startWeb({ snapshot, control, settings, commands, logs }, env = process.env) {
  const password = env.PANEL_PASSWORD || '';
  if (password.length < 16 || password === 'CHANGE_ME_TO_A_RANDOM_PASSWORD') {
    throw new Error('Set PANEL_PASSWORD to a unique password of at least 16 characters.');
  }
  const port = Number(env.PANEL_PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || (port === 0 && !env.TEST)) throw new Error('Invalid PANEL_PORT');
  const secure = env.PANEL_SECURE_COOKIE === 'true';
  const sessions = new Map();
  const attempts = new Map();
  const ttl = 12 * 60 * 60 * 1000;
  const digest = value => crypto.createHash('sha256').update(value).digest();
  const expected = digest(password);
  const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
    ['/mark.svg', ['mark.svg', 'image/svg+xml']],
    ['/camo.svg', ['camo.svg', 'image/svg+xml']],
  ].map(([url, [file, type]]) => [url, { body: fs.readFileSync(path.join(__dirname, 'web', file)), type }]));
  const cookie = (id, age) => `panel_session=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const fail = (status, message) => Object.assign(new Error(message), { status });
  async function body(req) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 8192) throw fail(413, 'Request too large');
    }
    try { const data = JSON.parse(raw); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); return data; }
    catch { throw fail(400, 'Invalid JSON'); }
  }
  const server = http.createServer(async (req, res) => {
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && assets.has(url)) {
        const asset = assets.get(url); res.writeHead(200, { 'Content-Type': asset.type }); return res.end(asset.body);
      }
      if (req.method === 'GET' && url === '/healthz') return json(200, { ok: true });
      const now = Date.now();
      for (const [id, s] of sessions) if (s.expires <= now) sessions.delete(id);
      for (const [ip, a] of attempts) if (a.until <= now) attempts.delete(ip);
      if (req.method === 'POST') {
        // Browsers cannot submit a cross-origin JSON request without preflight.
        // Reject cross-site requests and never enable CORS, including on login.
        if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Cross-site request rejected');
        if (req.headers.origin) {
          let origin; try { origin = new URL(req.headers.origin); } catch { throw fail(403, 'Invalid origin'); }
          if (origin.host !== req.headers.host) throw fail(403, 'Origin mismatch');
        }
        if ((req.headers['content-type'] || '').split(';')[0] !== 'application/json') throw fail(415, 'JSON required');
      }
      if (req.method === 'POST' && url === '/api/login') {
        const ip = req.socket.remoteAddress;
        const attempt = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
        if (attempt.count >= 10 || attempts.size >= 10000) throw fail(429, 'Too many login attempts. Try again in 15 minutes.');
        attempt.count++; attempts.set(ip, attempt);
        const data = await body(req);
        if (typeof data.password !== 'string' || !crypto.timingSafeEqual(expected, digest(data.password))) throw fail(401, 'Incorrect password');
        attempts.delete(ip);
        if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
        const id = crypto.randomBytes(32).toString('hex');
        const csrf = crypto.randomBytes(24).toString('hex');
        sessions.set(id, { csrf, expires: now + ttl });
        res.setHeader('Set-Cookie', cookie(id, ttl / 1000));
        return json(200, { csrf });
      }
      const id = /(?:^|;\s*)panel_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const session = sessions.get(id);
      if (!session) throw fail(401, 'Please sign in');
      if (req.method === 'GET' && url === '/api/session') return json(200, { csrf: session.csrf });
      if (req.method === 'POST' && req.headers['x-csrf-token'] !== session.csrf) throw fail(403, 'Invalid session token. Refresh and try again.');
      if (req.method === 'POST' && url === '/api/logout') {
        sessions.delete(id); res.setHeader('Set-Cookie', cookie('', 0)); return json(200, { ok: true });
      }
      if (req.method === 'GET' && url === '/api/state') return json(200, { ...snapshot(), logs: logs() });
      if (req.method === 'POST' && (url === '/api/control' || url === '/api/settings' || url === '/api/commands')) {
        const data = await body(req);
        await (url === '/api/control' ? control(data) : url === '/api/settings' ? settings(data) : commands(data));
        return json(200, { ok: true });
      }
      throw fail(404, 'Not found');
    } catch (err) {
      if (!err.status) console.error('Panel error:', err);
      if (!res.headersSent) json(err.status || 500, { error: err.status ? err.message : 'The operation failed. Check recent logs.' });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(port, env.PANEL_HOST || '0.0.0.0');
  return server;
}
module.exports = { startWeb };
