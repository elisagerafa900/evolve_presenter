// Reads song files into presentations.
// Formats: CCLI SongSelect lyrics (.txt), SongSelect .usr, OpenLyrics (.xml),
// ChordPro (.cho / .pro / .chordpro), and plain text in Evolve's own format.
//
// Every reader returns { title, credits, ccli, sections: [{ label, slides: [[line, …], …] }] }
// and songToText() turns that into the editor's text ("[Verse 1]" + blank line = new slide).

const SECTION = /^(verse|chorus|refrain|pre[- ]?chorus|bridge|intro|outro|ending|tag|interlude|instrumental|vamp|hook|turnaround|misc|coda|break|outro chorus|channel)(\s*\d+[a-z]?)?\s*:?$/i;

const tidy = (s) => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const titleCase = (s) => tidy(s).toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

function decodeEntities(t) {
  return t
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function credits(parts) {
  return parts.map(tidy).filter(Boolean).join(' · ');
}

/** Split one slide's lines into slides of at most n lines (0 = keep as is). */
export function chunk(lines, n) {
  if (!n || lines.length <= n) return [lines];
  const out = [];
  for (let i = 0; i < lines.length; i += n) out.push(lines.slice(i, i + n));
  return out;
}

/** Song -> editor text. linesPerSlide: 0 keeps the file's own slides/sections. */
export function songToText(song, linesPerSlide = 0) {
  const parts = [];
  for (const sec of song.sections) {
    const slides = sec.slides.flatMap((s) => chunk(s, linesPerSlide)).filter((s) => s.length);
    if (!slides.length) continue;
    parts.push(`${sec.label ? `[${sec.label}]\n` : ''}${slides.map((s) => s.join('\n')).join('\n\n')}`);
  }
  return parts.join('\n\n');
}

export const slideCount = (song, n = 0) => song.sections.reduce((t, s) => t + s.slides.flatMap((x) => chunk(x, n)).filter((x) => x.length).length, 0);

// ---------------- CCLI SongSelect lyrics (.txt) ----------------
export function isSongSelectText(text) {
  return /^\s*CCLI Song\s*#/im.test(text) || /SongSelect/i.test(text);
}

export function parseSongSelectText(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const title = tidy(lines[i++]);
  const footer = lines.findIndex((l, k) => k >= i && /^\s*CCLI Song\s*#/i.test(l));
  const body = lines.slice(i, footer >= 0 ? footer : lines.length);
  const foot = footer >= 0 ? lines.slice(footer).map(tidy).filter(Boolean) : [];

  const sections = [];
  let block = [];
  const flush = () => {
    if (!block.length) return;
    const first = block[0].trim();
    if (SECTION.test(first)) sections.push({ label: titleCase(first.replace(/:$/, '')), slides: [block.slice(1).map(tidy).filter(Boolean)] });
    else if (sections.length) sections[sections.length - 1].slides.push(block.map(tidy).filter(Boolean));
    else sections.push({ label: '', slides: [block.map(tidy).filter(Boolean)] });
    block = [];
  };
  for (const l of body) {
    if (!l.trim()) flush();
    else block.push(l);
  }
  flush();

  const ccli = (foot[0]?.match(/#\s*(\d+)/) || [])[1] || '';
  const authors = foot[1] && !/^©|copyright|for use solely|license/i.test(foot[1]) ? foot[1].replace(/\s*\|\s*/g, ', ') : '';
  const copyright = foot.filter((l) => /^©|^copyright/i.test(l)).join(' ');
  return { title: title || 'Untitled', ccli, credits: credits([authors, copyright, ccli && `CCLI Song #${ccli}`]), sections };
}

// ---------------- SongSelect .usr ----------------
export function isUsr(text) {
  return /^\s*\[File\][\s\S]*SongSelect/i.test(text) || /^Words=/m.test(text);
}

export function parseUsr(text) {
  const get = (k) => (new RegExp(`^${k}=(.*)$`, 'mi').exec(text) || [])[1] || '';
  const fields = get('Fields').split('/t');
  const words = get('Words').split('/t');
  const sections = words.map((w, i) => ({
    label: titleCase(fields[i] || ''),
    slides: [w.split('/n').map(tidy).filter(Boolean)],
  })).filter((s) => s.slides[0].length);
  const ccli = (/^\[S\s+A?(\d+)\]/mi.exec(text) || [])[1] || '';
  const author = get('Author').split('|').map(tidy).filter(Boolean).join(', ');
  const copyright = get('Copyright').split('|').map(tidy).filter(Boolean).join(', ');
  return {
    title: tidy(get('Title')) || 'Untitled',
    ccli,
    credits: credits([author, copyright && `© ${copyright.replace(/^©\s*/, '')}`, ccli && `CCLI Song #${ccli}`]),
    sections,
  };
}

// ---------------- OpenLyrics (.xml) ----------------
export function isOpenLyrics(text) {
  return /<song\b[^>]*openlyrics/i.test(text) || (/<song\b/i.test(text) && /<lyrics\b/i.test(text));
}

const OL_NAMES = { v: 'Verse', c: 'Chorus', b: 'Bridge', p: 'Pre-Chorus', i: 'Intro', o: 'Outro', e: 'Ending', t: 'Tag', m: 'Misc' };
function olLabel(name) {
  const m = /^([a-z]+)(\d*)[a-z]?$/i.exec(name || '');
  if (!m) return titleCase(name || '');
  const base = OL_NAMES[m[1].toLowerCase()] || titleCase(m[1]);
  return m[2] ? `${base} ${m[2]}` : base;
}

function olLines(inner) {
  const t = inner
    .replace(/<comment\b[\s\S]*?<\/comment>/gi, '')
    .replace(/<chord\b[^>]*\/>/gi, '')
    .replace(/<chord\b[^>]*>([\s\S]*?)<\/chord>/gi, '$1')
    .replace(/<\/line>/gi, '<br/>') // OpenLyrics 0.7 used <line> elements
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(t).split('\n').map(tidy).filter(Boolean);
}

export function parseOpenLyrics(text) {
  const tag = (name) => { const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(text); return m ? tidy(decodeEntities(m[1].replace(/<[^>]+>/g, ''))) : ''; };
  const authors = [...text.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/gi)].map((m) => tidy(decodeEntities(m[1])));
  const verses = [...text.matchAll(/<verse\b([^>]*)>([\s\S]*?)<\/verse>/gi)].map((m) => {
    const name = (/\bname="([^"]*)"/i.exec(m[1]) || [])[1] || '';
    const slides = [...m[2].matchAll(/<lines\b[^>]*>([\s\S]*?)<\/lines>/gi)].map((l) => olLines(l[1])).filter((s) => s.length);
    return { name, label: olLabel(name), slides: slides.length ? slides : [olLines(m[2])] };
  });
  const order = tag('verseOrder').split(/\s+/).filter(Boolean);
  let sections = verses;
  if (order.length) {
    const byName = new Map();
    for (const v of verses) byName.set(v.name.toLowerCase(), [...(byName.get(v.name.toLowerCase()) || []), v]);
    const ordered = order.flatMap((n) => byName.get(n.toLowerCase()) || []);
    if (ordered.length) sections = ordered;
  }
  const ccli = tag('ccliNo');
  const copyright = tag('copyright');
  return {
    title: tag('title') || 'Untitled',
    ccli,
    credits: credits([authors.join(', '), copyright && `© ${copyright.replace(/^©\s*/, '')}`, ccli && `CCLI Song #${ccli}`]),
    sections: sections.map((v) => ({ label: v.label, slides: v.slides })),
  };
}

// ---------------- ChordPro ----------------
export function isChordPro(text) {
  return /^\s*\{(title|t|soc|start_of_chorus|sov|start_of_verse|artist|subtitle|st)\b/im.test(text);
}

export function parseChordPro(text) {
  const meta = {};
  const sections = [];
  let cur = { label: '', lines: [] };
  const push = () => {
    if (cur.lines.length) sections.push({ label: cur.label, slides: [cur.lines] });
    cur = { label: '', lines: [] };
  };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    const d = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line);
    if (d) {
      const key = d[1].toLowerCase();
      const val = d[2] || '';
      if (['title', 't'].includes(key)) meta.title = val;
      else if (['artist', 'composer', 'lyricist', 'subtitle', 'st'].includes(key)) (meta.authors ||= []).push(val);
      else if (key === 'copyright') meta.copyright = val;
      else if (key === 'ccli') meta.ccli = val;
      else if (['start_of_chorus', 'soc'].includes(key)) { push(); cur.label = val || 'Chorus'; }
      else if (['start_of_verse', 'sov'].includes(key)) { push(); cur.label = val || 'Verse'; }
      else if (['start_of_bridge', 'sob'].includes(key)) { push(); cur.label = val || 'Bridge'; }
      else if (/^end_of_|^eo[cvb]$/.test(key)) push();
      else if (['comment', 'c', 'ci', 'comment_italic'].includes(key) && SECTION.test(val)) { push(); cur.label = titleCase(val.replace(/:$/, '')); }
      continue;
    }
    if (!line) { const label = cur.label; push(); cur.label = ''; if (!sections.length && label) cur.label = label; continue; }
    if (SECTION.test(line) && !cur.lines.length) { cur.label = titleCase(line.replace(/:$/, '')); continue; }
    const words = tidy(line.replace(/\[[^\]]*\]/g, ''));
    if (words) cur.lines.push(words);
  }
  push();
  return {
    title: tidy(meta.title) || 'Untitled',
    ccli: meta.ccli || '',
    credits: credits([(meta.authors || []).join(', '), meta.copyright && `© ${meta.copyright.replace(/^©\s*/, '')}`, meta.ccli && `CCLI Song #${meta.ccli}`]),
    sections,
  };
}

