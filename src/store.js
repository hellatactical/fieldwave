const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll() {
  ensureDir();
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return { guilds: {} };
  }
}

let db = loadAll();

function save() {
  ensureDir();
  const tmp = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, SETTINGS_FILE);
}

function getGuild(guildId) {
  const defaultVolume = Math.max(0, Math.min(100, Number(process.env.DEFAULT_VOLUME || 75)));
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      volume: defaultVolume,
      autoplay: false,
      disabledCommands: [],
      customCommands: [],
    };
    save();
  }
  if (!Array.isArray(db.guilds[guildId].disabledCommands) || !Array.isArray(db.guilds[guildId].customCommands)) {
    db.guilds[guildId] = {
      ...db.guilds[guildId],
      disabledCommands: Array.isArray(db.guilds[guildId].disabledCommands) ? db.guilds[guildId].disabledCommands : [],
      customCommands: Array.isArray(db.guilds[guildId].customCommands) ? db.guilds[guildId].customCommands : [],
    };
    save();
  }
  return db.guilds[guildId];
}

function patchGuild(guildId, patch) {
  const current = getGuild(guildId);
  db.guilds[guildId] = { ...current, ...patch };
  save();
  return db.guilds[guildId];
}

function getBot() {
  return { status: db.bot?.status || process.env.BOT_STATUS || '/play' };
}

function patchBot(patch) {
  db.bot = { ...getBot(), ...patch };
  save();
  return getBot();
}

module.exports = { getGuild, patchGuild, getBot, patchBot };
