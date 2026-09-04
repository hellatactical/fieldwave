const { format } = require('node:util');
const entries = [];
let installed = false;
function captureLogs() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      let message = format(...args);
      for (const key of ['DISCORD_TOKEN', 'PANEL_PASSWORD']) {
        if (process.env[key]) message = message.split(process.env[key]).join('[REDACTED]');
      }
      message = message.replace(/(https?:\/\/[^\s?]+)\?[^\s]+/g, '$1?[REDACTED]');
      entries.push({ time: new Date().toISOString(), level, message: message.slice(0, 2000) });
      if (entries.length > 200) entries.shift();
      original(message);
    };
  }
}
module.exports = { captureLogs, recentLogs: () => entries.slice(-100) };