// ---------------- plain text ----------------
export function parsePlainText(text, fallbackTitle = 'Untitled') {
  const sections = [];
  let label = '';
  let slide = [];
  let slides = [];
  const endSlide = () => { if (slide.length) slides.push(slide); slide = []; };
  const endSection = () => { endSlide(); if (slides.length) sections.push({ label, slides }); slides = []; };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const br = /^\[(.+)\]$/.exec(line);
    if (br || SECTION.test(line)) { endSection(); label = titleCase((br ? br[1] : line).replace(/:$/, '')); continue; }
    if (!line) { endSlide(); continue; }
    slide.push(tidy(line));
  }
  endSection();
  return { title: fallbackTitle, ccli: '', credits: '', sections };
}

/**
 * Pasted lyrics with no blank lines (copied from a web page) come in as one long slide.
 * This splits any slide longer than n lines.
 */
export function needsSplitting(song, n = 4) {
  return song.sections.some((s) => s.slides.some((sl) => sl.length > n * 2));
}

/** Pick the right reader. */
export function parseSongFile(text, filename = '') {
  const t = String(text).replace(/^﻿/, '');
  const ext = (/\.([a-z0-9]+)$/i.exec(filename) || [])[1]?.toLowerCase() || '';
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled';
  let song;
  let format;
  if (ext === 'usr' || isUsr(t)) { song = parseUsr(t); format = 'SongSelect (.usr)'; }
  else if (ext === 'xml' || isOpenLyrics(t)) {
    if (!isOpenLyrics(t)) throw new Error('This XML file is not an OpenLyrics song.');
    song = parseOpenLyrics(t); format = 'OpenLyrics';
  } else if (['cho', 'pro', 'chopro', 'chordpro', 'crd'].includes(ext) || isChordPro(t)) { song = parseChordPro(t); format = 'ChordPro'; }
  else if (isSongSelectText(t)) { song = parseSongSelectText(t); format = 'SongSelect'; }
  else { song = parsePlainText(t, base); format = 'Text'; }
  if (!song.sections.length) throw new Error('No lyrics found in this file.');
  if (song.title === 'Untitled') song.title = base;
  return { ...song, format };
}

/** Bytes -> text: UTF-16 (SongSelect sometimes), UTF-8, or Windows-1252 for old files. */
export function decodeBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch { return new TextDecoder('windows-1252').decode(u8); }
}
