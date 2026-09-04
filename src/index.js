require('dotenv').config();
require('./recent-logs').captureLogs();

const {
  ActivityType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
} = require('discord.js');
const {
  DefaultExtractors,
} = require('@discord-player/extractor');
const {
  Player,
  QueueRepeatMode,
} = require('discord-player');
const {
  YouTubeDlpExtractor,
  setFFmpegPath,
  setYtDlpPath,
} = require('discord-player-youtubedlp');
const crypto = require('node:crypto');

const { commands } = require('./commands');
const { getGuild, patchGuild, getBot } = require('./store');
const { startPanel } = require('./panel');
const {
  buildPlayerMessage,
  buildIdleMessage,
  buildQueueEmbed,
  buildHistoryEmbed,
  buildPollMessage,
  trim,
} = require('./ui');

const REQUIRED = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

setFFmpegPath(process.env.FFMPEG_PATH || '/usr/bin/ffmpeg');
setYtDlpPath(process.env.YTDLP_PATH || '/usr/local/bin/yt-dlp');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const player = new Player(client);
const panelRefs = new Map();       // guildId -> { channelId, messageId }
const textChannels = new Map();    // guildId -> channelId
const polls = new Map();           // pollId -> poll state

async function registerCommands() {
  if ((process.env.REGISTER_COMMANDS || 'true').toLowerCase() !== 'true') return;
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const body = commands.map(c => c.toJSON());
  const guildId = process.env.DISCORD_GUILD_ID?.trim();

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId), { body });
    console.log(`Registered ${body.length} guild commands in ${guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body });
    console.log(`Registered ${body.length} global commands. Global propagation can take a while.`);
  }
}

function getQueue(guildId) {
  return player.nodes.get(guildId);
}

function sameVoiceChannel(interaction, queue) {
  const memberChannelId = interaction.member?.voice?.channelId;
  if (!memberChannelId) return false;
  const botChannelId = queue?.channel?.id || interaction.guild?.members?.me?.voice?.channelId;
  return !botChannelId || memberChannelId === botChannelId;
}

async function requireMusicControl(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    await safeReply(interaction, { content: 'Nothing is playing right now.', ephemeral: true });
    return null;
  }
  if (!sameVoiceChannel(interaction, queue)) {
    await safeReply(interaction, { content: 'Join the same voice channel as me first.', ephemeral: true });
    return null;
  }
  return queue;
}

async function safeReply(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function upsertPanel(guildId, forceNew = false) {
  const queue = getQueue(guildId);
  const channelId = textChannels.get(guildId) || panelRefs.get(guildId)?.channelId;
  if (!channelId) return;

  let channel;
  try { channel = await client.channels.fetch(channelId); } catch { return; }
  if (!channel?.isTextBased?.()) return;

  const payload = queue?.currentTrack ? buildPlayerMessage(queue) : buildIdleMessage('Queue finished');
  const existing = panelRefs.get(guildId);

  if (!forceNew && existing?.channelId === channelId) {
    try {
      const msg = await channel.messages.fetch(existing.messageId);
      await msg.edit(payload);
      return msg;
    } catch {
      panelRefs.delete(guildId);
    }
  }

  const msg = await channel.send(payload);
  panelRefs.set(guildId, { channelId, messageId: msg.id });
  return msg;
}

async function setPanelIdle(guildId, reason) {
  const ref = panelRefs.get(guildId);
  if (!ref) return;
  try {
    const channel = await client.channels.fetch(ref.channelId);
    const msg = await channel.messages.fetch(ref.messageId);
    await msg.edit(buildIdleMessage(reason));
  } catch {}
}

function formatUptime(ms) {
  let seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400); seconds %= 86400;
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds}s`].filter(Boolean).join(' ');
}

