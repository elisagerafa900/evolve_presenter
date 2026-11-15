// Evolve Presenter — Electron main process.
// Windows: operator, audience output, stage display. Also: saving the show,
// importing media files, and a tiny local server that plays them (with seeking).
const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const ndi = require('./ndi.cjs');
const { createRemote } = require('./remote.cjs');
const bibles = require('./bibles.cjs');

const DEV = process.env.VITE_DEV === '1';
const DEV_URL = 'http://localhost:5183';
const DIST = path.join(__dirname, '..', 'dist');

let operatorWin = null;
const outs = { audience: null, stage: null };
let lastLive = null;
let dataDir = null;
let mediaDir = null;
let mediaBase = '';

function loadPage(win, page, query = {}) {
  if (DEV) {
    const qs = new URLSearchParams(query).toString();
    return win.loadURL(`${DEV_URL}/${page}${qs ? `?${qs}` : ''}`);
  }
  return win.loadFile(path.join(DIST, page), { query });
}

const webPreferences = () => ({ preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true });

function createOperator() {
  operatorWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1180, minHeight: 700,
    backgroundColor: '#0e1116', title: 'Evolve Presenter', webPreferences: webPreferences(),
  });
  operatorWin.removeMenu();
  // The app page never navigates away (e.g. when a file is dropped) and never opens pop-ups.
  operatorWin.webContents.on('will-navigate', (e) => e.preventDefault());
  operatorWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  loadPage(operatorWin, 'index.html');
  operatorWin.on('closed', () => {
    operatorWin = null;
    for (const k of Object.keys(outs)) outs[k]?.destroy();
    for (const layout of [...ndiSources.keys()]) stopNdi(layout);
    remote?.stop();
    app.quit();
  });
}

// ---------- outputs ----------
const outStatus = () => ({ audience: !!outs.audience, stage: !!outs.stage });
const sendStatus = () => operatorWin?.webContents.send('out:status', outStatus());

function openOut(kind, displayId) {
  if (!(kind in outs)) return;
  const primary = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays();
  const target = displays.find((d) => d.id === displayId) || displays.find((d) => d.id !== primary.id) || primary;
  const onPrimary = target.id === primary.id;
  outs[kind]?.destroy();
  // On a second screen: full screen. On the operator's own screen: a normal window (handy for testing).
  const win = new BrowserWindow(
    onPrimary
      ? { width: 960, height: 540, backgroundColor: '#000000', title: kind === 'stage' ? 'Stage display' : 'Audience output', autoHideMenuBar: true, webPreferences: webPreferences() }
      : { ...target.bounds, frame: false, fullscreen: true, skipTaskbar: true, focusable: false, backgroundColor: '#000000', webPreferences: webPreferences() },
  );
  outs[kind] = win;
  win.removeMenu();
  loadPage(win, 'output.html', { view: kind });
  win.webContents.on('did-finish-load', () => { if (lastLive) win.webContents.send('live:state', lastLive); });
  win.on('closed', () => { if (outs[kind] === win) { outs[kind] = null; sendStatus(); } });
  sendStatus();
}

ipcMain.handle('displays:list', () => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id, primary: d.id === primary,
    label: `${d.id === primary ? 'This screen' : `Screen ${i + 1}`} · ${d.size.width}×${d.size.height}`,
  }));
});
ipcMain.handle('out:open', (_e, kind, displayId) => openOut(kind, displayId));
ipcMain.handle('out:close', (_e, kind) => outs[kind]?.close());
ipcMain.handle('out:status', () => outStatus());
ipcMain.on('live:state', (_e, state) => {
  lastLive = state;
  for (const w of Object.values(outs)) w?.webContents.send('live:state', state);
  for (const src of ndiSources.values()) src.win.webContents.send('live:state', state);
});

// ---------- settings (NDI, remote) kept between runs ----------
let settings = {};
const settingsFile = () => path.join(dataDir, 'settings.json');
function loadSettings() { try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}; } catch { settings = {}; } }
function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch { /* read-only disk */ }
}

