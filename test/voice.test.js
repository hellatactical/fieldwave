const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

test('voice transport can load DAVE and create a native session key package', () => {
  // Resolve from the same package that establishes Discord's voice connection.
  const voiceRequire = createRequire(require.resolve('discord-voip'));
  const { DAVESession, DAVE_PROTOCOL_VERSION } = voiceRequire('@snazzah/davey');
  assert.ok(Number.isInteger(DAVE_PROTOCOL_VERSION) && DAVE_PROTOCOL_VERSION > 0);
  const session = new DAVESession(DAVE_PROTOCOL_VERSION, '123456789012345678', '234567890123456789');
  try {
    const keyPackage = session.getSerializedKeyPackage();
    assert.ok(Buffer.isBuffer(keyPackage) && keyPackage.length > 0);
    assert.equal(session.protocolVersion, DAVE_PROTOCOL_VERSION);
  } finally {
    session.reset();
  }
});