async function searchForPlay(query, requestedBy) {
  const isUrl = /^https?:\/\//i.test(query);
  const opts = { requestedBy };
  if (!isUrl) opts.searchEngine = `ext:${YouTubeDlpExtractor.identifier}`;
  return player.search(query, opts);
}

async function handleAutocomplete(interaction) {
  if (interaction.commandName !== 'play') return interaction.respond([]);
  const query = interaction.options.getFocused()?.trim();
  if (!query || query.length < 2) return interaction.respond([]);

  try {
    const result = await player.search(query, {
      requestedBy: interaction.user,
      searchEngine: `ext:${YouTubeDlpExtractor.identifier}`,
    });
    const choices = result.tracks.slice(0, 10).map(t => ({
      name: trim(`${t.title} — ${t.author || 'Unknown'}`, 100),
      value: trim(t.url || query, 100),
    }));
    await interaction.respond(choices);
  } catch {
    try { await interaction.respond([]); } catch {}
  }
}

async function handlePlay(interaction) {
  const voice = interaction.member?.voice?.channel;
  if (!voice) return safeReply(interaction, { content: 'Join a voice channel first.', ephemeral: true });

  const query = interaction.options.getString('query', true);
  textChannels.set(interaction.guildId, interaction.channelId);
  const wasExisting = Boolean(getQueue(interaction.guildId));
  await interaction.deferReply();

  try {
    const result = await searchForPlay(query, interaction.user);
    if (!result.hasTracks()) return interaction.editReply('I could not find anything for that search.');

    const { track, queue } = await player.play(voice, result, {
      nodeOptions: {
        metadata: { channelId: interaction.channelId },
        bufferingTimeout: 20000,
        leaveOnStop: true,
        leaveOnStopCooldown: 1000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 60000,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 300000,
        skipOnNoStream: true,
        maxHistorySize: 25,
      },
    });

    if (!wasExisting) {
      const setting = getGuild(interaction.guildId);
      queue.node.setVolume(setting.volume);
      if (setting.autoplay) queue.setRepeatMode(QueueRepeatMode.AUTOPLAY);
    }

    const pos = queue.tracks?.size ?? 0;
    await interaction.editReply(`🎵 **${trim(track.title, 160)}** ${queue.currentTrack?.id === track.id ? 'is starting.' : `was queued${pos ? ` • ${pos} upcoming` : ''}.`}`);
    await upsertPanel(interaction.guildId);
  } catch (err) {
    console.error('Play error:', err);
    await interaction.editReply(`Playback failed: ${trim(err?.message || String(err), 500)}`);
  }
}

