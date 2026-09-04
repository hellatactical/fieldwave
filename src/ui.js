const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { QueueRepeatMode } = require('discord-player');

const COLOR = 0x5865F2;

function trim(text, max = 100) {
  if (!text) return 'Unknown';
  const s = String(text);
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function repeatLabel(mode) {
  switch (mode) {
    case QueueRepeatMode.TRACK: return 'Track';
    case QueueRepeatMode.QUEUE: return 'Queue';
    case QueueRepeatMode.AUTOPLAY: return 'Autoplay';
    default: return 'Off';
  }
}

function buildPlayerMessage(queue) {
  const track = queue.currentTrack;
  if (!track) return buildIdleMessage('Queue finished');

  const paused = queue.node.isPaused();
  const progress = queue.node.createProgressBar({ length: 18, timecodes: true }) || 'LIVE';
  const requester = track.requestedBy ? `<@${track.requestedBy.id}>` : 'Unknown';
  const upcoming = queue.tracks?.size ?? 0;
  const autoplay = queue.repeatMode === QueueRepeatMode.AUTOPLAY;

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(trim(track.title, 240))
    .setDescription([
      track.author ? `**${trim(track.author, 180)}**` : null,
      '',
      `**${paused ? '⏸ Paused' : '▶ Playing'}**`,
      `\`${progress}\``,
      '',
      `Requested by ${requester}`,
      `🔊 ${Math.round(queue.node.volume ?? 100)}%  •  🔁 ${repeatLabel(queue.repeatMode)}  •  📃 ${upcoming} queued`,
      `♾️ Related autoplay: **${autoplay ? 'ON' : 'OFF'}**`,
    ].filter(v => v !== null).join('\n'))
    .setFooter({ text: 'Use /play or the buttons below' });

  if (track.url) embed.setURL(track.url);
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_pause').setEmoji(paused ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_loop').setLabel(`Loop: ${repeatLabel(queue.repeatMode)}`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_autoplay').setLabel(`Autoplay: ${autoplay ? 'On' : 'Off'}`).setStyle(autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_queue').setLabel('Queue').setEmoji('📃').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildIdleMessage(reason = 'Nothing is playing') {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('Music player')
    .setDescription(`**${reason}**\nUse \`/play\` to start something.`);
  return { embeds: [embed], components: [] };
}

function buildQueueEmbed(queue) {
  const current = queue.currentTrack;
  const tracks = queue.tracks?.toArray?.() || [];
  const lines = tracks.slice(0, 10).map((t, i) => `**${i + 1}.** ${trim(t.title, 85)} — ${trim(t.author, 45)}`);
  const more = tracks.length > 10 ? `\n…and **${tracks.length - 10}** more.` : '';

  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎵 Queue')
    .setDescription([
      current ? `**Now playing:** ${trim(current.title, 100)} — ${trim(current.author, 60)}` : '**Now playing:** nothing',
      '',
      lines.length ? lines.join('\n') : '*No manually queued songs.*',
      more,
      '',
      `Repeat: **${repeatLabel(queue.repeatMode)}**`,
    ].join('\n'));
}

function buildHistoryEmbed(queue) {
  const list = queue.history?.tracks?.toArray?.() || [];
  const recent = list.slice(-10).reverse();
  const lines = recent.map((t, i) => `**${i + 1}.** ${trim(t.title, 90)} — ${trim(t.author, 45)}`);
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🕘 Recent history')
    .setDescription(lines.length ? lines.join('\n') : '*No history yet.*');
}

function buildPollMessage(poll) {
  const counts = poll.options.map(() => 0);
  for (const index of poll.votes.values()) counts[index] += 1;
  const total = poll.votes.size;
  const lines = poll.options.map((o, i) => `**${i + 1}. ${trim(o, 80)}** — ${counts[i]} vote${counts[i] === 1 ? '' : 's'}`);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(trim(poll.question, 240))
    .setDescription(`${lines.join('\n')}\n\n**${total}** total vote${total === 1 ? '' : 's'}`)
    .setFooter({ text: 'Click an option to vote. Clicking another option changes your vote.' });

  const row = new ActionRowBuilder();
  poll.options.forEach((o, i) => {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`poll_${poll.id}_${i}`)
      .setLabel(trim(`${i + 1}. ${o}`, 80))
      .setStyle(ButtonStyle.Secondary));
  });

  return { embeds: [embed], components: [row] };
}

module.exports = {
  buildPlayerMessage,
  buildIdleMessage,
  buildQueueEmbed,
  buildHistoryEmbed,
  buildPollMessage,
  repeatLabel,
  trim,
};
