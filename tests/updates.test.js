import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { UpdateController } from '../desktop/updates.js';

test('automatic updates download once, survive late subscribers, and install only when verified', async () => {
  const updater = new EventEmitter();
  let checks = 0, downloads = 0, installs = 0;
  updater.checkForUpdates = async () => {
    checks++; updater.emit('checking-for-update'); updater.emit('update-available', { version: '1.0.15' });
    // Match the real library's automatic download.
    if (updater.autoDownload) await updater.downloadUpdate();
  };
  updater.downloadUpdate = async () => { downloads++; updater.emit('download-progress', { percent: 42 }); updater.emit('update-downloaded', { version: '1.0.15' }); };
  updater.quitAndInstall = (...args) => { assert.deepEqual(args, [false, true]); installs++; };
  const controller = new UpdateController(updater);
  assert.equal(controller.install(), false);
  await Promise.all([controller.check(), controller.check()]);
  assert.equal(checks, 1); assert.equal(downloads, 1);
  assert.deepEqual(controller.snapshot(), { status: 'ready', version: '1.0.15', percent: 100, error: undefined });
  await controller.check(); assert.equal(checks, 1, 'a periodic check cannot discard a downloaded update');
  assert.equal(controller.install(), true); assert.equal(installs, 1);
  assert.equal(updater.autoInstallOnAppQuit, true); assert.equal(updater.allowDowngrade, false);
  controller.stop(); assert.equal(updater.listenerCount('error'), 0);
});

test('missing releases and offline feeds never appear as up-to-date; checks recover', async () => {
  const updater = new EventEmitter(), controller = new UpdateController(updater);
  updater.checkForUpdates = async () => { throw Object.assign(new Error('404'), { statusCode: 404 }); };
  assert.equal((await controller.check()).status, 'no-release');
  updater.checkForUpdates = async () => { throw new Error('ECONNRESET'); };
  assert.equal((await controller.check()).status, 'error');
  updater.checkForUpdates = async () => updater.emit('update-not-available');
  assert.equal((await controller.check()).status, 'up-to-date');
  assert.equal(controller.install(), false);
  controller.stop();
});
