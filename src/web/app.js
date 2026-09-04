const $ = id => document.getElementById(id);
let csrf = '', state = null, selected = '', busy = false, timer, lastGuild = '', settingsDirty = false, botDirty = false;
async function api(path, data) {
  const response = await fetch(`/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') showLogin();
    throw new Error(result.error || 'Request failed');
  }
  return result;
}
function showLogin() { clearTimeout(timer); csrf = ''; $('login').hidden = false; $('dashboard').hidden = true; }
function message(text) { $('notice').textContent = text; }
function clock(seconds) { seconds = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
function uptime(seconds) { const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60); return `${d ? `${d}d ` : ''}${h ? `${h}h ` : ''}${m}m`; }
const current = () => state?.guilds.find(g => g.id === selected);
function render() {
  $('botName').textContent = state.name; $('online').textContent = state.online ? 'Online' : 'Offline';
  $('uptime').textContent = uptime(state.uptime); $('servers').textContent = state.serverCount;
  $('connection').textContent = state.online ? '● Connected to Discord' : '○ Discord offline';
  $('connection').classList.toggle('good', state.online);
  const guildKey = JSON.stringify(state.guilds.map(g => [g.id, g.name]));
  if ($('guild').dataset.key !== guildKey) {
    $('guild').replaceChildren(...state.guilds.map(g => new Option(g.name, g.id)));
    if (!state.guilds.length) $('guild').add(new Option('No servers connected', ''));
    $('guild').dataset.key = guildKey;
  }
  if (!state.guilds.some(g => g.id === selected)) selected = state.guilds[0]?.id || '';
  $('guild').value = selected;
  const g = current(), t = g?.track;
  $('playStatus').textContent = g?.status || 'Idle'; $('trackTitle').textContent = t?.title || 'Standing by.';
  $('artist').textContent = t?.author || 'Start a song with /play in Discord.';
  $('voice').textContent = g?.voice ? `Voice · ${g.voice}` : 'Not in a voice channel';
  const artwork = t?.artwork || '';
  if ($('artwork').dataset.url !== artwork) {
    $('artwork').dataset.url = artwork; $('artwork').hidden = !artwork; $('artPlaceholder').hidden = !!artwork;
    if (artwork) $('artwork').src = artwork; else $('artwork').removeAttribute('src');
  }
  $('progress').value = t?.durationMS ? Math.min(100, (g.positionMS / t.durationMS) * 100) : 0;
  $('elapsed').textContent = clock((g?.positionMS || 0) / 1000); $('duration').textContent = t?.duration || '—';
  $('pause').dataset.action = g?.status === 'Paused' ? 'resume' : 'pause';
  $('pause').textContent = g?.status === 'Paused' ? '▶ Resume' : 'Ⅱ Pause';
  document.querySelectorAll('[data-action]').forEach(b => {
    b.disabled = busy || !state.online || !g || !t || (b.dataset.action === 'previous' && !g.hasHistory) || (b.dataset.action === 'shuffle' && g.queue.length < 2);
  });
  $('loop').disabled = busy || !t || !state.online; $('loop').value = String(g?.repeat === 3 ? 0 : g?.repeat || 0);
  $('autoplay').disabled = $('volume').disabled = busy || !g || !state.online;
  $('autoplay').checked = g?.repeat === 3;
  if (document.activeElement !== $('volume')) $('volume').value = g?.volume ?? 75;
  $('volumeValue').textContent = `${$('volume').value}%`;
  $('queueCount').textContent = `${g?.queue.length || 0} tracks`;
  $('queueEmpty').hidden = !!g?.queue.length;
  $('queue').replaceChildren(...(g?.queue || []).map(t => {
    const li = document.createElement('li'), div = document.createElement('div'), title = document.createElement('strong'), author = document.createElement('small'), duration = document.createElement('small');
    title.textContent = t.title; author.textContent = t.author || 'Unknown artist'; duration.textContent = t.duration || '—'; div.append(title, author); li.append(div, duration); return li;
  }));
  if (lastGuild !== selected) settingsDirty = false;
  if (!settingsDirty) { $('defaultVolume').value = g?.settings.volume ?? 75; $('defaultAutoplay').checked = g?.settings.autoplay || false; }
  lastGuild = selected;
  $('guildSettings').querySelectorAll('input,button').forEach(el => { el.disabled = !g || busy; });
  if (!botDirty) $('statusText').value = state.settings.status;
  const logKey = JSON.stringify(state.logs);
  if ($('logs').dataset.key !== logKey) {
    $('logs').dataset.key = logKey;
    $('logs').replaceChildren(...state.logs.slice().reverse().map(log => { const row = document.createElement('div'); row.className = log.level; row.textContent = `${new Date(log.time).toLocaleTimeString()}  ${log.level.toUpperCase()}  ${log.message}`; return row; }));
  }
}
async function poll() {
  clearTimeout(timer);
  try { state = await api('state'); render(); }
  catch (err) { $('connection').textContent = '○ Panel unreachable'; $('connection').classList.remove('good'); message(err.message); document.querySelectorAll('[data-action],#volume,#loop,#autoplay').forEach(b => { b.disabled = true; }); }
  finally { if (csrf) timer = setTimeout(poll, 3000); }
}
async function enter(token) { csrf = token; $('login').hidden = true; $('dashboard').hidden = false; await poll(); }
async function mutate(path, data, success) {
  if (busy) return;
  busy = true; render();
  try { await api(path, data); message(success); }
  catch (err) { message(err.message); }
  finally { busy = false; await poll(); }
}
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('loginError').textContent = '';
  try { const result = await api('login', { password: $('password').value }); $('password').value = ''; await enter(result.csrf); }
  catch (err) { $('loginError').textContent = err.message; }
  finally { button.disabled = false; }
});
$('logout').onclick = async () => { try { await api('logout', {}); showLogin(); } catch (err) { message(err.message); } };
$('guild').onchange = () => { selected = $('guild').value; render(); };
document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => mutate('control', { guildId: selected, action: button.dataset.action }, 'Playback updated.'));
$('volume').oninput = () => { $('volumeValue').textContent = `${$('volume').value}%`; };
$('volume').onchange = () => mutate('control', { guildId: selected, action: 'volume', value: Number($('volume').value) }, 'Volume saved.');
$('loop').onchange = () => mutate('control', { guildId: selected, action: 'loop', value: Number($('loop').value) }, 'Loop updated.');
$('autoplay').onchange = () => mutate('control', { guildId: selected, action: 'autoplay', value: $('autoplay').checked }, 'Autoplay saved.');
$('guildSettings').oninput = () => { settingsDirty = true; };
$('botSettings').oninput = () => { botDirty = true; };
$('guildSettings').onsubmit = async e => { e.preventDefault(); const data = { guildId: selected, volume: Number($('defaultVolume').value), autoplay: $('defaultAutoplay').checked }; await mutate('settings', data, 'Defaults saved for the next music session.'); settingsDirty = false; };
$('botSettings').onsubmit = async e => { e.preventDefault(); await mutate('settings', { status: $('statusText').value }, 'Bot presence saved.'); botDirty = false; };
$('artwork').onerror = () => { $('artwork').hidden = true; $('artPlaceholder').hidden = false; };
api('session').then(s => enter(s.csrf)).catch(() => showLogin());