// ---------- NDI outputs (drawn off-screen, sent as NDI video) ----------
// main: the full audience picture. key: words, props and messages on a see-through background
// (for vMix / OBS overlays on top of the camera).
const NDI_W = 1920;
const NDI_H = 1080;
const NDI_DEFAULT = { fps: 30, main: { enabled: false, name: 'Evolve Presenter' }, key: { enabled: false, name: 'Evolve Presenter Key' } };
const ndiSources = new Map();
let ndiConfig = NDI_DEFAULT;
let ndiLastError = null;

function stopNdi(layout) {
  const src = ndiSources.get(layout);
  if (!src) return;
  clearInterval(src.timer);
  if (src.win && !src.win.isDestroyed()) src.win.destroy();
  try { src.sender.destroy(); } catch { /* already gone */ }
  ndiSources.delete(layout);
}

function startNdi(layout, name) {
  let sender;
  try { sender = new ndi.Sender(name); } catch (e) { ndiLastError = e.message; return; }
  const key = layout === 'key';
  const win = new BrowserWindow({
    show: false, width: NDI_W, height: NDI_H, useContentSize: true, frame: false,
    transparent: key, backgroundColor: key ? '#00000000' : '#000000',
    webPreferences: { ...webPreferences(), offscreen: true },
  });
  const src = { layout, name, fps: ndiConfig.fps, win, sender, image: null, dirty: false, lastSent: 0, timer: null };
  win.webContents.setFrameRate(ndiConfig.fps);
  win.webContents.on('paint', (_e, _dirty, image) => { src.image = image; src.dirty = true; });
  win.webContents.on('did-finish-load', () => { win.webContents.setZoomFactor(1); if (lastLive) win.webContents.send('live:state', lastLive); });
  loadPage(win, 'output.html', key ? { view: 'audience', alpha: '1' } : { view: 'audience' });
  // Send when the picture changes, and once a second anyway so receivers stay happy.
  src.timer = setInterval(() => {
    if (!src.image) return;
    const now = Date.now();
    if (!src.dirty && now - src.lastSent < 1000) return;
    if (src.sender.connections() === 0) return; // nobody watching: save the CPU
    let img = src.image;
    const size = img.getSize();
    if (size.width !== NDI_W || size.height !== NDI_H) img = img.resize({ width: NDI_W, height: NDI_H, quality: 'good' });
    const buf = img.toBitmap(); // BGRA
    if (key) ndi.unpremultiply(buf);
    src.sender.send(buf, NDI_W, NDI_H, ndiConfig.fps);
    src.dirty = false;
    src.lastSent = now;
  }, Math.round(1000 / ndiConfig.fps));
  ndiSources.set(layout, src);
}

function ndiStatus() {
  const st = ndi.status();
  const sources = {};
  for (const layout of ['main', 'key']) {
    const s = ndiSources.get(layout);
    sources[layout] = s ? { running: true, name: s.name, connections: s.sender.connections() } : { running: false };
  }
  return { ...st, error: ndiLastError || st.error, machine: os.hostname(), config: ndiConfig, sources };
}

function applyNdi(cfg) {
  ndiConfig = {
    fps: [25, 30, 50, 60].includes(+cfg?.fps) ? +cfg.fps : ndiConfig.fps,
    main: { ...ndiConfig.main, ...(cfg?.main || {}) },
    key: { ...ndiConfig.key, ...(cfg?.key || {}) },
  };
  ndiLastError = null;
  for (const layout of ['main', 'key']) {
    const want = ndiConfig[layout];
    const name = String(want.name || '').trim().slice(0, 60) || NDI_DEFAULT[layout].name;
    const have = ndiSources.get(layout);
    if (have && (!want.enabled || have.name !== name || have.fps !== ndiConfig.fps)) stopNdi(layout);
    if (want.enabled && !ndiSources.has(layout)) startNdi(layout, name);
  }
  saveSettings({ ndi: ndiConfig });
  return ndiStatus();
}
ipcMain.handle('ndi:status', () => ndiStatus());
ipcMain.handle('ndi:config', (_e, cfg) => applyNdi(cfg));

