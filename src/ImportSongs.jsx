// Import songs: from song files, from pasted lyrics, or find them on CCLI SongSelect.
import { useMemo, useRef, useState } from 'react';
import { parseSongFile, parsePlainText, songToText, slideCount, decodeBytes, needsSplitting } from '../shared/songImport.js';

const api = window.presenter;
export const SONG_EXT = ['.txt', '.usr', '.xml', '.cho', '.pro', '.chopro', '.chordpro', '.crd'];
export const isSongFile = (name) => SONG_EXT.some((x) => name.toLowerCase().endsWith(x));
const SONGSELECT = (q) => `https://songselect.ccli.com/search/results?search=${encodeURIComponent(q)}`;

const LPS = [
  { v: 0, label: 'As in the file' },
  { v: 2, label: '2 lines per slide' },
  { v: 4, label: '4 lines per slide' },
];

export async function readSongFiles(files) {
  const out = [];
  for (const f of files) {
    try {
      const text = decodeBytes(new Uint8Array(await f.arrayBuffer()));
      out.push({ key: `${f.name}-${f.size}-${out.length}`, file: f.name, song: parseSongFile(text, f.name) });
    } catch (e) {
      out.push({ key: `${f.name}-err-${out.length}`, file: f.name, error: e.message || 'Could not read this file.' });
    }
  }
  return out;
}

