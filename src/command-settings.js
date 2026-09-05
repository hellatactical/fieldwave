const { commands } = require('./commands');

const catalog = commands.map(command => ({
  name: command.name,
  description: command.description,
}));
const builtInNames = new Set(catalog.map(command => command.name));
const commandNamePattern = /^[a-z0-9_-]{1,32}$/;

function validateCommandSettings(disabledCommands, customCommands) {
  if (!Array.isArray(disabledCommands) || !Array.isArray(customCommands)) {
    throw new Error('Invalid command settings.');
  }

  const disabled = [...new Set(disabledCommands)].filter(name => builtInNames.has(name));
  if (disabled.length !== disabledCommands.length) throw new Error('Unknown built-in command.');
  if (customCommands.length > 5) throw new Error('You can create up to 5 custom commands per server.');

  const seen = new Set();
  const custom = customCommands.map(item => {
    const name = typeof item?.name === 'string' ? item.name.trim().toLowerCase() : '';
    const description = typeof item?.description === 'string' ? item.description.trim() : '';
    const response = typeof item?.response === 'string' ? item.response.trim() : '';
    if (!commandNamePattern.test(name)) throw new Error('Command names use 1–32 lowercase letters, numbers, dashes, or underscores.');
    if (builtInNames.has(name)) throw new Error(`/${name} is already a built-in command.`);
    if (seen.has(name)) throw new Error(`/${name} is listed more than once.`);
    if (!description || description.length > 100) throw new Error('Command descriptions must be 1–100 characters.');
    if (!response || response.length > 1200) throw new Error('Command responses must be 1–1200 characters.');
    seen.add(name);
    return { name, description, response };
  });

  return { disabledCommands: disabled, customCommands: custom };
}

function customCommandData(customCommands) {
  return customCommands.map(({ name, description }) => ({ name, description, type: 1 }));
}

module.exports = { catalog, builtInNames, validateCommandSettings, customCommandData };
