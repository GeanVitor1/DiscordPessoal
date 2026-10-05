import { app } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { UpdateController } from '../desktop/updates.js';
const require = createRequire(import.meta.url), { NsisUpdater } = require('electron-updater');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meuapp-updater-'));
app.setPath('userData', temp);
const { version } = JSON.parse(fs.readFileSync('package.json'));
const installer = path.resolve(`dist/MeuApp-Setup-${version}.exe`), bytes = fs.readFileSync(installer);
const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
const future = offset => { const parts = version.split('.').map(Number); parts[2] += offset; return parts.join('.'); };
const requests = { ok: 0, bad: 0 }, controllers = [];
const server = http.createServer((req, res) => {
  const name = req.url.startsWith('/ok/') ? 'ok' : 'bad';
  if (req.url.includes('latest.yml')) {
    const hash = name === 'ok' ? sha512 : Buffer.alloc(64).toString('base64');
    res.writeHead(200, { 'Content-Type': 'text/yaml' });
    return res.end(`version: ${future(name === 'ok' ? 1 : 2)}\nfiles:\n  - url: update.exe\n    sha512: ${hash}\n    size: ${bytes.length}\npath: update.exe\nsha512: ${hash}\nreleaseDate: ${new Date().toISOString()}\n`);
  }
  requests[name]++; res.writeHead(200, { 'Content-Length': bytes.length, 'Content-Type': 'application/octet-stream' }); fs.createReadStream(installer).pipe(res);
});
let exitCode = 0;
app.whenReady().then(async () => {
try {
  await new Promise(resolve => server.listen(15632, '127.0.0.1', resolve));
  async function exercise(name) {
    const updater = new NsisUpdater({ provider: 'generic', url: `http://127.0.0.1:15632/${name}/` });
    // Electron's standalone test runner reports Electron's own version. Model
    // the installed app version while retaining the actual HTTP/download code.
    updater.currentVersion = createRequire(require.resolve('electron-updater'))('semver').parse(version);
    Object.defineProperty(updater.app, 'version', { value: version });
    updater.forceDevUpdateConfig = true;
    Object.defineProperty(updater.app, 'baseCachePath', { value: temp });
    const config = path.join(temp, `${name}.yml`);
    fs.writeFileSync(config, `provider: generic\nurl: http://127.0.0.1:15632/${name}/\nupdaterCacheDirName: ${name}-cache\n`);
    updater.updateConfigPath = config;
    updater.logger = { info() {}, warn() {}, error() {}, debug() {} };
    const controller = new UpdateController(updater); controllers.push(controller);
    let downloads = 0; const original = updater.downloadUpdate.bind(updater);
    updater.downloadUpdate = (...args) => { downloads++; return original(...args); };
    const result = await updater.checkForUpdates();
    assert.ok(result.downloadPromise, 'the fixture must represent a newer app version');
    if (name === 'ok') {
      const files = await result.downloadPromise;
      assert.equal(crypto.createHash('sha512').update(fs.readFileSync(files[0])).digest('base64'), sha512);
      assert.equal(controller.snapshot().status, 'ready');
      assert.equal(downloads, 1); assert.equal(requests.ok, 1);
      await controller.check(); assert.equal(downloads, 1);
      assert.equal(updater.autoInstallOnAppQuit, true);
    } else {
      await assert.rejects(result.downloadPromise, /checksum mismatch/i);
      assert.equal(controller.snapshot().status, 'error');
      assert.equal(controller.install(), false);
    }
    // Do not install a fixture update onto the user's real application.
    updater.autoInstallOnAppQuit = false;
    return { status: controller.snapshot().status, downloads };
  }
  const good = await exercise('ok'), bad = await exercise('bad');
  const report = { passed: true, version, actualElectronUpdater: true, actualInstallerDownloaded: true, singleAutomaticDownload: true, goodSha512Accepted: true, badSha512Rejected: true, good, bad, installation: 'Not executed; automatic installation flag and install readiness validated without replacing an installed application.', source: 'Local isolated feed; no GitHub release created.' };
  fs.writeFileSync('docs/validation/updater.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { console.error(error.stack); exitCode = 1; }
finally { for (const c of controllers) { c.updater.autoInstallOnAppQuit = false; c.stop(); } server.closeAllConnections(); server.close(); app.exit(exitCode); }
});
