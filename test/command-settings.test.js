const test = require('node:test');
const assert = require('node:assert/strict');
const { catalog, validateCommandSettings, customCommandData } = require('../src/command-settings');

test('validates per-server built-in access and simple custom commands', () => {
  assert.ok(catalog.some(command => command.name === 'play'));
  const settings = validateCommandSettings(
    ['roll'],
    [{ name: ' Rules ', description: ' Show the rules ', response: ' Be kind. ' }],
  );
  assert.deepEqual(settings.disabledCommands, ['roll']);
  assert.deepEqual(settings.customCommands, [{ name: 'rules', description: 'Show the rules', response: 'Be kind.' }]);
  assert.deepEqual(customCommandData(settings.customCommands), [{ name: 'rules', description: 'Show the rules', type: 1 }]);
  assert.throws(() => validateCommandSettings([], [{ name: 'play', description: 'Reserved', response: 'No' }]), /built-in/);
  assert.throws(() => validateCommandSettings([], [{ name: 'Bad Name', description: 'Bad', response: 'No' }]), /lowercase/);
  assert.throws(() => validateCommandSettings(['unknown'], []), /Unknown/);
});