async function handleMusicCommand(interaction) {
  const name = interaction.commandName;
  if (name === 'play') return handlePlay(interaction);
  if (name === 'nowplaying') {
    const queue = getQueue(interaction.guildId);
    if (!queue?.currentTrack) return safeReply(interaction, { content: 'Nothing is playing right now.', ephemeral: true });
    textChannels.set(interaction.guildId, interaction.channelId);
    await safeReply(interaction, { content: 'Player refreshed.', ephemeral: true });
    return upsertPanel(interaction.guildId, true);
  }
  if (name === 'queue') {
    const queue = getQueue(interaction.guildId);
    if (!queue) return safeReply(interaction, { content: 'The queue is empty.', ephemeral: true });
    return safeReply(interaction, { embeds: [buildQueueEmbed(queue)], ephemeral: true });
  }
  if (name === 'history') {
    const queue = getQueue(interaction.guildId);
    if (!queue) return safeReply(interaction, { content: 'No playback history yet.', ephemeral: true });
    return safeReply(interaction, { embeds: [buildHistoryEmbed(queue)], ephemeral: true });
  }
  if (name === 'volume') {
    const level = interaction.options.getInteger('level', true);
    patchGuild(interaction.guildId, { volume: level });
    const queue = getQueue(interaction.guildId);
    if (queue) queue.node.setVolume(level);
    await safeReply(interaction, { content: `🔊 Volume set to **${level}%**.`, ephemeral: true });
    if (queue) await upsertPanel(interaction.guildId);
    return;
  }
  if (name === 'autoplay') {
    const enabled = interaction.options.getBoolean('enabled', true);
    patchGuild(interaction.guildId, { autoplay: enabled });
    const queue = getQueue(interaction.guildId);
    if (queue) queue.setRepeatMode(enabled ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF);
    await safeReply(interaction, { content: `♾️ Related-song autoplay is **${enabled ? 'ON' : 'OFF'}**.`, ephemeral: true });
    if (queue) await upsertPanel(interaction.guildId);
    return;
  }

  const queue = await requireMusicControl(interaction);
  if (!queue) return;

  switch (name) {
    case 'pause':
      queue.node.pause();
      await safeReply(interaction, { content: '⏸ Paused.', ephemeral: true });
      break;
    case 'resume':
      queue.node.resume();
      await safeReply(interaction, { content: '▶ Resumed.', ephemeral: true });
      break;
    case 'skip':
      queue.node.skip();
      await safeReply(interaction, { content: '⏭ Skipped.', ephemeral: true });
      break;
    case 'previous':
      if (!queue.history || queue.history.isEmpty()) return safeReply(interaction, { content: 'There is no previous track yet.', ephemeral: true });
      await queue.history.previous(true);
      await safeReply(interaction, { content: '⏮ Going back.', ephemeral: true });
      break;
    case 'stop':
    case 'disconnect':
      queue.delete();
      await safeReply(interaction, { content: '⏹ Stopped and disconnected.', ephemeral: true });
      await setPanelIdle(interaction.guildId, 'Stopped');
      return;
    case 'shuffle':
      if ((queue.tracks?.size ?? 0) < 2) return safeReply(interaction, { content: 'You need at least 2 upcoming songs to shuffle.', ephemeral: true });
      queue.tracks.shuffle();
      await safeReply(interaction, { content: '🔀 Queue shuffled.', ephemeral: true });
      break;
    case 'loop': {
      const mode = interaction.options.getInteger('mode', true);
      queue.setRepeatMode(mode);
      if (mode !== QueueRepeatMode.AUTOPLAY) patchGuild(interaction.guildId, { autoplay: false });
      await safeReply(interaction, { content: `🔁 Repeat mode changed.`, ephemeral: true });
      break;
    }
    case 'remove': {
      const position = interaction.options.getInteger('position', true);
      const tracks = queue.tracks?.toArray?.() || [];
      const track = tracks[position - 1];
      if (!track) return safeReply(interaction, { content: 'That queue position does not exist.', ephemeral: true });
      queue.removeTrack(track);
      await safeReply(interaction, { content: `🗑 Removed **${trim(track.title, 150)}**.`, ephemeral: true });
      break;
    }
    case 'clear':
      queue.clear();
      await safeReply(interaction, { content: '🧹 Upcoming queue cleared.', ephemeral: true });
      break;
    default:
      return;
  }

  await upsertPanel(interaction.guildId);
}