export default function ImportSongs({ existingTitles, playlistName, initial = [], onImport, onClose }) {
  const [tab, setTab] = useState('files');
  const [items, setItems] = useState(() => mark(initial, existingTitles));
  const [lps, setLps] = useState(0);
  const [addToPl, setAddToPl] = useState(true);
  const [drag, setDrag] = useState(false);
  const [query, setQuery] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef(null);

  const addFiles = async (files) => {
    const list = [...files].filter((f) => isSongFile(f.name));
    if (!list.length) return;
    const read = await readSongFiles(list);
    setItems((cur) => mark([...cur, ...read], existingTitles));
  };

  const pasted = useMemo(() => {
    if (!pasteText.trim()) return null;
    const song = parsePlainText(pasteText, pasteTitle.trim() || 'Untitled');
    return song.sections.length ? song : null;
  }, [pasteText, pasteTitle]);
  // Lyrics copied from a web page often have no blank lines: suggest splitting.
  const pasteLps = pasted && lps === 0 && needsSplitting(pasted, 4) ? 4 : lps;

  const chosen = items.filter((it) => it.song && it.on);
  const doImport = () => {
    if (tab === 'paste') {
      if (!pasted) return;
      onImport([{ title: pasteTitle.trim() || 'Untitled', credits: '', text: songToText(pasted, pasteLps) }], addToPl);
      return;
    }
    onImport(chosen.map(({ song }) => ({ title: song.title, credits: song.credits, ccli: song.ccli || '', text: songToText(song, lps) })), addToPl);
  };

  const openSearch = () => {
    const q = query.trim();
    if (!q) return;
    if (api?.openExternal) api.openExternal(SONGSELECT(q));
    else window.open(SONGSELECT(q), '_blank', 'noopener');
  };

  const canImport = tab === 'paste' ? !!pasted : chosen.length > 0;
  const count = tab === 'paste' ? (pasted ? 1 : 0) : chosen.length;

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal wide import" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Import songs</h3>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="tabs import-tabs">
          <button className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>From files{items.length ? ` · ${items.length}` : ''}</button>
          <button className={tab === 'paste' ? 'on' : ''} onClick={() => setTab('paste')}>Paste lyrics</button>
          <button className={tab === 'online' ? 'on' : ''} onClick={() => setTab('online')}>Find online</button>
        </div>

        <div className="import-body">
          {tab === 'files' && (
            <>
              <div className={`drop ${drag ? 'over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}>
                <div className="drop-icon">⤓</div>
                <div><b>Drop song files here</b> or click to choose</div>
                <div className="hint">SongSelect lyrics (.txt, .usr), OpenLyrics (.xml, from OpenLP, FreeWorship and others), ChordPro (.cho, .pro) and plain text.</div>
                <input ref={fileRef} type="file" multiple hidden accept={SONG_EXT.join(',')} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </div>
              {items.length > 0 && (
                <div className="import-list">
                  <div className="import-list-head">
                    <label className="check"><input type="checkbox" checked={items.filter((i) => i.song).every((i) => i.on)} onChange={(e) => setItems((c) => c.map((i) => (i.song ? { ...i, on: e.target.checked } : i)))} /> Song</label>
                    <span>Format</span><span>Slides</span><span />
                  </div>
                  {items.map((it) => (
                    <div key={it.key} className={`import-row ${it.error ? 'bad' : ''}`}>
                      {it.song ? (
                        <>
                          <label className="check">
                            <input type="checkbox" checked={it.on} onChange={(e) => setItems((c) => c.map((x) => (x.key === it.key ? { ...x, on: e.target.checked } : x)))} />
                            <span className="grow-text">
                              <span className="title">{it.song.title}{it.dup && <span className="tag">Already in library</span>}</span>
                              <span className="sub">{it.song.credits || it.file}</span>
                            </span>
                          </label>
                          <span className="muted">{it.song.format}</span>
                          <span className="muted">{slideCount(it.song, lps)}</span>
                        </>
                      ) : (
                        <>
                          <span className="grow-text"><span className="title">{it.file}</span><span className="sub err">{it.error}</span></span>
                          <span /><span />
                        </>
                      )}
                      <button className="icon-btn" title="Remove" onClick={() => setItems((c) => c.filter((x) => x.key !== it.key))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'paste' && (
            <div className="paste-grid">
              <div className="editor-form">
                <label>Title<input className="input" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Song title" autoFocus /></label>
                <label className="grow">Lyrics
                  <textarea className="input area" value={pasteText} onChange={(e) => setPasteText(e.target.value)} spellCheck={false}
                    placeholder={'Paste the lyrics here.\n\nVerse 1\nFirst line…\n\nChorus\n…'} />
                </label>
                <div className="hint">Labels like <code>Verse 1</code> or <code>Chorus</code> are picked up. A blank line starts a new slide. Only paste lyrics your church is licensed to project (for example under a CCLI licence).</div>
              </div>
              <div className="paste-side">
                <div className="section-label">Preview</div>
                {pasted ? (
                  <>
                    <div className="big-num">{slideCount(pasted, pasteLps)}<span>slides</span></div>
                    <div className="muted small">{pasted.sections.map((s) => s.label || 'Lyrics').join(' · ')}</div>
                    {pasteLps !== lps && <div className="hint">These lyrics have no blank lines, so they'll be split into 4 lines per slide.</div>}
                  </>
                ) : <div className="empty">Paste lyrics to see how many slides they make.</div>}
              </div>
            </div>
          )}

          {tab === 'online' && (
            <div className="online">
              <div className="online-search">
                <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && openSearch()} placeholder="Song title, author or CCLI number" autoFocus />
                <button className="btn primary" onClick={openSearch} disabled={!query.trim()}>Search SongSelect ↗</button>
              </div>
              <ol className="steps">
                <li><span><b>Search</b> opens CCLI SongSelect in your browser. Sign in with your church's CCLI account.</span></li>
                <li><span>Open the song and choose <b>Download → Lyrics</b> (a .txt file).</span></li>
                <li><span>Come back and drop the file on the <b>From files</b> tab, or anywhere on the Evolve window.</span></li>
              </ol>
              <div className="hint">SongSelect is the licensed source most churches already pay for through CCLI, so the words, authors and copyright line come in correctly and your CCLI reporting stays right. Song files from OpenLP, FreeWorship and other OpenLyrics apps work too.</div>
              <button className="btn" onClick={() => setTab('files')}>I have the file → From files</button>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {tab !== 'online' && (
            <>
              <select className="input select" value={lps} onChange={(e) => setLps(+e.target.value)} title="How to split verses into slides">
                {LPS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
              {playlistName && <label className="check foot-check"><input type="checkbox" checked={addToPl} onChange={(e) => setAddToPl(e.target.checked)} /> Add to “{playlistName}”</label>}
            </>
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          {tab !== 'online' && <button className="btn primary" disabled={!canImport} onClick={doImport}>Import{count ? ` ${count} song${count === 1 ? '' : 's'}` : ''}</button>}
        </div>
      </div>
    </div>
  );
}

// Flag songs whose title is already in the library (or repeated in this batch); leave those unticked.
function mark(items, existingTitles) {
  const seen = new Set([...existingTitles].map((t) => t.toLowerCase()));
  return items.map((it) => {
    if (!it.song) return it;
    if ('on' in it) { seen.add(it.song.title.toLowerCase()); return it; }
    const dup = seen.has(it.song.title.toLowerCase());
    seen.add(it.song.title.toLowerCase());
    return { ...it, dup, on: !dup };
  });
}
