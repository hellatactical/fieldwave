const { QueueRepeatMode } = require('discord-player');
const { getGuild, patchGuild, getBot, patchBot } = require('./store');
const { startWeb } = require('./web');
const { recentLogs } = require('./recent-logs');

const invalid = message => Object.assign(new Error(message), { status: 400 });
const trackInfo = t => t ? ({ title: t.title, author: t.author, artwork: /^https:\/\//.test(t.thumbnail || '') ? t.thumbnail : null, duration: t.duration, durationMS: t.durationMS || 0 }) : null;

function startPanel({ client, player, refresh, idle, presence }) {
  const busy = new Set();
  const guild = id => {
    if (typeof id !== 'string' || !client.guilds.cache.has(id)) throw invalid('Select a connected Discord server.');
    return player.nodes.get(id);
  };
  const volume = value => { if (!Number.isInteger(value) || value < 0 || value > 100) throw invalid('Volume must be between 0 and 100.'); };
  return startWeb({
    logs: recentLogs,
    snapshot: () => ({
      online: client.isReady(), name: client.user?.username || 'Your Discord bot',
      uptime: Math.floor(process.uptime()), discordUptime: Math.floor((client.uptime || 0) / 1000),
      serverCount: client.guilds.cache.size, settings: getBot(),
      guilds: [...client.guilds.cache.values()].map(g => {
        const q = player.nodes.get(g.id);
        const timestamp = q?.node.getTimestamp();
        return { id: g.id, name: g.name, settings: getGuild(g.id),
          voice: g.members.me?.voice?.channel?.name || q?.channel?.name || null,
          status: q?.currentTrack ? (q.node.isPaused() ? 'Paused' : 'Playing') : 'Idle',
          track: trackInfo(q?.currentTrack), positionMS: timestamp?.current?.value || 0,
          volume: q?.node.volume ?? getGuild(g.id).volume,
          repeat: q?.repeatMode ?? (getGuild(g.id).autoplay ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF),
          hasHistory: q?.history ? !q.history.isEmpty() : false,
          queue: (q?.tracks.toArray() || []).map(trackInfo),
        };
      }),
    }),
    control: async ({ guildId, action, value }) => {
      const q = guild(guildId);
      if (!client.isReady()) throw invalid('Discord is offline. Wait for reconnection.');
      if (busy.has(guildId)) throw invalid('A control is already running. Try again shortly.');
      busy.add(guildId);
      try {
        if (action === 'volume') { volume(value); if (q) q.node.setVolume(value); patchGuild(guildId, { volume: value }); }
        else if (action === 'autoplay') {
          if (typeof value !== 'boolean') throw invalid('Autoplay must be on or off.');
          if (q) q.setRepeatMode(value ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF);
          patchGuild(guildId, { autoplay: value });
        } else {
          if (!q) throw invalid('No active queue. Start music with /play in Discord.');
          switch (action) {
            case 'pause': q.node.pause(); break;
            case 'resume': q.node.resume(); break;
            case 'skip': if (!q.currentTrack) throw invalid('Nothing to skip.'); q.node.skip(); break;
            case 'stop': q.delete(); await idle(guildId, 'Stopped from web panel'); break;
            case 'previous': if (q.history.isEmpty()) throw invalid('No previous track yet.'); await q.history.previous(true); break;
            case 'shuffle': if (q.tracks.size < 2) throw invalid('Queue at least two songs to shuffle.'); q.tracks.shuffle(); break;
            case 'loop':
              if (![QueueRepeatMode.OFF, QueueRepeatMode.TRACK, QueueRepeatMode.QUEUE].includes(value)) throw invalid('Invalid loop mode.');
              q.setRepeatMode(value); patchGuild(guildId, { autoplay: false }); break;
            default: throw invalid('Unknown control.');
          }
        }
        console.log(`[Panel] ${action} in ${client.guilds.cache.get(guildId).name}`);
        if (action !== 'stop') await refresh(guildId);
      } finally { busy.delete(guildId); }
    },
    settings: async data => {
      if (data.guildId) {
        guild(data.guildId); volume(data.volume);
        if (typeof data.autoplay !== 'boolean') throw invalid('Invalid autoplay setting.');
        patchGuild(data.guildId, { volume: data.volume, autoplay: data.autoplay });
      } else {
        if (typeof data.status !== 'string' || !data.status.trim() || data.status.length > 128) throw invalid('Status must be 1–128 characters.');
        patchBot({ status: data.status.trim() }); presence();
      }
      console.log('[Panel] Settings saved');
    },
  });
}
module.exports = { startPanel };
