const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

test('panel uses per-server playback, persists defaults, and handles offline/empty queues', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-panel-test-'));
  process.env.DATA_DIR = dir;
  process.env.PANEL_PASSWORD = 'test-only-password-1234';
  process.env.PANEL_PORT = '0'; process.env.TEST = 'true'; process.env.PANEL_HOST = '127.0.0.1';
  const { startPanel } = require('../src/panel');
  const { getGuild, getBot } = require('../src/store');
  const { QueueRepeatMode } = require('discord-player');
  let paused = false, online = true, active = true, previous = 0, skipped = 0, shuffled = 0, refreshes = 0, presences = 0, commandSyncs = 0;
  const track = { title: 'Test song <script>', author: 'Test artist', duration: '3:00', durationMS: 180000 };
  const queue = { currentTrack: track, repeatMode: 0, channel: { name: 'Music' },
    node: { volume: 75, getTimestamp: () => ({ current: { value: 42000 } }), isPaused: () => paused,
      pause: () => { paused = true; }, resume: () => { paused = false; }, skip: () => skipped++, setVolume: v => { queue.node.volume = v; } },
    history: { isEmpty: () => false, previous: async () => previous++ },
    tracks: { size: 2, toArray: () => [track, track], shuffle: () => shuffled++ },
    delete: () => { active = false; }, setRepeatMode: mode => { queue.repeatMode = mode; },
  };
  const client = { isReady: () => online, uptime: 5000, user: { username: 'Test bot' }, guilds: { cache: new Map([['123', { id: '123', name: 'Test server', members: {} }], ['456', { id: '456', name: 'Quiet server', members: {} }]]) } };
  const server = startPanel({ client, player: { nodes: { get: id => id === '123' && active ? queue : undefined } }, refresh: async () => refreshes++, idle: async () => {}, presence: () => presences++, syncCommands: async id => { assert.equal(id, '123'); commandSyncs++; } });
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.PANEL_PASSWORD }) });
  const headers = { 'Content-Type': 'application/json', Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': (await login.json()).csrf };
  const post = async (route, data) => fetch(base + '/api/' + route, { method: 'POST', headers, body: JSON.stringify(data) });
  const action = async (action, value) => { const r = await post('control', { guildId: '123', action, value }); assert.equal(r.status, 200, await r.text()); };
  const state = () => fetch(base + '/api/state', { headers }).then(r => r.json());
  let snapshot = await state(); assert.equal(snapshot.serverCount, 2); assert.equal(snapshot.guilds[0].positionMS, 42000); assert.equal(snapshot.guilds[1].status, 'Idle');
  await action('pause'); assert.equal((await state()).guilds[0].status, 'Paused');
  await action('resume'); assert.equal(paused, false);
  await action('skip'); await action('previous'); await action('shuffle');
  assert.equal(skipped, 1); assert.equal(previous, 1); assert.equal(shuffled, 1);
  await action('volume', 36); assert.equal(queue.node.volume, 36); assert.equal(getGuild('123').volume, 36);
  await action('autoplay', true); assert.equal(queue.repeatMode, QueueRepeatMode.AUTOPLAY);
  await action('loop', QueueRepeatMode.TRACK); assert.equal(getGuild('123').autoplay, false);
  assert.equal((await post('control', { guildId: '123', action: 'volume', value: 101 })).status, 400);
  assert.equal((await post('control', { guildId: 'foreign', action: 'stop' })).status, 400);
  assert.equal((await post('settings', { guildId: '456', volume: 20, autoplay: true })).status, 200);
  assert.equal(getGuild('456').volume, 20); assert.equal(queue.node.volume, 36);
  assert.equal((await post('settings', { status: 'Evening music' })).status, 200); assert.equal(getBot().status, 'Evening music'); assert.equal(presences, 1);
  assert.equal((await post('commands', { guildId: '123', disabledCommands: ['roll'], customCommands: [{ name: 'rules', description: 'Show the rules', response: 'Be kind.' }] })).status, 200);
  assert.deepEqual(getGuild('123').disabledCommands, ['roll']); assert.equal(getGuild('123').customCommands[0].name, 'rules'); assert.equal(commandSyncs, 1);
  assert.equal((await post('commands', { guildId: '123', disabledCommands: [], customCommands: [{ name: 'play', description: 'Collision', response: 'Nope' }] })).status, 400);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))); assert.equal(saved.bot.status, 'Evening music'); assert.equal(saved.guilds['456'].autoplay, true); assert.equal(saved.guilds['123'].customCommands[0].response, 'Be kind.');
  online = false; assert.equal((await state()).online, false); assert.equal((await post('control', { guildId: '123', action: 'skip' })).status, 400); online = true;
  await action('stop'); assert.equal((await state()).guilds[0].track, null);
  assert.equal((await post('control', { guildId: '123', action: 'skip' })).status, 400);
  assert.ok(refreshes >= 8);
});
