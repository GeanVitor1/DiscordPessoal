import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeFailure } from '../desktop/native-errors.js';
import { isRecoverableNativeError, nativeErrorMessage } from '../client/src/interaction/nativeErrors.js';

test('Windows restrictions retain consent and expose actionable errors on both clients', () => {
  for (const code of ['ELEVATION_REQUIRED', 'DESKTOP_UNAVAILABLE', 'INPUT_BLOCKED', 'UNKNOWN_SCAN_CODE', 'UNKNOWN_KEY']) {
    const failure = nativeFailure(`${code}:5`);
    assert.deepEqual(failure, { code, recoverable: true });
    assert.equal(isRecoverableNativeError(failure.code), true);
    assert.ok(nativeErrorMessage(failure.code).length > 30);
  }
  assert.match(nativeErrorMessage('ELEVATION_REQUIRED'), /computador compartilhado.*administrador/);
  assert.match(nativeErrorMessage('DESKTOP_UNAVAILABLE'), /desbloquear/);
});

test('broken protocols and real native failures continue to revoke assistance', () => {
  for (const detail of ['SENDINPUT_FAILED:87', 'PIPE_PEER_REJECTED', 'ACK_TIMEOUT', 'REVOKED', 'TEST_MOUSE_OUTSIDE_WINDOW']) {
    const failure = nativeFailure(detail);
    assert.equal(failure.recoverable, false);
    assert.equal(isRecoverableNativeError(failure.code), false);
  }
});