// ---------- phone remote ----------
let remote = null;
const remoteInfo = async () => {
  const info = remote.info();
  let qr = '';
  if (info.urls[0]) {
    try { qr = await require('qrcode').toDataURL(info.urls[0], { margin: 1, width: 220 }); } catch { /* no QR */ }
  }
  return { ...info, qr };
};
ipcMain.handle('remote:info', () => remoteInfo());
ipcMain.handle('remote:enable', async (_e, on) => {
  if (on) await remote.start(); else remote.stop();
  saveSettings({ remote: { enabled: !!on, pin: remote.pin } });
  return remoteInfo();
});
ipcMain.handle('remote:newPin', () => { remote.newPin(); saveSettings({ remote: { ...(settings.remote || {}), pin: remote.pin } }); return remoteInfo(); });
ipcMain.on('remote:state', (_e, st) => remote?.push(st));

// ---------- automatic updates (GitHub Releases: elisagerafa900/evolve-presenter-releases) ----------
let updateState = { state: 'idle', version: app.getVersion() };
function sendUpdate(patch) {
  updateState = { ...updateState, ...patch };
  operatorWin?.webContents.send('update:status', updateState);
}
let checkUpdates = () => sendUpdate({ state: 'error', message: 'Updates work in the installed app (Setup .exe), not with npm run dev.' });
let installUpdate = () => {};
ipcMain.handle('update:status', () => updateState);
ipcMain.handle('update:check', () => { checkUpdates(); return updateState; });
ipcMain.handle('update:install', () => installUpdate());
function setupUpdates() {
  if (DEV || !app.isPackaged) return; // only the installed app updates itself
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true; // download quietly in the background
  autoUpdater.autoInstallOnAppQuit = true; // install when the app is closed — never in the middle of a service
  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => sendUpdate({ state: 'downloading', newVersion: i.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'latest', checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ state: 'ready', newVersion: i.version }));
  autoUpdater.on('error', (e) => sendUpdate({ state: 'error', message: String(e?.message || e).split('\n')[0] }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  checkUpdates = check;
  setTimeout(check, 15000);
  setInterval(check, 4 * 60 * 60 * 1000);
  installUpdate = async () => {
    const r = await dialog.showMessageBox(operatorWin, {
      type: 'question', buttons: ['Restart and update now', 'Later (when I close the app)'], defaultId: 1, cancelId: 1,
      title: 'Update ready', message: `Version ${updateState.newVersion} is ready.`,
      detail: 'Evolve Presenter and its output screens will close for a few seconds, then open again.',
    });
    if (r.response === 0) autoUpdater.quitAndInstall(true, true);
  };
}
ipcMain.handle('live:get', () => lastLive);

// ---------- saving the show (JSON files in the app's data folder) ----------
const docFile = (name) => path.join(dataDir, `${String(name).replace(/[^a-z0-9_-]/gi, '')}.json`);
ipcMain.handle('store:get', (_e, name) => {
  try { return JSON.parse(fs.readFileSync(docFile(name), 'utf8')); } catch { return null; }
});
ipcMain.handle('store:set', (_e, name, data) => {
  const f = docFile(name);
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(data));
  fs.renameSync(`${f}.tmp`, f); // never leave a half-written file
  return true;
});

// ---------- media ----------
const IMAGE = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
const VIDEO = ['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.mkv'];
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg', '.mkv': 'video/x-matroska' };

function importFiles(files) {
  const out = [];
  files.forEach((src, i) => {
    const ext = path.extname(src).toLowerCase();
    const kind = IMAGE.includes(ext) ? 'image' : VIDEO.includes(ext) ? 'video' : null;
    if (!kind) return;
    const file = `${Date.now().toString(36)}${i}${ext}`;
    fs.copyFileSync(src, path.join(mediaDir, file));
    out.push({ id: file, file, kind, name: path.basename(src, ext).slice(0, 60) });
  });
  return out;
}
ipcMain.handle('media:import', async () => {
  const r = await dialog.showOpenDialog(operatorWin, {
    title: 'Add images or videos',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images and videos', extensions: [...IMAGE, ...VIDEO].map((e) => e.slice(1)) }],
  });
  return r.canceled ? [] : importFiles(r.filePaths);
});
ipcMain.handle('media:importPaths', (_e, paths) => importFiles(paths || []));
ipcMain.handle('media:delete', (_e, file) => {
  if (/^[\w.-]+$/.test(file)) fs.rmSync(path.join(mediaDir, file), { force: true });
  return true;
});
ipcMain.handle('media:base', () => mediaBase);

