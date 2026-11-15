import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parsePresentation, groupColor, formatDuration, groupNames, arrangeSlides, presentationSlides } from '../shared/presentation.js';
import { AudienceView, Canvas, StageView, FONTS, DEFAULT_THEME, DEFAULT_BOX, BOX_PRESETS, TRANSITIONS, useNow, timerMs } from './Render.jsx';
import { BUILTIN_MEDIA, defaultShow, uid } from './defaults.js';
import ImportSongs, { isSongFile, readSongFiles } from './ImportSongs.jsx';
import { NdiPanel, RemotePanel, UpdateButton } from './Panels.jsx';
import BiblePanel from './BiblePanel.jsx';
import Designer from './Designer.jsx';
import { MacroEditor, ControllersPanel, defaultMacros, midiBinding, sameBinding } from './Control.jsx';
import { toOpenLyrics, exportFileName } from '../shared/songExport.js';

const api = window.presenter; // undefined in a plain browser

// ---------- saving ----------
async function loadShow() {
  try {
    if (api?.storeGet) return (await api.storeGet('show')) || null;
    const s = localStorage.getItem('ep.show');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}
function saveShow(show) {
  try {
    if (api?.storeSet) api.storeSet('show', show);
    else localStorage.setItem('ep.show', JSON.stringify(show));
  } catch { /* disk full / blocked */ }
}

// ---------- light / dark ----------
function useUiTheme() {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('ep.ui') || 'system'; } catch { return 'system'; } });
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode; };
    apply();
    mq.addEventListener('change', apply);
    try { localStorage.setItem('ep.ui', mode); } catch { /* ignore */ }
    return () => mq.removeEventListener('change', apply);
  }, [mode]);
  return [mode, setMode];
}

