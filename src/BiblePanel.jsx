// Bible: type a reference (EasyWorship-style autocomplete) or words to search, click a verse to go live.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BOOKS, parseQuery, suggestBooks } from '../shared/bibleRef.js';
import { parseBibleFile } from '../shared/bibleImport.js';
import { TRANSLATIONS, loadBible, searchText, chapterPresentation, passageText, refLabel, forgetBible } from './bible.js';

const api = window.presenter;

export default function BiblePanel({ tId, setTId, livePres, liveIndex, onShow, onGoLive, onSave, flash }) {
  const [imported, setImported] = useState([]);
  const [bible, setBible] = useState(null);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [sugIdx, setSugIdx] = useState(0);
  const [chapterRef, setChapterRef] = useState(null); // { book, chapter, verse, endVerse }
  const [hits, setHits] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const listRef = useRef(null);

  const refreshImported = () => api?.biblesList?.().then((l) => setImported(l || []));
  useEffect(() => { refreshImported(); }, []);
  useEffect(() => {
    setBible(null); setErr('');
    loadBible(tId).then(setBible).catch((e) => setErr(e.message));
  }, [tId]);

  const parsed = useMemo(() => (bible && query.trim() ? parseQuery(query, bible.books) : null), [query, bible]);
  // still typing the book name (no chapter number yet)?
  const typingBook = !!query.trim() && !/[a-z.]\s*\d/i.test(query);
  const sugs = useMemo(() => {
    if (!typingBook) return [];
    const list = suggestBooks(query.trim()).slice(0, 6);
    // a whole book name followed by a space: done, wait for the chapter
    if (/\s$/.test(query) && list.some((i) => BOOKS[i].toLowerCase() === query.trim().toLowerCase())) return [];
    return list.length === 1 && BOOKS[list[0]].toLowerCase() === query.trim().toLowerCase() ? [] : list;
  }, [query, typingBook]);
  const exactBook = typingBook && BOOKS.some((b) => b.toLowerCase() === query.trim().toLowerCase());
  const inputRef = useRef(null);
  const leaveInput = () => inputRef.current?.blur(); // so ← → move through the verses

  const pres = useMemo(() => (bible && chapterRef ? chapterPresentation(bible, tId, chapterRef.book, chapterRef.chapter) : null), [bible, tId, chapterRef]);
  useEffect(() => { if (pres) onShow(pres); }, [pres]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (ref) => { setChapterRef(ref); setHits(null); };
  const submit = () => {
    if (parsed && (!typingBook || exactBook)) { open(parsed); if (parsed.verse) { setTimeout(() => onGoLive(`bible:${tId}:${parsed.book}:${parsed.chapter}`, parsed.verse - 1), 0); leaveInput(); } return; }
    const h = searchText(bible, query);
    setHits(h);
    if (!h.length) flash('No verses found');
  };
  const pickBook = (i) => { setQuery(`${BOOKS[i]} `); setSugIdx(0); };
  const onKey = (e) => {
    // Tab, Space or Enter completes the book name (EasyWorship-style): "jo" + Space -> "John "
    if (sugs.length && (e.key === 'Tab' || e.key === 'Enter' || (e.key === ' ' && !/\s$/.test(query)))) {
      e.preventDefault(); pickBook(sugs[sugIdx] ?? sugs[0]); return;
    }
    if (e.key === 'ArrowDown' && sugs.length) { e.preventDefault(); setSugIdx((i) => Math.min(i + 1, sugs.length - 1)); }
    else if (e.key === 'ArrowUp' && sugs.length) { e.preventDefault(); setSugIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };
  useEffect(() => { listRef.current?.querySelector('.verse.live')?.scrollIntoView({ block: 'nearest' }); }, [liveIndex, livePres]);

  const savePassage = () => {
    if (!chapterRef || !bible) return;
    const from = parsed && parsed.book === chapterRef.book && parsed.chapter === chapterRef.chapter && parsed.verse ? parsed.verse : 1;
    const to = parsed && parsed.verse && parsed.book === chapterRef.book && parsed.chapter === chapterRef.chapter ? (parsed.endVerse || parsed.verse) : (bible.books[chapterRef.book].chapters[chapterRef.chapter - 1] || []).length;
    onSave({ title: `${refLabel(chapterRef.book, chapterRef.chapter, from, to)} (${tId})`, credits: bible.name || tId, text: passageText(bible, tId, chapterRef.book, chapterRef.chapter, from, to), scripture: true });
  };

  const isLiveChapter = livePres && pres && livePres === pres.id;
  const chapters = chapterRef && bible ? bible.books[chapterRef.book]?.chapters.length || 0 : 0;

  return (
    <div className="bible">
      <div className="bible-bar">
        <select className="input small tsel" value={tId} onChange={(e) => setTId(e.target.value)} title="Translation">
          {TRANSLATIONS.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}
          {imported.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}
        </select>
        <div className="bible-search">
          <input ref={inputRef} className="input small" value={query} onChange={(e) => { setQuery(e.target.value); setSugIdx(0); }} onKeyDown={onKey}
            placeholder="John 3 16  ·  or words: love one another" spellCheck={false} />
          {sugs.length > 0 && (
            <div className="sugs">
              {sugs.map((i, k) => <button key={i} className={k === sugIdx ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pickBook(i); }}>{BOOKS[i]}</button>)}
            </div>
          )}
        </div>
        <button className="btn small primary" onClick={submit} disabled={!bible || !query.trim()}>{parsed && (!typingBook || exactBook) ? `Go to ${refLabel(parsed.book, parsed.chapter, parsed.verse, parsed.endVerse)}` : 'Search'}</button>
        <button className="btn small" onClick={() => setShowImport(true)} title="Import a Bible your church is licensed to use">⤓</button>
      </div>
      {err && <div className="empty">{err}</div>}
      {!bible && !err && <div className="empty">Loading {tId}…</div>}

      {hits && (
        <div className="verse-list" ref={listRef}>
          <div className="section-label">{hits.length} verse{hits.length === 1 ? '' : 's'} found</div>
          {hits.map((h) => (
            <button key={`${h.book}-${h.chapter}-${h.verse}`} className="verse" onClick={() => { open(h); setTimeout(() => onGoLive(`bible:${tId}:${h.book}:${h.chapter}`, h.verse - 1), 0); }}>
              <span className="vref">{refLabel(h.book, h.chapter, h.verse)}</span><span className="vtext">{h.text}</span>
            </button>
          ))}
        </div>
      )}

      {!hits && pres && (
        <>
          <div className="chapter-head">
            <button className="icon-btn" disabled={chapterRef.chapter <= 1} onClick={() => open({ book: chapterRef.book, chapter: chapterRef.chapter - 1 })} title="Previous chapter">‹</button>
            <h2>{BOOKS[chapterRef.book]} {chapterRef.chapter}</h2>
            <button className="icon-btn" disabled={chapterRef.chapter >= chapters} onClick={() => open({ book: chapterRef.book, chapter: chapterRef.chapter + 1 })} title="Next chapter">›</button>
            <span className="muted small">{tId}</span>
            <div className="spacer" />
            <button className="btn small" onClick={savePassage} title="Save as a library item you can put in a playlist">＋ Save to library</button>
          </div>
          <div className="verse-list" ref={listRef}>
            {pres.slides.map((v, i) => (
              <button key={i} className={`verse ${isLiveChapter && liveIndex === i ? 'live' : ''} ${parsed && parsed.book === chapterRef.book && parsed.chapter === chapterRef.chapter && parsed.verse && i + 1 >= parsed.verse && i + 1 <= (parsed.endVerse || parsed.verse) ? 'hit' : ''}`}
                onClick={() => onGoLive(pres.id, i)}>
                <span className="vnum">{i + 1}</span><span className="vtext">{v.text}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {!hits && !pres && bible && (
        <div className="empty">Type a reference like <b>John 3 16</b> or <b>ps 23</b> and press Enter. Book names complete as you type (Tab or Space). Type words instead to search the whole Bible.</div>
      )}
      {showImport && <ImportBible onClose={() => setShowImport(false)} onDone={(id) => { refreshImported(); forgetBible(id); setTId(id); setShowImport(false); flash('Bible imported'); }} imported={imported} onRemoved={(l) => { setImported(l); if (!TRANSLATIONS.some((t) => t.id === tId) && !l.some((t) => t.id === tId)) setTId('KJV'); }} />}
    </div>
  );
}

function ImportBible({ onClose, onDone, imported, onRemoved }) {
  const [parsed, setParsed] = useState(null);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const read = async (f) => {
    if (!f) return;
    setMsg('Reading…');
    try {
      const b = parseBibleFile(await f.text(), f.name);
      setParsed(b); setId(b.id || f.name.replace(/\.[^.]+$/, '').slice(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '')); setName(b.name || f.name);
      setMsg(`${b.stats.books} books, ${b.stats.verses.toLocaleString()} verses found (${b.stats.format}).`);
    } catch (e) { setParsed(null); setMsg(e.message); }
  };
  const save = async () => {
    try {
      await api.biblesSave(id, name, JSON.stringify({ ...parsed, id: id.toUpperCase(), name }));
      onDone(id.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    } catch (e) { setMsg(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  };
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Import a Bible</h3><button className="icon-btn" onClick={onClose}>✕</button></div>
        <div className="panel-body">
          <div className="hint">Add a translation your church is licensed to use. Files: Zefania / OSIS / USFX XML, OpenSong, or JSON. It's kept on this PC.</div>
          {api?.biblesSave ? <input type="file" accept=".xml,.json,.xmm,.txt" onChange={(e) => read(e.target.files[0])} /> : <div className="empty">Importing works in the desktop app.</div>}
          {msg && <div className="hint">{msg}</div>}
          {parsed && (
            <div className="style-grid inline">
              <label>Short name<input className="input" value={id} maxLength={10} onChange={(e) => setId(e.target.value.toUpperCase())} /></label>
              <label>Full name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
            </div>
          )}
          {imported.length > 0 && (
            <div className="list">
              <div className="section-label">Imported on this PC</div>
              {imported.map((b) => (
                <div key={b.id} className="msg-row"><span className="title">{b.id} · {b.name}</span>
                  <button className="icon-btn" title="Remove" onClick={async () => onRemoved(await api.biblesRemove(b.id))}>✕</button></div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot"><div className="spacer" /><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!parsed || !id} onClick={save}>Import</button></div>
      </div>
    </div>
  );
}
