import test from 'node:test';
import assert from 'node:assert/strict';
import { requireMediaDevices } from '../src/rtc/capabilities.js';

test('LAN HTTP without mediaDevices explains HTTPS instead of throwing a TypeError', () => {
  for (const method of ['enumerateDevices', 'getUserMedia', 'getDisplayMedia']) {
    assert.throws(() => requireMediaDevices(method, {}, { isSecureContext: false }), error =>
      error.name === 'Error' && error.message.includes('HTTPS') && !error.message.includes('undefined'));
  }
});

test('missing capture API is handled independently from a secure context', () => {
  assert.throws(() => requireMediaDevices('getDisplayMedia', { mediaDevices: {} }, { isSecureContext: true }), /navegador/);
});

test('media methods retain their native receiver and propagate permission errors', async () => {
  const devices = { async getUserMedia() { assert.equal(this, devices); throw new DOMException('Denied', 'NotAllowedError'); } };
  await assert.rejects(requireMediaDevices('getUserMedia', { mediaDevices: devices }, { isSecureContext: true }).getUserMedia(), { name: 'NotAllowedError' });
});
