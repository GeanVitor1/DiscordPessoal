// Keep state in the main process: login and settings can subscribe at any time.
export class UpdateController {
  constructor(updater, { publish = () => {}, log = () => {} } = {}) {
    this.updater = updater;
    this.publish = publish;
    this.log = log;
    this.state = { status: updater ? 'idle' : 'disabled', percent: 0 };
    this.checking = null;
    this.downloading = null;
    this.listeners = [];
    if (!updater) return;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowDowngrade = false;
    updater.disableDifferentialDownload = true;
    updater.disableWebInstaller = true;
    const on = (event, listener) => { updater.on(event, listener); this.listeners.push([event, listener]); };
    on('checking-for-update', () => this.set({ status: 'checking', error: undefined }));
    on('update-available', info => this.set({ status: 'available', version: info.version, error: undefined }));
    // electron-updater performs the automatic download. Starting another download
    // in update-available races its own download and loses accurate progress.
    on('download-progress', info => this.set({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(info.percent || 0))) }));
    on('update-downloaded', info => this.set({ status: 'ready', version: info.version, percent: 100, error: undefined }));
    on('update-not-available', () => this.set({ status: 'up-to-date', error: undefined }));
    on('error', error => this.failed(error));
  }
  snapshot() { return { ...this.state }; }
  set(value) { this.state = { ...this.state, ...value }; this.publish(this.snapshot()); }
  failed(error) {
    this.log('Falha ao atualizar', { code: error?.code, error: error?.message });
    const noRelease = error?.statusCode === 404 || error?.code === 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND' || /404|No published versions|No releases|Unable to find latest version/.test(error?.message || '');
    this.set({ status: noRelease ? 'no-release' : 'error', error: noRelease ? 'Ainda não há uma atualização publicada. Você pode continuar usando o aplicativo.' : 'Não foi possível verificar ou baixar a atualização. Tentaremos novamente automaticamente.' });
  }
  check() {
    if (!this.updater) return Promise.resolve(this.snapshot());
    if (this.checking) return this.checking;
    if (['available', 'downloading', 'ready'].includes(this.state.status)) return Promise.resolve(this.snapshot());
    this.checking = Promise.resolve().then(() => this.updater.checkForUpdates()).then(result => {
      result?.downloadPromise?.catch(error => this.failed(error));
      return this.snapshot();
    }).catch(error => { this.failed(error); return this.snapshot(); }).finally(() => { this.checking = null; });
    return this.checking;
  }
  download() {
    if (!this.updater || this.state.status !== 'available') return Promise.resolve(this.snapshot());
    if (this.downloading) return this.downloading;
    this.set({ status: 'downloading', percent: 0 });
    this.downloading = Promise.resolve().then(() => this.updater.downloadUpdate()).catch(error => this.failed(error)).then(() => this.snapshot()).finally(() => { this.downloading = null; });
    return this.downloading;
  }
  install() {
    if (!this.updater || this.state.status !== 'ready') return false;
    this.updater.quitAndInstall(false, true);
    return true;
  }
  start() {
    if (!this.updater || this.firstTimer) return;
    this.firstTimer = setTimeout(() => this.check(), 5000);
    this.interval = setInterval(() => this.check(), 15 * 60 * 1000);
    this.firstTimer.unref?.(); this.interval.unref?.();
  }
  stop() {
    clearTimeout(this.firstTimer); clearInterval(this.interval);
    this.firstTimer = null;
    for (const [event, listener] of this.listeners) this.updater.removeListener(event, listener);
    this.listeners = [];
  }
}