// ---------- editor (reflow style: type the words, blank line = new slide) ----------
function Editor({ value, media, theme, onSave, onDelete, onExport, onClose }) {
  const [title, setTitle] = useState(value.title || '');
  const [credits, setCredits] = useState(value.credits || '');
  const [text, setText] = useState(value.text || '');
  const [arrangement, setArrangement] = useState(value.arrangement || []);
  const [style, setStyle] = useState(value.style || null); // null = use the show's text style
  const [pane, setPane] = useState('words');
  const [design, setDesign] = useState(value.design || null);
  const typed = useMemo(() => parsePresentation(text), [text]);
  const groups = useMemo(() => groupNames(typed), [typed]);
  const slides = useMemo(() => arrangeSlides(typed, arrangement), [typed, arrangement]);
  const setSt = (patch) => setStyle((s) => ({ ...(s || {}), ...patch }));
  const save = () => onSave({ ...value, title: title.trim() || 'Untitled', credits: credits.trim(), text, arrangement: arrangement.filter((g) => groups.some((x) => x.toLowerCase() === g.toLowerCase())), style, design: design && (design.box || design.objects?.length) ? design : undefined });
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{value.id ? 'Edit presentation' : 'New presentation'}</h3>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="tabs editor-tabs">
          <button className={pane === 'words' ? 'on' : ''} onClick={() => setPane('words')}>Words</button>
          <button className={pane === 'arrange' ? 'on' : ''} onClick={() => setPane('arrange')}>Arrangement{arrangement.length ? ' ●' : ''}</button>
          <button className={pane === 'look' ? 'on' : ''} onClick={() => setPane('look')}>Look{style ? ' ●' : ''}</button>
          <button className={pane === 'design' ? 'on' : ''} onClick={() => setPane('design')}>Design{design?.box || design?.objects?.length ? ' ●' : ''}</button>
        </div>
        <div className={`editor ${pane === 'design' ? 'single' : ''}`}>
          {pane === 'design' && (
            <Designer design={design} onChange={setDesign} media={media} sampleText={slides[0]?.text}
              theme={{ ...theme, ...(style || {}) }} background={media.find((m) => m.id === style?.mediaId)?.css || theme.background} />
          )}
          {pane !== 'design' && <div className="editor-form">
            {pane === 'words' && (
              <>
                <label>Title<input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song or item title" /></label>
                <label>Credits <span className="muted">(author, copyright, CCLI)</span><input className="input" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="Optional" /></label>
                <label className="grow">Words
                  <textarea className="input area" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
                    placeholder={'[Verse 1]\nFirst line\nSecond line\n\nNext slide starts after a blank line\n\n[Chorus]\n…'} />
                </label>
                <div className="hint">A blank line starts a new slide. A line like <code>[Verse 1]</code>, <code>Chorus</code> or <code>[Blank]</code> starts a group.</div>
              </>
            )}
            {pane === 'arrange' && (
              <div className="arrange">
                <div className="section-label">Sing in this order</div>
                <div className="chip-row order">
                  {arrangement.length === 0 && <span className="muted small">Typed order: {groups.join(' → ') || 'no groups yet'}</span>}
                  {arrangement.map((g, i) => (
                    <span key={i} className="chip" style={{ '--chip': groupColor(g) }}>
                      <button className="chip-move" title="Move left" disabled={i === 0} onClick={() => setArrangement((a) => { const b = [...a]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; return b; })}>‹</button>
                      {g}
                      <button className="chip-move" title="Move right" disabled={i === arrangement.length - 1} onClick={() => setArrangement((a) => { const b = [...a]; [b[i + 1], b[i]] = [b[i], b[i + 1]]; return b; })}>›</button>
                      <button className="chip-x" title="Remove" onClick={() => setArrangement((a) => a.filter((_, j) => j !== i))}>✕</button>
                    </span>
                  ))}
                </div>
                <div className="section-label">Click a group to add it</div>
                <div className="chip-row">
                  {groups.length === 0 && <span className="muted small">Label the words with groups first, e.g. <code>[Verse 1]</code> and <code>[Chorus]</code>.</span>}
                  {groups.map((g) => <button key={g} className="chip add" style={{ '--chip': groupColor(g) }} onClick={() => setArrangement((a) => [...a, g])}>＋ {g}</button>)}
                </div>
                <div className="add-row">
                  <button className="btn small" disabled={!groups.length} onClick={() => setArrangement([...groups])}>Start from typed order</button>
                  <button className="btn small ghost" disabled={!arrangement.length} onClick={() => setArrangement([])}>Clear (use typed order)</button>
                </div>
                <div className="hint">Type each verse and chorus once, then repeat them here: Verse 1 → Chorus → Verse 2 → Chorus → Bridge → Chorus.</div>
              </div>
            )}
            {pane === 'look' && (
              <div className="look">
                <div className="seg">
                  <button className={!style ? 'on' : ''} onClick={() => setStyle(null)}>Use the show's text style</button>
                  <button className={style ? 'on' : ''} onClick={() => setStyle((s) => s || {})}>Own look for this song</button>
                </div>
                {style && (
                  <div className="style-grid inline">
                    <label>Font
                      <select className="input" value={style.font || ''} onChange={(e) => setSt({ font: e.target.value || undefined })}>
                        <option value="">Same as show</option><option value="sans">Clean (sans-serif)</option><option value="serif">Classic (serif)</option><option value="condensed">Bold condensed</option>
                      </select>
                    </label>
                    <label>Largest size <span className="muted">{style.maxSize ? `${style.maxSize}px` : 'same as show'}</span>
                      <input type="range" min="60" max="160" step="2" value={style.maxSize || 110} onChange={(e) => setSt({ maxSize: +e.target.value })} />
                    </label>
                    <label>Text colour<input type="color" className="color" value={style.color || '#ffffff'} onChange={(e) => setSt({ color: e.target.value })} /></label>
                    <label>Background when it goes live
                      <select className="input" value={style.mediaId || ''} onChange={(e) => setSt({ mediaId: e.target.value || undefined })}>
                        <option value="">Keep what's on screen</option>
                        {media.map((m) => <option key={m.id} value={m.id}>{m.kind === 'video' ? '▶ ' : ''}{m.name}</option>)}
                      </select>
                    </label>
                    <label>Alignment
                      <select className="input" value={style.align || ''} onChange={(e) => setSt({ align: e.target.value || undefined })}>
                        <option value="">Same as show</option><option value="center">Centre</option><option value="left">Left</option>
                      </select>
                    </label>
                    <label>Capitals
                      <select className="input" value={style.uppercase == null ? '' : style.uppercase ? 'yes' : 'no'} onChange={(e) => setSt({ uppercase: e.target.value === '' ? undefined : e.target.value === 'yes' })}>
                        <option value="">Same as show</option><option value="yes">ALL CAPS</option><option value="no">Normal</option>
                      </select>
                    </label>
                  </div>
                )}
                <div className="hint">An own look overrides the show's text style only while this song is live. Pick a background and it comes up by itself when the song starts.</div>
              </div>
            )}
          </div>}
          {pane !== 'design' && <div className="editor-preview">
            <div className="section-label">{slides.length} slide{slides.length === 1 ? '' : 's'}{arrangement.length ? ' · arranged' : ''}</div>
            <div className="editor-slides">
              {slides.length === 0 && <div className="empty">Slides appear here as you type.</div>}
              {slides.map((s, i) => (
                <div key={i} className="mini-slide">
                  <div className="mini-text" style={{ fontFamily: style?.font ? FONTS[style.font] : undefined, color: style?.color, textTransform: style?.uppercase ? 'uppercase' : undefined, textAlign: style?.align === 'left' ? 'left' : undefined }}>{s.text || ' '}</div>
                  <div className="mini-foot" style={{ background: groupColor(s.group) }}><span>{i + 1}</span><span>{s.group}</span></div>
                </div>
              ))}
            </div>
          </div>}
        </div>
        <div className="modal-foot">
          {value.id && <button className="btn danger" onClick={() => onDelete(value.id)}>Delete</button>}
          {value.id && <button className="btn ghost" onClick={() => onExport({ ...value, title, credits, text, arrangement })} title="Save as an OpenLyrics .xml file">Export…</button>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ---------- text style ----------
function StylePanel({ theme, onChange, onClose }) {
  const set = (patch) => onChange({ ...theme, ...patch });
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Slide text style</h3><button className="icon-btn" onClick={onClose} title="Close">✕</button></div>
        <div className="style-grid">
          <label>Font
            <select className="input" value={theme.font} onChange={(e) => set({ font: e.target.value })}>
              <option value="sans">Clean (sans-serif)</option><option value="serif">Classic (serif)</option><option value="condensed">Bold condensed</option>
            </select>
          </label>
          <label>Largest size <span className="muted">{theme.maxSize}px</span>
            <input type="range" min="60" max="160" step="2" value={theme.maxSize} onChange={(e) => set({ maxSize: +e.target.value })} />
          </label>
          <label>Text colour<input type="color" className="color" value={theme.color} onChange={(e) => set({ color: e.target.value })} /></label>
          <label>Screen colour <span className="muted">(behind media)</span><input type="color" className="color" value={theme.background} onChange={(e) => set({ background: e.target.value })} /></label>
          <label>Alignment
            <div className="seg">
              <button className={theme.align === 'center' ? 'on' : ''} onClick={() => set({ align: 'center' })}>Centre</button>
              <button className={theme.align === 'left' ? 'on' : ''} onClick={() => set({ align: 'left' })}>Left</button>
            </div>
          </label>
          <label>Where the words sit
            <select className="input" value={Object.entries(BOX_PRESETS).find(([, b]) => JSON.stringify(b) === JSON.stringify(theme.box || DEFAULT_BOX))?.[0] || 'custom'} onChange={(e) => set({ box: BOX_PRESETS[e.target.value] })}>
              <option value="full">Centre of the screen</option><option value="lower">Lower third</option><option value="top">Top</option><option value="left">Left half</option>
              {!Object.values(BOX_PRESETS).some((b) => JSON.stringify(b) === JSON.stringify(theme.box || DEFAULT_BOX)) && <option value="custom">Custom</option>}
            </select>
          </label>
          <label>Transition <span className="muted">{theme.transition === 'cut' ? '' : `${theme.transitionMs ?? 300} ms`}</span>
            <div className="add-row">
              <select className="input" value={theme.transition || 'fade'} onChange={(e) => set({ transition: e.target.value })}>
                {Object.entries(TRANSITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input type="range" min="100" max="1500" step="50" disabled={theme.transition === 'cut'} value={theme.transitionMs ?? 300} onChange={(e) => set({ transitionMs: +e.target.value })} />
            </div>
          </label>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={theme.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} /> ALL CAPS</label>
            <label className="check"><input type="checkbox" checked={theme.outline} onChange={(e) => set({ outline: e.target.checked })} /> Shadow for readability</label>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={() => onChange({ ...DEFAULT_THEME })}>Reset</button>
          <div className="spacer" />
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function MediaThumb({ m }) {
  if (m.kind === 'color') return <div className="media-fill" style={{ background: m.css }} />;
  if (m.kind === 'image') return <img className="media-fill" src={m.url} alt="" draggable={false} />;
  return <video className="media-fill" src={m.url} muted preload="metadata" />;
}

export default function App() {
  const [uiMode, setUiMode] = useUiTheme();
  const [show, setShow] = useState(null);
  const [selId, setSelId] = useState(null);
  const [live, setLive] = useState(null); // { presId, index }
  const [liveMediaId, setLiveMediaId] = useState(null);
  const [liveMsgId, setLiveMsgId] = useState(null);
  const [liveProps, setLiveProps] = useState([]); // ids of props on screen
  const [editProp, setEditProp] = useState(null);
  const [timerEnd, setTimerEnd] = useState(null);
  const [stageMsg, setStageMsg] = useState('');
  const [stageDraft, setStageDraft] = useState('');
  const [msgDraft, setMsgDraft] = useState('');
  const [mediaBase, setMediaBase] = useState('');
  const [displays, setDisplays] = useState([]);
  const [outOn, setOutOn] = useState({ audience: false, stage: false });
  const [pick, setPick] = useState({ audience: null, stage: null });
  const [editing, setEditing] = useState(null);
  const [showStyle, setShowStyle] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('messages');
  const [toast, setToast] = useState('');
  const [importing, setImporting] = useState(null); // null | { initial: [...] }
  const [panel, setPanel] = useState(null); // 'ndi' | 'remote'
  const [ndiOn, setNdiOn] = useState(false);
  const [remoteOn, setRemoteOn] = useState(false);
  const [centre, setCentre] = useState('slides'); // 'slides' | 'bible'
  const [virtuals, setVirtuals] = useState({}); // Bible chapters shown this session
  const [macroEdit, setMacroEdit] = useState(null);
  const midiLearn = useRef(null);
  const gridRef = useRef(null);
  const now = useNow(tab === 'timer' || !!timerEnd);

  const flash = useCallback((m) => { setToast(m); clearTimeout(flash.t); flash.t = setTimeout(() => setToast(''), 2200); }, []);
  const up = useCallback((patch) => setShow((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })), []);

  // load once, then save on every change
  useEffect(() => {
    loadShow().then((s) => {
      const d = s && Array.isArray(s.presentations) ? { ...defaultShow(), ...s } : defaultShow();
      setShow(d);
      setSelId(d.presentations[0]?.id || null);
    });
    api?.mediaBase?.().then(setMediaBase);
  }, []);
  const showRef = useRef(null);
  showRef.current = show;
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => saveShow(show), 300);
    return () => clearTimeout(t);
  }, [show]);
  useEffect(() => {
    // closing or reloading: save right away so the last change is never lost
    const flush = () => { if (showRef.current) saveShow(showRef.current); };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  // displays + outputs
  const refreshDisplays = useCallback(() => { api?.listDisplays().then(setDisplays); }, []);
  useEffect(() => {
    if (!api) return;
    refreshDisplays();
    api.outStatus().then(setOutOn);
    const a = api.onOutStatus(setOutOn);
    const b = api.onDisplaysChanged(refreshDisplays);
    return () => { a(); b(); };
  }, [refreshDisplays]);

  const slidesById = useMemo(
    () => ({
      ...Object.fromEntries(Object.values(virtuals).map((v) => [v.id, v.slides])),
      ...Object.fromEntries((show?.presentations || []).map((p) => [p.id, p.scripture
        ? presentationSlides(p).map((x) => ({ ...x, caption: `${x.group}${p.translation ? ` ${p.translation}` : ''}` }))
        : presentationSlides(p)])),
    }),
    [show?.presentations, virtuals],
  );
  const presById = useMemo(() => ({ ...virtuals, ...Object.fromEntries((show?.presentations || []).map((p) => [p.id, p])) }), [show?.presentations, virtuals]);
  const showVirtual = useCallback((v) => setVirtuals((m) => {
    const keep = Object.values(m).filter((x) => x.id !== v.id).slice(-8);
    return { ...Object.fromEntries(keep.map((x) => [x.id, x])), [v.id]: v };
  }), []);
  const allMedia = useMemo(
    () => [...BUILTIN_MEDIA, ...(show?.media || []).map((m) => ({ ...m, url: mediaBase + m.file }))],
    [show?.media, mediaBase],
  );

  const sel = selId ? presById[selId] : null;
  const selSlides = sel ? slidesById[sel.id] : [];
  const livePres = live ? presById[live.presId] : null;
  const liveSlides = livePres ? slidesById[livePres.id] : [];
  const cur = live ? liveSlides[live.index] : null;
  const nxt = live ? liveSlides[live.index + 1] : null;
  const liveMedia = allMedia.find((m) => m.id === liveMediaId) || null;
  const liveMsg = show?.messages.find((m) => m.id === liveMsgId) || null;
  const playlist = show ? show.playlists.find((p) => p.id === show.currentPlaylist) || show.playlists[0] : null;
  const mediaUrl = (id) => allMedia.find((m) => m.id === id && m.kind === 'image')?.url || '';
  const propsOn = useMemo(
    () => (show?.props || []).filter((p) => liveProps.includes(p.id)).map((p) => ({ id: p.id, kind: p.kind, title: p.title, subtitle: p.subtitle, color: p.color, position: p.position, size: p.size, url: mediaUrl(p.mediaId) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show?.props, liveProps, allMedia],
  );
  // a song's own look applies while it is live
  const liveTheme = useMemo(() => {
    const own = livePres?.style ? Object.fromEntries(Object.entries(livePres.style).filter(([k, v]) => v !== undefined && k !== 'mediaId')) : {};
    return { ...DEFAULT_THEME, ...(show?.theme || {}), ...own };
  }, [show?.theme, livePres?.style]);

  // a song's designed objects + words box, with picture addresses filled in
  const liveDesign = useMemo(() => {
    const d = livePres?.design;
    if (!d) return null;
    return { box: d.box, objects: (d.objects || []).map((o) => (o.type === 'image' ? { ...o, url: mediaUrl(o.mediaId) } : o)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePres?.design, allMedia]);

  // what every screen shows
  const liveState = useMemo(() => ({
    slide: cur ? { text: cur.text, group: cur.group, caption: cur.caption || '', title: livePres.title, index: live.index, total: liveSlides.length, key: `${live.presId}:${live.index}` } : null,
    design: liveDesign,
    next: nxt ? { text: nxt.text, group: nxt.group } : null,
    media: liveMedia ? { kind: liveMedia.kind, css: liveMedia.css, url: liveMedia.url } : null,
    message: liveMsg ? { id: liveMsg.id, text: liveMsg.text } : null,
    timer: { label: show?.timer.label, minutes: show?.timer.minutes, endAt: timerEnd },
    stageMessage: stageMsg,
    theme: liveTheme,
    props: propsOn,
  }), [cur, nxt, livePres?.title, live, liveSlides.length, liveMedia, liveMsg, show?.timer, timerEnd, stageMsg, liveTheme, propsOn, liveDesign]);
  useEffect(() => { if (show) api?.sendLive(liveState); }, [liveState, show]);

  // phone remote: what the phone sees …
  const remotePres = livePres || sel;
  const remoteSlides = remotePres ? slidesById[remotePres.id] : null;
  const remoteState = useMemo(() => (show ? {
    playlist: playlist ? { name: playlist.name, items: playlist.items.filter((it) => presById[it.presId]).map((it) => ({ presId: it.presId, title: presById[it.presId].title })) } : null,
    current: remotePres ? { id: remotePres.id, title: remotePres.title, slides: remoteSlides.map((x) => ({ text: x.text, group: x.group })) } : null,
    live: live ? { presId: live.presId, index: live.index } : null,
    macros: (show.macros || []).map((m) => ({ id: m.id, name: m.name, color: m.color })),
  } : null), [show, playlist, presById, remotePres, remoteSlides, live]);
  useEffect(() => { if (remoteState) api?.sendRemoteState?.(remoteState); }, [remoteState]);

  // ---------- actions ----------
  const goLive = (presId, index) => {
    // starting a different song: bring up its own background, if it has one
    const bg = presById[presId]?.style?.mediaId;
    if (presId !== live?.presId && bg && allMedia.some((m) => m.id === bg)) setLiveMediaId(bg);
    setLive({ presId, index });
    setSelId(presId);
  };
  const stepLive = (dir) => {
    if (!live) { if (sel && selSlides.length) goLive(sel.id, 0); return; }
    const ni = live.index + dir;
    if (ni >= 0 && ni < liveSlides.length) { setLive({ presId: live.presId, index: ni }); return; }
    // past the end: carry on into the next item of the playlist
    const items = playlist?.items || [];
    const at = items.findIndex((it) => it.presId === live.presId);
    const nextItem = at >= 0 ? items[at + dir] : null;
    const np = nextItem && presById[nextItem.presId];
    if (np && slidesById[np.id].length) goLive(np.id, dir > 0 ? 0 : slidesById[np.id].length - 1);
  };
  const clearAll = () => { setLive(null); setLiveMediaId(null); setLiveMsgId(null); setLiveProps([]); };
  const toggleProp = (id) => setLiveProps((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const updateProp = (id, patch) => up((s) => ({ props: s.props.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const addProp = (kind) => {
    const p = kind === 'logo'
      ? { id: uid(), kind, name: 'Logo', title: 'LOGO', position: 'tr', size: 140, mediaId: '' }
      : { id: uid(), kind, name: 'Lower third', title: 'Name', subtitle: 'Role', color: '#6d6af0', position: 'bl', mediaId: '' };
    up((s) => ({ props: [...(s.props || []), p] }));
    setEditProp(p.id);
  };
  const deleteProp = (id) => { up((s) => ({ props: s.props.filter((p) => p.id !== id) })); setLiveProps((l) => l.filter((x) => x !== id)); };

  const savePresentation = (p) => {
    const id = p.id || uid();
    up((s) => ({ presentations: p.id ? s.presentations.map((x) => (x.id === p.id ? { ...p } : x)) : [...s.presentations, { ...p, id }] }));
    setSelId(id);
    setEditing(null);
    flash('Saved');
  };
  const importSongs = (songs, addToPl) => {
    const made = songs.map((sg) => ({ id: uid(), title: sg.title, credits: sg.credits || '', ccli: sg.ccli || '', text: sg.text }));
    if (!made.length) return;
    up((s) => {
      const pl = s.playlists.find((x) => x.id === s.currentPlaylist) || s.playlists[0];
      return {
        presentations: [...s.presentations, ...made],
        playlists: addToPl && pl ? s.playlists.map((x) => (x.id === pl.id ? { ...x, items: [...x.items, ...made.map((m) => ({ id: uid(), presId: m.id }))] } : x)) : s.playlists,
      };
    });
    setSelId(made[0].id);
    setImporting(null);
    flash(`Imported ${made.length} song${made.length === 1 ? '' : 's'}`);
  };
  // Song files dropped anywhere on the window open the importer with them.
  useEffect(() => {
    const over = (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault(); };
    const drop = async (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault(); // never let a dropped file replace the app page
      const files = [...e.dataTransfer.files].filter((f) => isSongFile(f.name));
      if (!files.length) { flash('Drop song files (.txt .usr .xml .cho .pro) here. Add pictures and videos with the media bin.'); return; }
      const read = await readSongFiles(files);
      setImporting((cur) => ({ initial: [...(cur?.initial || []), ...read] }));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);
  const deletePresentation = (id) => {
    up((s) => ({
      presentations: s.presentations.filter((x) => x.id !== id),
      playlists: s.playlists.map((pl) => ({ ...pl, items: pl.items.filter((it) => it.presId !== id) })),
    }));
    if (live?.presId === id) setLive(null);
    if (selId === id) setSelId(null);
    setEditing(null);
  };
  const editPlaylist = (fn) => up((s) => ({ playlists: s.playlists.map((pl) => (pl.id === playlist.id ? fn(pl) : pl)) }));
  const addToPlaylist = (presId) => { editPlaylist((pl) => ({ ...pl, items: [...pl.items, { id: uid(), presId }] })); flash(`Added to ${playlist.name}`); };
  const moveItem = (itemId, dir) => editPlaylist((pl) => {
    const items = [...pl.items];
    const i = items.findIndex((x) => x.id === itemId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return pl;
    [items[i], items[j]] = [items[j], items[i]];
    return { ...pl, items };
  });
  const newPlaylist = () => { const id = uid(); up((s) => ({ playlists: [...s.playlists, { id, name: 'New playlist', items: [] }], currentPlaylist: id })); };
  const deletePlaylist = () => up((s) => ({ playlists: s.playlists.filter((p) => p.id !== playlist.id), currentPlaylist: null }));

  const importMedia = async () => {
    if (!api?.mediaImport) return flash('Adding files works in the desktop app.');
    const items = await api.mediaImport();
    if (items.length) { up((s) => ({ media: [...s.media, ...items] })); flash(`${items.length} file${items.length > 1 ? 's' : ''} added`); }
  };
  const removeMedia = (m) => {
    up((s) => ({ media: s.media.filter((x) => x.id !== m.id) }));
    if (liveMediaId === m.id) setLiveMediaId(null);
    api?.mediaDelete?.(m.file);
  };
  const addMessage = () => {
    const text = msgDraft.trim();
    if (!text) return;
    up((s) => ({ messages: [...s.messages, { id: uid(), text }] }));
    setMsgDraft('');
  };
  const toggleOut = (kind) => {
    if (!api) return flash('Outputs open in the desktop app.');
    if (outOn[kind]) api.closeOut(kind);
    else api.openOut(kind, pick[kind] ?? undefined);
  };

  // … and what the phone asks for
  const runMacro = (m) => {
    if (!m) return;
    for (const st of m.steps || []) {
      const a = st.arg;
      switch (st.type) {
        case 'clearAll': clearAll(); break;
        case 'clearSlide': setLive(null); break;
        case 'clearMedia': setLiveMediaId(null); break;
        case 'clearMessage': setLiveMsgId(null); break;
        case 'clearProps': setLiveProps([]); break;
        case 'media': if (allMedia.some((x) => x.id === a)) setLiveMediaId(a); break;
        case 'message': if (show.messages.some((x) => x.id === a)) setLiveMsgId(a); break;
        case 'propOn': if (a) setLiveProps((l) => (l.includes(a) ? l : [...l, a])); break;
        case 'propOff': setLiveProps((l) => l.filter((x) => x !== a)); break;
        case 'goto': if (slidesById[a]?.length) { setLive({ presId: a, index: 0 }); setSelId(a); } break;
        case 'timerStart': setTimerEnd(Date.now() + (Number(a) || show.timer.minutes) * 60000); break;
        case 'timerStop': setTimerEnd(null); break;
        case 'stage': setStageMsg(String(a || '')); break;
        case 'next': stepLive(1); break;
        case 'prev': stepLive(-1); break;
        default: break;
      }
    }
    flash(`▶ ${m.name}`);
  };
  const runAction = (key) => {
    if (key === 'next') stepLive(1);
    else if (key === 'prev') stepLive(-1);
    else if (key === 'clearAll') clearAll();
    else if (key === 'clearSlide') setLive(null);
    else if (key === 'clearMedia') setLiveMediaId(null);
    else if (key === 'clearMessage') setLiveMsgId(null);
    else if (key === 'clearProps') setLiveProps([]);
    else if (key?.startsWith('macro:')) runMacro((show.macros || []).find((m) => m.id === key.slice(6)));
  };
  const saveMacro = (m) => { up((s) => ({ macros: (s.macros || []).some((x) => x.id === m.id) ? s.macros.map((x) => (x.id === m.id ? m : x)) : [...(s.macros || []), m] })); setMacroEdit(null); };
  const deleteMacro = (id) => { up((s) => ({ macros: s.macros.filter((x) => x.id !== id) })); setMacroEdit(null); };
  const exportSong = async (p) => {
    const xml = toOpenLyrics(p);
    if (api?.saveFile) { const f = await api.saveFile({ name: exportFileName(p.title), content: xml, kind: 'xml' }); if (f) flash('Song exported'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' })); a.download = exportFileName(p.title); a.click();
  };
  const exportAllSongs = async () => {
    const songs = show.presentations.filter((p) => !p.scripture);
    if (!api?.saveFiles) return flash('Exporting works in the desktop app.');
    const dir = await api.saveFiles(songs.map((p) => ({ name: exportFileName(p.title), content: toOpenLyrics(p) })));
    if (dir) flash(`${songs.length} songs exported`);
  };
  const backup = async () => {
    const data = JSON.stringify({ app: 'Evolve Presenter', savedAt: new Date().toISOString(), show }, null, 1);
    const f = await api?.saveFile?.({ name: `Evolve backup ${new Date().toISOString().slice(0, 10)}.json`, content: data, kind: 'json' });
    if (f) flash('Backup saved');
  };
  const restore = async () => {
    const text = await api?.openFile?.();
    if (!text) return;
    try {
      const b = JSON.parse(text).show;
      if (!b || !Array.isArray(b.presentations)) throw new Error();
      // add what's missing; nothing already here is overwritten
      up((s) => {
        const have = new Set(s.presentations.map((p) => p.id));
        const add = b.presentations.filter((p) => !have.has(p.id));
        const plHave = new Set(s.playlists.map((p) => p.id));
        const mHave = new Set((s.macros || []).map((m) => m.id));
        const prHave = new Set((s.props || []).map((m) => m.id));
        return {
          presentations: [...s.presentations, ...add],
          playlists: [...s.playlists, ...(b.playlists || []).filter((p) => !plHave.has(p.id))],
          macros: [...(s.macros || []), ...(b.macros || []).filter((m) => !mHave.has(m.id))],
          props: [...(s.props || []), ...(b.props || []).filter((m) => !prHave.has(m.id))],
        };
      });
      flash('Backup restored (nothing was overwritten)');
    } catch { flash('That file is not an Evolve backup.'); }
  };

  const remoteCmd = useRef(null);
  remoteCmd.current = (c) => {
    if (c.cmd === 'action') { runAction(c.action); return; }
    if (c.cmd === 'next') stepLive(1);
    else if (c.cmd === 'prev') stepLive(-1);
    else if (c.cmd === 'goto') {
      const n = slidesById[c.presId]?.length || 0;
      if (n) goLive(c.presId, Math.min(Math.max(0, c.index || 0), n - 1));
    } else if (c.cmd === 'clearAll') clearAll();
    else if (c.cmd === 'clearSlide') setLive(null);
    else if (c.cmd === 'clearMedia') setLiveMediaId(null);
    else if (c.cmd === 'clearMessage') setLiveMsgId(null);
    else if (c.cmd === 'clearProps') setLiveProps([]);
  };
  useEffect(() => api?.onRemoteCmd?.((c) => remoteCmd.current?.(c)), []);
  // MIDI: pads / keys / foot switches mapped in Controllers
  const midiMapRef = useRef({});
  midiMapRef.current = show?.midi || {};
  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    let acc = null;
    const onMsg = (e) => {
      const b = midiBinding(e.data);
      if (!b) return;
      if (midiLearn.current) { midiLearn.current(b); return; }
      const key = Object.keys(midiMapRef.current).find((k) => sameBinding(midiMapRef.current[k], b));
      if (key) remoteCmd.current?.({ cmd: 'action', action: key });
    };
    const hook = () => { for (const i of acc.inputs.values()) i.onmidimessage = onMsg; };
    navigator.requestMIDIAccess().then((a) => { acc = a; hook(); a.onstatechange = hook; }).catch(() => {});
    return () => { if (acc) { for (const i of acc.inputs.values()) i.onmidimessage = null; acc.onstatechange = null; } };
  }, []);
  // toolbar lights for NDI / remote
  useEffect(() => {
    if (!api?.ndiStatus) return;
    const poll = () => {
      api.ndiStatus().then((st) => setNdiOn(Object.values(st.sources || {}).some((x) => x.running)));
      api.remoteInfo().then((r) => setRemoteOn(r.running));
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [panel]);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setEditing(null); setShowStyle(false); setImporting(null); setPanel(null); setMacroEdit(null); return; }
      const tag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || editing || showStyle || importing || panel || macroEdit) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { e.preventDefault(); stepLive(1); }
      else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); stepLive(-1); }
      else if (k === 'F1') { e.preventDefault(); clearAll(); }
      else if (k === 'F2') { e.preventDefault(); setLive(null); }
      else if (k === 'F3') { e.preventDefault(); setLiveMediaId(null); }
      else if (k === 'F4') { e.preventDefault(); setLiveMsgId(null); }
      else if (k === 'F5') { e.preventDefault(); setLiveProps([]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => { gridRef.current?.querySelector('.slide-card.live')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [live]);

  if (!show) return <div className="loading">Loading…</div>;

  const q = search.trim().toLowerCase();
  const library = show.presentations.filter((p) => !q || p.title.toLowerCase().includes(q) || p.text.toLowerCase().includes(q));
  const remaining = timerMs({ ...show.timer, endAt: timerEnd }, now);

  return (
    <div className="app">
      {/* ---------- toolbar ---------- */}
      <header className="toolbar">
        <div className="brand"><span className="brand-dot" />Evolve <b>Presenter</b></div>
        <button className="btn primary" onClick={() => setEditing({ title: '', credits: '', text: '' })}>＋ New</button>
        <button className="btn" onClick={() => setImporting({ initial: [] })} title="Import song files, paste lyrics or find songs on SongSelect">⤓ Import songs</button>
        <button className="btn" onClick={() => setShowStyle(true)}>Aa Text style</button>
        <div className="spacer" />
        {['audience', 'stage'].map((kind) => (
          <div key={kind} className={`out-ctl ${outOn[kind] ? 'on' : ''}`}>
            <button className="out-btn" onClick={() => toggleOut(kind)} title={`${outOn[kind] ? 'Close' : 'Open'} the ${kind === 'stage' ? 'stage display' : 'audience screen'}`}>
              <span className="out-dot" />{kind === 'stage' ? 'Stage' : 'Audience'}
            </button>
            {displays.length > 1 && (
              <select value={pick[kind] ?? ''} onChange={(e) => { const id = e.target.value ? +e.target.value : null; setPick((p) => ({ ...p, [kind]: id })); if (outOn[kind]) api.openOut(kind, id ?? undefined); }} title="Which screen">
                <option value="">Auto</option>
                {displays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            )}
          </div>
        ))}
        <button className={`btn tool-btn ${ndiOn ? 'on' : ''}`} onClick={() => setPanel('ndi')} title="NDI output to vMix / OBS"><span className="out-dot" />NDI</button>
        <button className={`btn tool-btn ${remoteOn ? 'on' : ''}`} onClick={() => setPanel('remote')} title="Control slides from a phone"><span className="out-dot" />Remote</button>
        <button className="btn tool-btn" onClick={() => setPanel('controllers')} title="Controllers: MIDI, Stream Deck, Companion">Controls</button>
        <div className="seg theme-seg" title="Appearance">
          <button className={uiMode === 'light' ? 'on' : ''} onClick={() => setUiMode('light')} title="Light">☀</button>
          <button className={uiMode === 'system' ? 'on' : ''} onClick={() => setUiMode('system')}>Auto</button>
          <button className={uiMode === 'dark' ? 'on' : ''} onClick={() => setUiMode('dark')} title="Dark">☾</button>
        </div>
      </header>

      <div className="body">
        {/* ---------- left: playlist + library ---------- */}
        <aside className="side">
          <section className="card playlist">
            <div className="card-head">
              <span className="section-label">Playlist</span>
              <div className="spacer" />
              <button className="icon-btn" title="New playlist" onClick={newPlaylist}>＋</button>
              {show.playlists.length > 1 && <button className="icon-btn" title="Delete this playlist" onClick={deletePlaylist}>🗑</button>}
            </div>
            <div className="pl-pick">
              {show.playlists.length > 1 && (
                <select className="input small" value={playlist.id} onChange={(e) => up({ currentPlaylist: e.target.value })}>
                  {show.playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <input className="input small name" value={playlist.name} onChange={(e) => editPlaylist((pl) => ({ ...pl, name: e.target.value }))} title="Playlist name" />
            </div>
            <div className="list">
              {playlist.items.length === 0 && <div className="empty">Add items from the library with ＋</div>}
              {playlist.items.map((it, i) => {
                const p = presById[it.presId];
                if (!p) return null;
                return (
                  <div key={it.id} className={`row-item ${selId === p.id ? 'sel' : ''} ${live?.presId === p.id ? 'live' : ''}`} onClick={() => setSelId(p.id)} onDoubleClick={() => slidesById[p.id].length && goLive(p.id, 0)}>
                    <span className="num">{i + 1}</span>
                    <span className="title">{p.title}</span>
                    <span className="row-actions">
                      <button className="icon-btn" title="Move up" onClick={(e) => { e.stopPropagation(); moveItem(it.id, -1); }}>↑</button>
                      <button className="icon-btn" title="Move down" onClick={(e) => { e.stopPropagation(); moveItem(it.id, 1); }}>↓</button>
                      <button className="icon-btn" title="Remove from playlist" onClick={(e) => { e.stopPropagation(); editPlaylist((pl) => ({ ...pl, items: pl.items.filter((x) => x.id !== it.id) })); }}>✕</button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card library">
            <div className="card-head"><span className="section-label">Library</span><span className="count">{show.presentations.length}</span></div>
            <input className="input small search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles and words…" />
            <div className="list">
              {library.length === 0 && <div className="empty">{q ? 'Nothing matches.' : 'No presentations yet. Press ＋ New.'}</div>}
              {library.map((p) => (
                <div key={p.id} className={`row-item ${selId === p.id ? 'sel' : ''} ${live?.presId === p.id ? 'live' : ''}`} onClick={() => setSelId(p.id)} onDoubleClick={() => setEditing(p)}>
                  <span className="title">{p.title}</span>
                  <span className="sub">{slidesById[p.id].length}</span>
                  <span className="row-actions">
                    <button className="icon-btn" title={`Add to ${playlist.name}`} onClick={(e) => { e.stopPropagation(); addToPlaylist(p.id); }}>＋</button>
                    <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); setEditing(p); }}>✎</button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* ---------- centre: slides + media ---------- */}
        <main className="centre">
          <section className="card slides">
            <div className="centre-switch seg">
              <button className={centre === 'slides' ? 'on' : ''} onClick={() => setCentre('slides')}>Slides</button>
              <button className={centre === 'bible' ? 'on' : ''} onClick={() => setCentre('bible')}>Bible</button>
            </div>
            {centre === 'bible' ? (
              <BiblePanel tId={show.bibleT || 'KJV'} setTId={(t) => up({ bibleT: t })} livePres={live?.presId} liveIndex={live?.index}
                onShow={showVirtual} flash={flash}
                onGoLive={(id, i) => { setLive({ presId: id, index: i }); setSelId(id); }}
                onSave={(p) => {
                  const id = uid();
                  up((s) => ({ presentations: [...s.presentations, { ...p, id, translation: show.bibleT || 'KJV' }] }));
                  flash(`Saved “${p.title}” to the library`);
                }} />
            ) : <>
            <div className="card-head">
              {sel ? (
                <>
                  <h2>{sel.title}</h2>
                  {sel.credits && <span className="credits">{sel.credits}</span>}
                  <div className="spacer" />
                  {!sel.virtual && <button className="btn small" onClick={() => setEditing(sel)}>✎ Edit</button>}
                </>
              ) : <h2 className="muted">Choose a presentation</h2>}
            </div>
            <div className="slide-grid" ref={gridRef}>
              {sel && selSlides.length === 0 && <div className="empty">This presentation has no slides yet. Press Edit and type the words.</div>}
              {sel && selSlides.map((s, i) => (
                <button key={i} className={`slide-card ${live?.presId === sel.id && live.index === i ? 'live' : ''}`} onClick={() => goLive(sel.id, i)}>
                  <div className="slide-thumb"><span style={{ textTransform: show.theme.uppercase ? 'uppercase' : 'none', fontFamily: FONTS[show.theme.font] }}>{s.text}</span></div>
                  <div className="slide-foot" style={{ background: s.caption ? '#0e7490' : groupColor(s.group) }}><span>{i + 1}</span><span>{s.group}</span></div>
                </button>
              ))}
            </div>
            </>}
          </section>

          <section className="card media">
            <div className="card-head">
              <span className="section-label">Media</span>
              <span className="muted small">Click a background to put it behind the words</span>
              <div className="spacer" />
              <button className="btn small" onClick={importMedia}>＋ Add images or videos</button>
            </div>
            <div className="media-strip">
              {allMedia.map((m) => (
                <div key={m.id} className={`media-card ${liveMediaId === m.id ? 'live' : ''}`} onClick={() => setLiveMediaId(liveMediaId === m.id ? null : m.id)} title={m.name}>
                  <MediaThumb m={m} />
                  <span className="media-name">{m.kind === 'video' ? '▶ ' : ''}{m.name}</span>
                  {m.file && <button className="media-x" title="Remove" onClick={(e) => { e.stopPropagation(); removeMedia(m); }}>✕</button>}
                </div>
              ))}
            </div>
          </section>
        </main>

        {/* ---------- right: live + layers ---------- */}
        <aside className="right">
          <section className={`card live-card ${outOn.audience ? 'on-air' : ''}`}>
            <div className="card-head">
              <span className="section-label">{outOn.audience ? '● Live' : 'Live preview'}</span>
              <div className="spacer" />
              <span className="muted small">{cur ? `${livePres.title} · ${live.index + 1}/${liveSlides.length}` : 'Nothing on screen'}</span>
            </div>
            <div className="monitor"><Canvas><AudienceView state={liveState} /></Canvas></div>
            <div className="nav-row">
              <button className="btn grow" onClick={() => stepLive(-1)} title="Previous slide (←)">← Previous</button>
              <button className="btn primary grow" onClick={() => stepLive(1)} title="Next slide (→ or Space)">Next →</button>
            </div>
            <div className="clear-row">
              <button className="clear all" onClick={clearAll} title="Clear everything (F1)">Clear all</button>
              <button className={`clear ${cur ? 'active' : ''}`} onClick={() => setLive(null)} title="Clear the slide (F2)">Slide</button>
              <button className={`clear ${liveMedia ? 'active' : ''}`} onClick={() => setLiveMediaId(null)} title="Clear the background (F3)">Media</button>
              <button className={`clear ${propsOn.length ? 'active' : ''}`} onClick={() => setLiveProps([])} title="Clear logos and lower thirds (F5)">Props</button>
              <button className={`clear ${liveMsg ? 'active' : ''}`} onClick={() => setLiveMsgId(null)} title="Clear the message (F4)">Message</button>
            </div>
          </section>

          <section className="card tools">
            <div className="tabs">
              {[['messages', 'Messages'], ['props', 'Props'], ['macros', 'Macros'], ['timer', 'Timer'], ['stage', 'Stage']].map(([id, label]) => (
                <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}{(id === 'timer' && timerEnd) || (id === 'props' && propsOn.length) ? ' ●' : ''}</button>
              ))}
            </div>

            {tab === 'messages' && (
              <div className="tool-body">
                <div className="list">
                  {show.messages.map((m) => (
                    <div key={m.id} className={`msg-row ${liveMsgId === m.id ? 'live' : ''}`}>
                      <span className="title">{m.text}</span>
                      <button className="btn small" onClick={() => setLiveMsgId(liveMsgId === m.id ? null : m.id)}>{liveMsgId === m.id ? 'Hide' : 'Show'}</button>
                      <button className="icon-btn" title="Delete" onClick={() => { up((s) => ({ messages: s.messages.filter((x) => x.id !== m.id) })); if (liveMsgId === m.id) setLiveMsgId(null); }}>✕</button>
                    </div>
                  ))}
                </div>
                <div className="add-row">
                  <input className="input small" value={msgDraft} onChange={(e) => setMsgDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMessage()} placeholder="New message…" />
                  <button className="btn small" onClick={addMessage}>Add</button>
                </div>
                <div className="hint">Messages show in a bar over the slide. Use <code>{'{timer}'}</code> or <code>{'{clock}'}</code> inside the text.</div>
              </div>
            )}

            {tab === 'props' && (
              <div className="tool-body">
                <div className="list">
                  {(show.props || []).map((p) => {
                    const on = liveProps.includes(p.id);
                    const open = editProp === p.id;
                    return (
                      <div key={p.id} className={`prop-row ${on ? 'live' : ''}`}>
                        <div className="prop-head">
                          <span className={`prop-kind ${p.kind}`}>{p.kind === 'logo' ? 'Logo' : 'Lower third'}</span>
                          <span className="title">{p.kind === 'logo' ? (p.name || 'Logo') : p.title || 'Untitled'}</span>
                          <button className="btn small" onClick={() => toggleProp(p.id)}>{on ? 'Hide' : 'Show'}</button>
                          <button className="icon-btn" title="Edit" onClick={() => setEditProp(open ? null : p.id)}>{open ? '▴' : '✎'}</button>
                        </div>
                        {open && (
                          <div className="prop-edit">
                            {p.kind === 'lower' ? (
                              <>
                                <input className="input small" value={p.title} onChange={(e) => updateProp(p.id, { title: e.target.value })} placeholder="Name / main line" />
                                <input className="input small" value={p.subtitle || ''} onChange={(e) => updateProp(p.id, { subtitle: e.target.value })} placeholder="Second line (optional)" />
                              </>
                            ) : (
                              <input className="input small" value={p.name || ''} onChange={(e) => updateProp(p.id, { name: e.target.value, title: e.target.value })} placeholder="Name (shown if no picture)" />
                            )}
                            <div className="prop-fields">
                              <select className="input small" value={p.mediaId || ''} onChange={(e) => updateProp(p.id, { mediaId: e.target.value })} title="Picture">
                                <option value="">{p.kind === 'logo' ? 'No picture (text)' : 'No picture'}</option>
                                {allMedia.filter((m) => m.kind === 'image').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </select>
                              <select className="input small" value={p.position} onChange={(e) => updateProp(p.id, { position: e.target.value })} title="Position">
                                {p.kind === 'logo'
                                  ? [['tr', 'Top right'], ['tl', 'Top left'], ['br', 'Bottom right'], ['bl', 'Bottom left']].map(([v, l]) => <option key={v} value={v}>{l}</option>)
                                  : [['bl', 'Left'], ['br', 'Right']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                              {p.kind === 'lower'
                                ? <input type="color" className="color small" value={p.color || '#6d6af0'} onChange={(e) => updateProp(p.id, { color: e.target.value })} title="Accent colour" />
                                : <input type="range" min="60" max="320" step="10" value={p.size || 140} onChange={(e) => updateProp(p.id, { size: +e.target.value })} title="Size" />}
                            </div>
                            <button className="btn small ghost danger-text" onClick={() => deleteProp(p.id)}>Delete</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="add-row">
                  <button className="btn small grow" onClick={() => addProp('lower')}>＋ Lower third</button>
                  <button className="btn small grow" onClick={() => addProp('logo')}>＋ Logo</button>
                </div>
                <div className="hint">Props stay on screen while slides change. Add your logo picture to the media bin first, then pick it here. <kbd>F5</kbd> hides all props.</div>
              </div>
            )}

            {tab === 'macros' && (
              <div className="tool-body">
                <div className="macro-grid">
                  {(show.macros || []).map((m) => (
                    <div key={m.id} className="macro" style={{ '--mc': m.color || '#6d6af0' }}>
                      <button className="macro-run" onClick={() => runMacro(m)} title={(m.steps || []).length + ' steps'}>{m.name}</button>
                      <button className="macro-edit" onClick={() => setMacroEdit(m)} title="Edit">✎</button>
                    </div>
                  ))}
                </div>
                <button className="btn small" onClick={() => setMacroEdit({ name: '', color: '#6d6af0', steps: [] })}>＋ New macro</button>
                <div className="hint">A macro does several things with one click — e.g. background + message + countdown before service. Macros also work from the phone remote, MIDI and Stream Deck (Controls).</div>
              </div>
            )}

            {tab === 'timer' && (
              <div className="tool-body">
                <div className={`big-time ${timerEnd && remaining === 0 ? 'done' : ''}`}>{formatDuration(remaining)}</div>
                <div className="timer-fields">
                  <label>Name<input className="input small" value={show.timer.label} onChange={(e) => up({ timer: { ...show.timer, label: e.target.value } })} /></label>
                  <label>Minutes<input className="input small" type="number" min="0" max="600" step="1" value={show.timer.minutes} disabled={!!timerEnd} onChange={(e) => up({ timer: { ...show.timer, minutes: Math.max(0, +e.target.value || 0) } })} /></label>
                </div>
                <div className="nav-row">
                  {timerEnd ? <button className="btn grow danger" onClick={() => setTimerEnd(null)}>Stop and reset</button>
                    : <button className="btn primary grow" onClick={() => setTimerEnd(Date.now() + show.timer.minutes * 60000)}>Start countdown</button>}
                </div>
                <div className="hint">The countdown shows on the stage display, and in any message that contains <code>{'{timer}'}</code>.</div>
              </div>
            )}

            {tab === 'stage' && (
              <div className="tool-body">
                <div className="monitor small"><Canvas><StageView state={liveState} /></Canvas></div>
                <div className="add-row">
                  <input className="input small" value={stageDraft} onChange={(e) => setStageDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setStageMsg(stageDraft.trim())} placeholder="Message to the stage…" />
                  <button className="btn small primary" onClick={() => setStageMsg(stageDraft.trim())}>Send</button>
                  <button className="btn small" disabled={!stageMsg} onClick={() => { setStageMsg(''); setStageDraft(''); }}>Clear</button>
                </div>
                <div className="hint">The stage display shows the current and next slide, the clock and the countdown. Stage messages are seen only on stage.</div>
              </div>
            )}
          </section>
        </aside>
      </div>

      <footer className="statusbar">
        <span><kbd>→</kbd><kbd>Space</kbd> next</span><span><kbd>←</kbd> previous</span>
        <span><kbd>F1</kbd> clear all</span><span><kbd>F2</kbd> slide</span><span><kbd>F3</kbd> media</span><span><kbd>F4</kbd> message</span><span><kbd>F5</kbd> props</span>
        <div className="spacer" />
        <span>{show.presentations.length} presentations · saved automatically</span>
        <button className="update-btn" onClick={backup} title="Save everything to one file">Back up</button>
        <button className="update-btn" onClick={restore} title="Add songs, playlists, macros and props from a backup">Restore</button>
        <button className="update-btn" onClick={exportAllSongs} title="Export every song as OpenLyrics .xml files">Export songs</button>
        <UpdateButton />
      </footer>

      {editing && <Editor value={editing} media={allMedia} theme={{ ...DEFAULT_THEME, ...show.theme }} onExport={exportSong} onSave={savePresentation} onDelete={deletePresentation} onClose={() => setEditing(null)} />}
      {showStyle && <StylePanel theme={{ ...DEFAULT_THEME, ...show.theme }} onChange={(t) => up({ theme: t })} onClose={() => setShowStyle(false)} />}
      {importing && <ImportSongs key={importing.initial.length} initial={importing.initial} existingTitles={show.presentations.map((p) => p.title)} playlistName={playlist?.name} onImport={importSongs} onClose={() => setImporting(null)} />}
      {panel === 'ndi' && <NdiPanel onClose={() => setPanel(null)} />}
      {panel === 'remote' && <RemotePanel onClose={() => setPanel(null)} />}
      {panel === 'controllers' && <ControllersPanel macros={show.macros} midiMap={show.midi || {}} onMidiMap={(m) => up({ midi: m })} learnRef={midiLearn} onClose={() => setPanel(null)} />}
      {macroEdit && <MacroEditor macro={macroEdit} show={show} media={allMedia} onSave={saveMacro} onDelete={deleteMacro} onClose={() => setMacroEdit(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
