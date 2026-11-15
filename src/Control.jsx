// Macros (one click = several actions) and controllers (MIDI pads/keyboards, Stream Deck, Companion).
import { useEffect, useRef, useState } from 'react';
import { uid } from './defaults.js';

const api = window.presenter;

// What a macro step can do. arg: what it needs.
export const STEP_TYPES = [
  { type: 'clearAll', label: 'Clear everything' },
  { type: 'clearSlide', label: 'Clear the slide' },
  { type: 'clearMedia', label: 'Clear the background' },
  { type: 'clearMessage', label: 'Hide the message' },
  { type: 'clearProps', label: 'Hide all props' },
  { type: 'media', label: 'Show background', arg: 'media' },
  { type: 'message', label: 'Show message', arg: 'message' },
  { type: 'propOn', label: 'Show prop', arg: 'prop' },
  { type: 'propOff', label: 'Hide prop', arg: 'prop' },
  { type: 'goto', label: 'Go to the first slide of', arg: 'pres' },
  { type: 'timerStart', label: 'Start countdown (minutes)', arg: 'number' },
  { type: 'timerStop', label: 'Stop countdown' },
  { type: 'stage', label: 'Send stage message', arg: 'text' },
  { type: 'next', label: 'Next slide' },
  { type: 'prev', label: 'Previous slide' },
];

export const defaultMacros = () => [
  { id: uid(), name: 'Pre-service', color: '#6d6af0', steps: [{ type: 'clearAll' }, { type: 'media', arg: 'bg-night' }, { type: 'timerStart', arg: 5 }] },
  { id: uid(), name: 'Start service', color: '#10b981', steps: [{ type: 'clearMessage' }, { type: 'timerStop' }] },
  { id: uid(), name: 'Black screen', color: '#475569', steps: [{ type: 'clearAll' }] },
];

/** Things a button, MIDI pad or Stream Deck key can trigger. */
export function actionList(macros) {
  return [
    ['next', 'Next slide'], ['prev', 'Previous slide'], ['clearAll', 'Clear all'], ['clearSlide', 'Clear slide'],
    ['clearMedia', 'Clear background'], ['clearMessage', 'Clear message'], ['clearProps', 'Clear props'],
    ...(macros || []).map((m) => [`macro:${m.id}`, `Macro: ${m.name}`]),
  ];
}

