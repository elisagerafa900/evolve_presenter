// NDI, phone remote and update controls for the operator window.
import { useEffect, useState } from 'react';

const api = window.presenter;

export function NdiPanel({ onClose }) {
  const [st, setSt] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!api?.ndiStatus) return;
    api.ndiStatus().then((s) => { setSt(s); setCfg(s.config); });
    return api.onNdiStatus(setSt);
  }, []);
  const apply = async (patch) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    setBusy(true);
    try { setSt(await api.ndiConfig(next)); } finally { setBusy(false); }
  };
  const setLayout = (layout, patch) => apply({ [layout]: { ...cfg[layout], ...patch } });

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>NDI output</h3><button className="icon-btn" onClick={onClose} title="Close">✕</button></div>
        <div className="panel-body">
          {!api?.ndiStatus && <div className="empty">NDI works in the desktop app.</div>}
          {st && !st.available && (
            <div className="notice warn">
              <b>NDI isn't ready on this PC.</b>
              <span>{st.error}</span>
            </div>
          )}
          {st && cfg && (
            <>
              <div className="hint">Other computers on the same network (vMix, OBS, Wirecast, NDI Studio Monitor) will see these sources as <b>{st.machine} ({cfg.main.name || 'Evolve Presenter'})</b>.</div>
              {[
                ['main', 'Full picture', 'Everything the audience screen shows: background, media, words, props, messages.'],
                ['key', 'Key / overlay', 'Words, props and messages on a see-through background, to lay over a camera.'],
              ].map(([layout, label, desc]) => {
                const src = st.sources?.[layout] || {};
                return (
                  <div key={layout} className={`ndi-row ${src.running ? 'on' : ''}`}>
                    <label className="switch">
                      <input type="checkbox" checked={!!cfg[layout].enabled} disabled={busy || !st.available} onChange={(e) => setLayout(layout, { enabled: e.target.checked })} />
                      <span />
                    </label>
                    <div className="ndi-text">
                      <div className="ndi-title">{label}{src.running && <span className="pill live">{src.connections ? `${src.connections} watching` : 'On air · nobody watching yet'}</span>}</div>
                      <div className="hint">{desc}</div>
                      <input className="input small" value={cfg[layout].name} disabled={busy} onChange={(e) => setCfg({ ...cfg, [layout]: { ...cfg[layout], name: e.target.value } })} onBlur={() => setLayout(layout, {})} placeholder="Source name" />
                    </div>
                  </div>
                );
              })}
              <label className="inline-field">Frame rate
                <select className="input small" value={cfg.fps} disabled={busy} onChange={(e) => apply({ fps: +e.target.value })}>
                  {[25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
                </select>
              </label>
            </>
          )}
          <div className="fine">NDI® is a registered trademark of Vizrt NDI AB. <span className="link-like">ndi.video</span></div>
        </div>
        <div className="modal-foot"><div className="spacer" /><button className="btn primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

export function RemotePanel({ onClose }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!api?.remoteInfo) return;
    api.remoteInfo().then(setInfo);
    const t = setInterval(() => api.remoteInfo().then(setInfo), 3000);
    return () => clearInterval(t);
  }, []);
  const run = async (fn) => { setBusy(true); try { setInfo(await fn()); } finally { setBusy(false); } };

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Phone remote</h3><button className="icon-btn" onClick={onClose} title="Close">✕</button></div>
        <div className="panel-body">
          {!api?.remoteInfo && <div className="empty">The remote works in the desktop app.</div>}
          {info && (
            <>
              <div className={`ndi-row ${info.running ? 'on' : ''}`}>
                <label className="switch">
                  <input type="checkbox" checked={info.running} disabled={busy} onChange={(e) => run(() => api.remoteEnable(e.target.checked))} />
                  <span />
                </label>
                <div className="ndi-text">
                  <div className="ndi-title">Allow phones to control slides{info.running && <span className="pill live">{info.clients ? `${info.clients} connected` : 'Waiting for a phone'}</span>}</div>
                  <div className="hint">The phone must be on the same Wi-Fi as this computer. The first time, Windows may ask to allow Evolve Presenter on the network: choose <b>Private networks</b>.</div>
                </div>
              </div>
              {info.running && (
                <div className="remote-box">
                  {info.qr && <img className="qr" src={info.qr} alt="QR code for the remote address" />}
                  <div className="remote-info">
                    <div className="section-label">On the phone, open</div>
                    {info.urls.length ? info.urls.map((u) => <div key={u} className="remote-url">{u}</div>) : <div className="hint">No network found. Connect this computer to Wi-Fi or a network cable.</div>}
                    <div className="section-label">PIN</div>
                    <div className="remote-pin">{info.pin}</div>
                    <button className="btn small" disabled={busy} onClick={() => run(() => api.remoteNewPin())}>New PIN</button>
                    <div className="hint">A new PIN logs out every phone.</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-foot"><div className="spacer" /><button className="btn primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

export function UpdateButton() {
  const [u, setU] = useState(null);
  useEffect(() => {
    if (!api?.updateStatus) return;
    api.updateStatus().then(setU);
    return api.onUpdateStatus(setU);
  }, []);
  if (!u) return null;
  const label = {
    idle: 'Check for updates', checking: 'Checking…', latest: 'Up to date ✓',
    downloading: `Downloading v${u.newVersion || ''} ${u.percent ?? 0}%`, ready: `Restart to update to v${u.newVersion}`, error: 'Check for updates',
  }[u.state] || 'Check for updates';
  const ready = u.state === 'ready';
  return (
    <span className="update">
      <span>v{u.version}</span>
      <button className={`update-btn ${ready ? 'ready' : ''}`} disabled={u.state === 'checking' || u.state === 'downloading'}
        title={u.state === 'error' ? u.message : ready ? 'Installs now; or it installs by itself when you close the app' : ''}
        onClick={() => (ready ? api.updateInstall() : api.updateCheck())}>{label}</button>
      {u.state === 'error' && <span className="update-err" title={u.message}>⚠</span>}
    </span>
  );
}