// ---------- imported Bibles (kept in the data folder, survive updates) ----------
ipcMain.handle('bibles:list', () => bibles.list());
ipcMain.handle('bibles:save', (_e, id, name, json) => bibles.save(id, name, json));
ipcMain.handle('bibles:read', (_e, id) => bibles.read(id));
ipcMain.handle('bibles:remove', (_e, id) => bibles.remove(id));

// ---------- export / back up / restore ----------
ipcMain.handle('file:save', async (_e, { name, content, kind }) => {
  const filters = kind === 'xml' ? [{ name: 'OpenLyrics song', extensions: ['xml'] }] : [{ name: 'Evolve backup', extensions: ['json'] }];
  const r = await dialog.showSaveDialog(operatorWin, { defaultPath: path.join(app.getPath('documents'), String(name || 'export').replace(/[\\/:*?"<>|]/g, '')), filters });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, String(content));
  return r.filePath;
});
ipcMain.handle('file:saveMany', async (_e, files) => {
  const r = await dialog.showOpenDialog(operatorWin, { title: 'Choose a folder for the songs', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const used = new Set();
  for (const f of files || []) {
    let n = String(f.name || 'song.xml').replace(/[\\/:*?"<>|]/g, '');
    for (let i = 2; used.has(n.toLowerCase()); i++) n = n.replace(/( \(\d+\))?\.xml$/i, ` (${i}).xml`);
    used.add(n.toLowerCase());
    fs.writeFileSync(path.join(r.filePaths[0], n), String(f.content));
  }
  return r.filePaths[0];
});
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(operatorWin, { title: 'Restore a backup', properties: ['openFile'], filters: [{ name: 'Evolve backup', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});

// Only these sites can be opened in the user's browser from the app.
const EXTERNAL_HOSTS = new Set(['songselect.ccli.com', 'ccli.com', 'www.ccli.com', 'openlyrics.org']);
ipcMain.handle('open:external', (_e, url) => {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' || !EXTERNAL_HOSTS.has(u.hostname)) return false;
    shell.openExternal(u.toString());
    return true;
  } catch { return false; }
});

/** Serves imported media on this PC only. Supports Range so videos can loop and seek. */
function startMediaServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const m = /^\/media\/([\w.-]+)$/.exec(new URL(req.url, 'http://x').pathname);
      if (!m) { res.writeHead(404); return res.end(); }
      const file = path.join(mediaDir, m[1]);
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
        if (range) {
          const start = range[1] ? +range[1] : 0;
          const end = Math.min(range[2] ? +range[2] : st.size - 1, st.size - 1);
          if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
          res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
          fs.createReadStream(file, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size, 'Cache-Control': 'max-age=3600' });
          fs.createReadStream(file).pipe(res);
        }
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${srv.address().port}/media/`));
  });
}

app.whenReady().then(async () => {
  dataDir = path.join(app.getPath('userData'), 'data');
  mediaDir = path.join(app.getPath('userData'), 'media');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(mediaDir, { recursive: true });
  mediaBase = await startMediaServer();
  loadSettings();
  bibles.setDir(path.join(app.getPath('userData'), 'bibles'));
  // MIDI controllers: allow Web MIDI for our own pages (no SysEx)
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'midi'));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'midi');
  remote = createRemote({
    pin: settings.remote?.pin,
    onCommand: (c) => operatorWin?.webContents.send('remote:cmd', c),
  });
  if (!settings.remote?.pin) saveSettings({ remote: { enabled: false, pin: remote.pin } });
  createOperator();
  operatorWin.webContents.once('did-finish-load', () => {
    if (settings.remote?.enabled) remote.start();
    if (settings.ndi && (settings.ndi.main?.enabled || settings.ndi.key?.enabled)) applyNdi(settings.ndi);
    else if (settings.ndi) ndiConfig = { ...NDI_DEFAULT, ...settings.ndi };
  });
  setupUpdates();
  // keep the NDI window's "who is watching" count fresh
  setInterval(() => { if (operatorWin && ndiSources.size) operatorWin.webContents.send('ndi:status', ndiStatus()); }, 3000);
  const changed = () => operatorWin?.webContents.send('displays:changed');
  screen.on('display-added', changed);
  screen.on('display-removed', changed);
});

app.on('window-all-closed', () => app.quit());