export function MacroEditor({ macro, show, media, onSave, onDelete, onClose }) {
  const [m, setM] = useState(() => ({ ...macro, steps: [...(macro.steps || [])] }));
  const setStep = (i, patch) => setM((x) => ({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const argInput = (s, i) => {
    const t = STEP_TYPES.find((x) => x.type === s.type);
    if (!t?.arg) return <span />;
    if (t.arg === 'number') return <input className="input small" type="number" min="0" max="600" value={s.arg ?? 5} onChange={(e) => setStep(i, { arg: +e.target.value })} />;
    if (t.arg === 'text') return <input className="input small" value={s.arg || ''} onChange={(e) => setStep(i, { arg: e.target.value })} placeholder="Message" />;
    const opts = t.arg === 'media' ? media.map((x) => [x.id, x.name])
      : t.arg === 'message' ? show.messages.map((x) => [x.id, x.text])
        : t.arg === 'prop' ? (show.props || []).map((x) => [x.id, x.kind === 'logo' ? `Logo · ${x.name || ''}` : `Lower third · ${x.title}`])
          : show.presentations.map((x) => [x.id, x.title]);
    return (
      <select className="input small" value={s.arg || ''} onChange={(e) => setStep(i, { arg: e.target.value })}>
        <option value="">Choose…</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  };
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{macro.name ? 'Edit macro' : 'New macro'}</h3><button className="icon-btn" onClick={onClose}>✕</button></div>
        <div className="panel-body">
          <div className="add-row">
            <input className="input" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="Macro name" autoFocus />
            <input type="color" className="color small sw" value={m.color || '#6d6af0'} onChange={(e) => setM({ ...m, color: e.target.value })} title="Button colour" />
          </div>
          <div className="section-label">Steps, in order</div>
          {m.steps.length === 0 && <div className="empty">Add the first step below.</div>}
          {m.steps.map((s, i) => (
            <div key={i} className="step-row">
              <span className="num">{i + 1}</span>
              <select className="input small" value={s.type} onChange={(e) => setStep(i, { type: e.target.value, arg: undefined })}>
                {STEP_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
              {argInput(s, i)}
              <button className="icon-btn" onClick={() => setM((x) => ({ ...x, steps: x.steps.filter((_, j) => j !== i) }))} title="Remove">✕</button>
            </div>
          ))}
          <button className="btn small" onClick={() => setM((x) => ({ ...x, steps: [...x.steps, { type: 'clearAll' }] }))}>＋ Add step</button>
        </div>
        <div className="modal-foot">
          {macro.id && <button className="btn danger" onClick={() => onDelete(macro.id)}>Delete</button>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave({ ...m, id: m.id || uid(), name: m.name.trim() || 'Macro' })}>Save</button>
        </div>
      </div>
    </div>
  );
}

const midiLabel = (b) => (b ? `${b.kind === 'cc' ? 'CC' : 'Note'} ${b.num} · ch ${b.ch + 1}` : '—');

/** Parse a MIDI message into a binding, or null for messages we ignore (note off, clock…). */
export function midiBinding(data) {
  const [st, num, val] = data;
  const kind = st & 0xf0;
  const ch = st & 0x0f;
  if (kind === 0x90 && val > 0) return { kind: 'note', ch, num };
  if (kind === 0xb0 && val > 63) return { kind: 'cc', ch, num };
  return null;
}
export const sameBinding = (a, b) => !!a && !!b && a.kind === b.kind && a.ch === b.ch && a.num === b.num;

export function ControllersPanel({ macros, midiMap, onMidiMap, learnRef, onClose }) {
  const [tab, setTab] = useState('midi');
  const [devices, setDevices] = useState(null);
  const [midiErr, setMidiErr] = useState('');
  const [learning, setLearning] = useState(null);
  const [remote, setRemote] = useState(null);
  const actions = actionList(macros);
  const mapRef = useRef(midiMap);
  mapRef.current = midiMap;

  useEffect(() => {
    if (!navigator.requestMIDIAccess) { setMidiErr('MIDI is not available here.'); return; }
    navigator.requestMIDIAccess().then((acc) => {
      const list = () => setDevices([...acc.inputs.values()].map((i) => i.name));
      list();
      acc.onstatechange = list;
    }).catch((e) => setMidiErr(e.message));
    api?.remoteInfo?.().then(setRemote);
  }, []);
  // while "learning", the next MIDI button pressed is assigned to that action
  useEffect(() => {
    learnRef.current = learning ? (b) => { onMidiMap({ ...mapRef.current, [learning]: b }); setLearning(null); } : null;
    return () => { learnRef.current = null; };
  }, [learning, learnRef, onMidiMap]);

  const base = remote?.running ? `http://127.0.0.1:${remote.port}` : '';
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal wide-ish" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Controllers</h3><button className="icon-btn" onClick={onClose}>✕</button></div>
        <div className="tabs import-tabs">
          <button className={tab === 'midi' ? 'on' : ''} onClick={() => setTab('midi')}>MIDI</button>
          <button className={tab === 'deck' ? 'on' : ''} onClick={() => setTab('deck')}>Stream Deck / Companion</button>
        </div>
        <div className="panel-body">
          {tab === 'midi' && (
            <>
              <div className="hint">Plug in a MIDI pad, keyboard or foot controller. Press <b>Learn</b>, then the button on the controller.
                {devices && <> Connected: <b>{devices.length ? devices.join(', ') : 'none'}</b>.</>}{midiErr && <> {midiErr}</>}</div>
              <div className="map-list">
                {actions.map(([key, label]) => (
                  <div key={key} className={`map-row ${learning === key ? 'learning' : ''}`}>
                    <span className="title">{label}</span>
                    <span className="muted small mono">{learning === key ? 'Press a button…' : midiLabel(midiMap[key])}</span>
                    <button className="btn small" onClick={() => setLearning(learning === key ? null : key)}>{learning === key ? 'Cancel' : 'Learn'}</button>
                    <button className="icon-btn" disabled={!midiMap[key]} onClick={() => { const n = { ...midiMap }; delete n[key]; onMidiMap(n); }} title="Clear">✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === 'deck' && (
            <>
              <div className="hint">Stream Deck (with a "Website" / "API Ninja" / "Web Requests" action) and Bitfocus Companion (Generic HTTP) can press Evolve's buttons with web links.
                {!remote?.running && <> <b>Switch on the phone remote first</b> (Remote button) — the links use the same server and PIN.</>}</div>
              {base && (
                <div className="map-list">
                  {actions.map(([key, label]) => (
                    <div key={key} className="map-row">
                      <span className="title">{label}</span>
                      <code className="url" title="Click to copy" onClick={() => navigator.clipboard?.writeText(`${base}/api/trigger/${key}?pin=${remote.pin}`)}>{`${base}/api/trigger/${key}?pin=${remote.pin}`}</code>
                    </div>
                  ))}
                </div>
              )}
              <div className="hint">Click a link to copy it. From another computer, use this PC's network address from the Remote window instead of 127.0.0.1.</div>
            </>
          )}
        </div>
        <div className="modal-foot"><div className="spacer" /><button className="btn primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
