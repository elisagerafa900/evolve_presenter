const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const h = (_e, v) => cb(v);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('presenter', {
  isElectron: true,
  listDisplays: () => ipcRenderer.invoke('displays:list'),
  onDisplaysChanged: on('displays:changed'),
  openOut: (kind, displayId) => ipcRenderer.invoke('out:open', kind, displayId),
  closeOut: (kind) => ipcRenderer.invoke('out:close', kind),
  outStatus: () => ipcRenderer.invoke('out:status'),
  onOutStatus: on('out:status'),
  sendLive: (state) => ipcRenderer.send('live:state', state),
  getLive: () => ipcRenderer.invoke('live:get'),
  onLive: on('live:state'),
  storeGet: (name) => ipcRenderer.invoke('store:get', name),
  storeSet: (name, data) => ipcRenderer.invoke('store:set', name, data),
  mediaImport: () => ipcRenderer.invoke('media:import'),
  mediaImportPaths: (paths) => ipcRenderer.invoke('media:importPaths', paths),
  mediaDelete: (file) => ipcRenderer.invoke('media:delete', file),
  mediaBase: () => ipcRenderer.invoke('media:base'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  ndiStatus: () => ipcRenderer.invoke('ndi:status'),
  ndiConfig: (cfg) => ipcRenderer.invoke('ndi:config', cfg),
  onNdiStatus: on('ndi:status'),
  remoteInfo: () => ipcRenderer.invoke('remote:info'),
  remoteEnable: (on) => ipcRenderer.invoke('remote:enable', on),
  remoteNewPin: () => ipcRenderer.invoke('remote:newPin'),
  sendRemoteState: (st) => ipcRenderer.send('remote:state', st),
  onRemoteCmd: on('remote:cmd'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: on('update:status'),
  biblesList: () => ipcRenderer.invoke('bibles:list'),
  biblesSave: (id, name, json) => ipcRenderer.invoke('bibles:save', id, name, json),
  biblesRead: (id) => ipcRenderer.invoke('bibles:read', id),
  biblesRemove: (id) => ipcRenderer.invoke('bibles:remove', id),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  saveFiles: (files) => ipcRenderer.invoke('file:saveMany', files),
  openFile: () => ipcRenderer.invoke('file:open'),
  appVersion: () => ipcRenderer.invoke('update:status').then((s) => s.version),
});
