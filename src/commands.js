const { SlashCommandBuilder } = require('discord.js');
const { QueueRepeatMode } = require('discord-player');

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play or queue a song, link, album, or playlist')
    .addStringOption(o => o.setName('query').setDescription('Song name or link').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('pause').setDescription('Pause the current song'),
  new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  new SlashCommandBuilder().setName('skip').setDescription('Skip the current song'),
  new SlashCommandBuilder().setName('previous').setDescription('Go back to the previous song'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop playback, clear the queue, and leave voice'),
  new SlashCommandBuilder().setName('disconnect').setDescription('Disconnect the bot from voice'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the current queue'),
  new SlashCommandBuilder().setName('history').setDescription('Show recently played songs'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show or refresh the player card'),
  new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the upcoming queue'),
  new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set repeat mode')
    .addIntegerOption(o => o.setName('mode').setDescription('Repeat mode').setRequired(true).addChoices(
      { name: 'Off', value: QueueRepeatMode.OFF },
      { name: 'Current track', value: QueueRepeatMode.TRACK },
      { name: 'Whole queue', value: QueueRepeatMode.QUEUE },
    )),
  new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Keep playing related songs when the queue ends')
    .addBooleanOption(o => o.setName('enabled').setDescription('Turn related-song autoplay on or off').setRequired(true)),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set playback volume')
    .addIntegerOption(o => o.setName('level').setDescription('0 to 100').setMinValue(0).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a song from the upcoming queue')
    .addIntegerOption(o => o.setName('position').setDescription('Queue position, starting at 1').setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Clear upcoming songs without stopping the current song'),

  new SlashCommandBuilder().setName('ping').setDescription('Show bot latency'),
  new SlashCommandBuilder().setName('uptime').setDescription('Show how long the bot has been online'),
  new SlashCommandBuilder()
    .setName('choose')
    .setDescription('Choose one item from a comma-separated list')
    .addStringOption(o => o.setName('options').setDescription('Example: pizza, tacos, burgers').setRequired(true)),
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice')
    .addStringOption(o => o.setName('dice').setDescription('Example: d20 or 2d6').setRequired(false)),
  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a simple button poll')
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
    .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
    .addStringOption(o => o.setName('option3').setDescription('Option 3').setRequired(false))
    .addStringOption(o => o.setName('option4').setDescription('Option 4').setRequired(false))
    .addStringOption(o => o.setName('option5').setDescription('Option 5').setRequired(false)),
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Show a user's avatar")
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show basic information about a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Show basic information about this server'),
];

module.exports = { commands };