async function handleUtilityCommand(interaction) {
  switch (interaction.commandName) {
    case 'ping':
      return safeReply(interaction, { content: `🏓 Gateway: **${client.ws.ping} ms**`, ephemeral: true });
    case 'uptime':
      return safeReply(interaction, { content: `⏱ Uptime: **${formatUptime(client.uptime || 0)}**`, ephemeral: true });
    case 'choose': {
      const raw = interaction.options.getString('options', true);
      const choices = raw.split(',').map(x => x.trim()).filter(Boolean).slice(0, 25);
      if (choices.length < 2) return safeReply(interaction, { content: 'Give me at least 2 comma-separated choices.', ephemeral: true });
      const pick = choices[Math.floor(Math.random() * choices.length)];
      return safeReply(interaction, { content: `🎯 I choose: **${trim(pick, 300)}**` });
    }
    case 'roll': {
      const spec = (interaction.options.getString('dice') || '1d20').toLowerCase().trim();
      const match = spec.match(/^(\d{0,2})d(\d{1,4})$/);
      if (!match) return safeReply(interaction, { content: 'Use dice notation like `d20`, `2d6`, or `4d8`.', ephemeral: true });
      const count = Math.max(1, Math.min(20, Number(match[1] || 1)));
      const sides = Math.max(2, Math.min(1000, Number(match[2])));
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
      const total = rolls.reduce((a, b) => a + b, 0);
      return safeReply(interaction, { content: `🎲 **${count}d${sides}** → [${rolls.join(', ')}] = **${total}**` });
    }
    case 'poll': {
      const options = [1,2,3,4,5].map(i => interaction.options.getString(`option${i}`)).filter(Boolean);
      const id = crypto.randomBytes(4).toString('hex');
      const poll = {
        id,
        question: interaction.options.getString('question', true),
        options,
        votes: new Map(),
      };
      polls.set(id, poll);
      return safeReply(interaction, buildPollMessage(poll));
    }
    case 'avatar': {
      const user = interaction.options.getUser('user') || interaction.user;
      const url = user.displayAvatarURL({ size: 1024 });
      const embed = new EmbedBuilder().setTitle(`${user.username}'s avatar`).setImage(url).setURL(url);
      return safeReply(interaction, { embeds: [embed] });
    }
    case 'userinfo': {
      const user = interaction.options.getUser('user') || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const embed = new EmbedBuilder()
        .setTitle(user.username)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: 'User ID', value: user.id, inline: true },
          { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Joined server', value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
          { name: 'Roles', value: member ? String(Math.max(0, member.roles.cache.size - 1)) : 'Unknown', inline: true },
        );
      return safeReply(interaction, { embeds: [embed] });
    }
    case 'serverinfo': {
      const g = interaction.guild;
      const embed = new EmbedBuilder()
        .setTitle(g.name)
        .addFields(
          { name: 'Members', value: String(g.memberCount), inline: true },
          { name: 'Channels', value: String(g.channels.cache.size), inline: true },
          { name: 'Roles', value: String(g.roles.cache.size), inline: true },
          { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Boosts', value: String(g.premiumSubscriptionCount || 0), inline: true },
        );
      if (g.iconURL()) embed.setThumbnail(g.iconURL());
      return safeReply(interaction, { embeds: [embed] });
    }
    default:
      return false;
  }
}

async function handleMusicButton(interaction) {
  const queue = await requireMusicControl(interaction);
  if (!queue) return;

  switch (interaction.customId) {
    case 'music_previous':
      if (!queue.history || queue.history.isEmpty()) return safeReply(interaction, { content: 'No previous track yet.', ephemeral: true });
      await queue.history.previous(true);
      await interaction.deferUpdate();
      break;
    case 'music_pause':
      queue.node.setPaused(!queue.node.isPaused());
      await interaction.deferUpdate();
      break;
    case 'music_skip':
      queue.node.skip();
      await interaction.deferUpdate();
      break;
    case 'music_stop':
      queue.delete();
      await interaction.deferUpdate();
      await setPanelIdle(interaction.guildId, 'Stopped');
      return;
    case 'music_shuffle':
      if ((queue.tracks?.size ?? 0) >= 2) queue.tracks.shuffle();
      await interaction.deferUpdate();
      break;
    case 'music_loop': {
      const next = queue.repeatMode === QueueRepeatMode.OFF ? QueueRepeatMode.TRACK
        : queue.repeatMode === QueueRepeatMode.TRACK ? QueueRepeatMode.QUEUE
        : QueueRepeatMode.OFF;
      queue.setRepeatMode(next);
      patchGuild(interaction.guildId, { autoplay: false });
      await interaction.deferUpdate();
      break;
    }
    case 'music_autoplay': {
      const enable = queue.repeatMode !== QueueRepeatMode.AUTOPLAY;
      queue.setRepeatMode(enable ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF);
      patchGuild(interaction.guildId, { autoplay: enable });
      await interaction.deferUpdate();
      break;
    }
    case 'music_queue':
      return safeReply(interaction, { embeds: [buildQueueEmbed(queue)], ephemeral: true });
    default:
      return;
  }

  await upsertPanel(interaction.guildId);
}

async function handlePollButton(interaction) {
  const [, id, indexRaw] = interaction.customId.split('_');
  const poll = polls.get(id);
  if (!poll) return safeReply(interaction, { content: 'That poll is no longer active in bot memory.', ephemeral: true });
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || !poll.options[index]) return;
  poll.votes.set(interaction.user.id, index);
  await interaction.update(buildPollMessage(poll));
}

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isAutocomplete()) return handleAutocomplete(interaction);
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('music_')) return handleMusicButton(interaction);
      if (interaction.customId.startsWith('poll_')) return handlePollButton(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    const musicCommands = new Set(['play','pause','resume','skip','previous','stop','disconnect','queue','history','nowplaying','shuffle','loop','autoplay','volume','remove','clear']);
    if (musicCommands.has(interaction.commandName)) return handleMusicCommand(interaction);
    return handleUtilityCommand(interaction);
  } catch (err) {
    console.error('Interaction error:', err);
    try { await safeReply(interaction, { content: `Something went wrong: ${trim(err?.message || String(err), 500)}`, ephemeral: true }); } catch {}
  }
});

player.events.on('playerStart', async (queue, track) => {
  console.log(`[${queue.guild.name}] Playing: ${track.title}`);
  await upsertPanel(queue.guild.id);
});

player.events.on('audioTrackAdd', (queue, track) => {
  console.log(`[${queue.guild.name}] Queued: ${track.title}`);
});

player.events.on('emptyQueue', async queue => {
  console.log(`[${queue.guild.name}] Queue ended.`);
  await setPanelIdle(queue.guild.id, 'Queue finished');
});

player.events.on('disconnect', async queue => {
  await setPanelIdle(queue.guild.id, 'Disconnected');
});

player.events.on('playerError', (queue, error) => {
  console.error(`[${queue.guild.name}] Player error:`, error);
});
player.events.on('error', (queue, error) => {
  console.error(`[${queue.guild.name}] Queue error:`, error);
});

function updatePresence() {
  if (!client.isReady()) return;
  client.user.setPresence({
    activities: [{ name: getBot().status, type: ActivityType.Listening }],
    status: 'online',
  });
}
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  updatePresence();
});
client.on('shardDisconnect', () => console.warn('Discord gateway disconnected; reconnecting.'));
client.on('shardResume', () => console.log('Discord gateway reconnected.'));
client.on('error', err => console.error('Discord client error:', err));

let webServer;

const panelSeconds = Math.max(10, Number(process.env.PANEL_UPDATE_SECONDS || 15));
setInterval(() => {
  for (const guildId of panelRefs.keys()) {
    const queue = getQueue(guildId);
    if (queue?.currentTrack) upsertPanel(guildId).catch(() => {});
  }
}, panelSeconds * 1000).unref();

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  webServer?.close();
  try {
    for (const queue of player.nodes.cache.values()) queue.delete();
  } catch {}
  client.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

(async () => {
  try {
    webServer = startPanel({ client, player, refresh: upsertPanel, idle: setPanelIdle, presence: updatePresence });
    webServer.on('error', err => { console.error('Panel server error:', err); process.exit(1); });
    webServer.on('listening', () => console.log(`Web panel listening on port ${webServer.address().port}`));
    await registerCommands();
    await player.extractors.loadMulti(DefaultExtractors);
    await player.extractors.register(YouTubeDlpExtractor, {});
    await client.login(process.env.DISCORD_TOKEN);
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
})();
