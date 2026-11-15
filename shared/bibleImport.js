// Reads Bible files in common formats into the app's format:
//   { books: [ { chapters: [ [verse1, verse2, ...], ... ] } x66 ] }
// Supported: our JSON, scrollmapper-style JSON, Zefania XML, USFX XML, OSIS XML, CSV/TSV.
import { BOOKS, suggestBooks } from './bibleRef.js';

// USFM/USFX/Paratext 3-letter codes, in Bible order
const CODES = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'];
// OSIS book ids
const OSIS = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'];
const EXTRA_CODES = { EZE: 25, JOE: 28, NAH: 33, MAR: 40, JOH: 42, PHI: 49, JAM: 58, SOS: 21, SOL: 21 };

/** Book index (0-65) from a name, code or number (1-66). -1 if unknown. */
export function resolveBook(x) {
  if (x === null || x === undefined) return -1;
  const s = String(x).trim();
  if (/^\d+$/.test(s)) {
    const n = +s;
    return n >= 1 && n <= 66 ? n - 1 : -1;
  }
  const up = s.toUpperCase();
  let i = CODES.indexOf(up);
  if (i >= 0) return i;
  if (EXTRA_CODES[up] !== undefined) return EXTRA_CODES[up];
  i = OSIS.findIndex((o) => o.toLowerCase() === s.toLowerCase());
  if (i >= 0) return i;
  const exact = BOOKS.findIndex((b) => b.toLowerCase() === s.toLowerCase());
  if (exact >= 0) return exact;
  const cand = suggestBooks(s.replace(/\./g, ''));
  return cand.length ? cand[0] : -1;
}

function decodeEntities(t) {
  return t
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function clean(t) {
  return decodeEntities(t.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([,.;:!?’”)])/g, '$1').trim();
}

class Builder {
  constructor() { this.books = Array.from({ length: 66 }, () => ({ chapters: [] })); this.verses = 0; this.skippedBooks = new Set(); }
  add(book, chapter, verse, text) {
    if (book < 0 || book > 65 || !(chapter >= 1) || !(verse >= 1)) return;
    const t = clean(String(text ?? ''));
    if (!t) return;
    const chs = this.books[book].chapters;
    while (chs.length < chapter) chs.push([]);
    const vs = chs[chapter - 1];
    while (vs.length < verse - 1) vs.push('');
    if (vs[verse - 1]) vs[verse - 1] += ` ${t}`;
    else vs[verse - 1] = t;
    this.verses += 1;
  }
  result(format) {
    const present = this.books.filter((b) => b.chapters.length).length;
    return { books: this.books, stats: { format, books: present, verses: this.verses, skipped: [...this.skippedBooks] } };
  }
}

function parseJson(text) {
  const d = JSON.parse(text);
  const b = new Builder();
  // Our format: {books:[{chapters:[[...]]}]}
  if (Array.isArray(d.books) && d.books[0] && Array.isArray(d.books[0].chapters) && Array.isArray(d.books[0].chapters[0])) {
    d.books.forEach((bk, i) => {
      const bi = bk.name ? resolveBook(bk.name) : i;
      bk.chapters.forEach((ch, ci) => ch.forEach((t, vi) => b.add(bi >= 0 ? bi : i, ci + 1, vi + 1, t)));
    });
    return b.result('JSON');
  }
  // scrollmapper style: {books:[{name, chapters:[{chapter, verses:[{verse, text}]}]}]}
  if (Array.isArray(d.books)) {
    d.books.forEach((bk, i) => {
      let bi = resolveBook(bk.name ?? bk.book ?? i + 1);
      if (bi < 0) { b.skippedBooks.add(bk.name); return; }
      for (const ch of bk.chapters || []) {
        for (const v of ch.verses || []) b.add(bi, +(ch.chapter ?? v.chapter), +v.verse, v.text);
      }
    });
    return b.result('JSON');
  }
  // flat list: [{book, chapter, verse, text}]
  const list = Array.isArray(d) ? d : d.verses;
  if (Array.isArray(list)) {
    for (const v of list) {
      const bi = resolveBook(v.book ?? v.book_name ?? v.bookname ?? v.b);
      if (bi < 0) { b.skippedBooks.add(v.book ?? v.book_name); continue; }
      b.add(bi, +(v.chapter ?? v.c), +(v.verse ?? v.v), v.text ?? v.t);
    }
    return b.result('JSON');
  }
  throw new Error('This JSON file does not look like a Bible.');
}

function parseZefania(text) {
  const b = new Builder();
  const bookRe = /<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi;
  let m;
  while ((m = bookRe.exec(text))) {
    const attrs = m[1];
    const num = /bnumber="(\d+)"/i.exec(attrs)?.[1];
    const name = /bname="([^"]+)"/i.exec(attrs)?.[1];
    const bi = num ? resolveBook(num) : resolveBook(name);
    if (bi < 0) { b.skippedBooks.add(name || num); continue; }
    const chRe = /<CHAPTER\b[^>]*cnumber="(\d+)"[^>]*>([\s\S]*?)<\/CHAPTER>/gi;
    let c;
    while ((c = chRe.exec(m[2]))) {
      const vRe = /<VERS\b[^>]*vnumber="(\d+)"[^>]*>([\s\S]*?)<\/VERS>/gi;
      let v;
      const body = c[2].replace(/<NOTE\b[\s\S]*?<\/NOTE>/gi, '');
      while ((v = vRe.exec(body))) b.add(bi, +c[1], +v[1], v[2]);
    }
  }
  return b.result('Zefania XML');
}

function parseUsfx(text) {
  const b = new Builder();
  // drop notes, cross references, headings, psalm titles
  const body = text
    .replace(/<f\b[\s\S]*?<\/f>/g, '')
    .replace(/<x\b[\s\S]*?<\/x>/g, '')
    .replace(/<(h|toc|s|d|rem|ide|id)\b[\s\S]*?<\/\1>/g, '');
  const bookRe = /<book\b[^>]*id="([A-Z0-9]{3})"[^>]*>([\s\S]*?)<\/book>/g;
  let m;
  while ((m = bookRe.exec(body))) {
    const bi = CODES.indexOf(m[1]);
    if (bi < 0) { if (!['FRT', 'GLO', 'BAK', 'OTH', 'INT', 'CNC', 'TDX'].includes(m[1])) b.skippedBooks.add(m[1]); continue; }
    const parts = m[2].split(/(<c\s+id="\d+"\s*\/>|<v\s+id="[\d-]+"\s*\/>|<ve\s*\/>)/);
    let ch = 0;
    let vs = 0;
    let buf = '';
    const flush = () => { if (ch && vs && buf.trim()) b.add(bi, ch, vs, buf); buf = ''; };
    for (const p of parts) {
      let mm;
      if ((mm = /^<c\s+id="(\d+)"/.exec(p))) { flush(); ch = +mm[1]; vs = 0; }
      else if ((mm = /^<v\s+id="(\d+)/.exec(p))) { flush(); vs = +mm[1]; }
      else if (/^<ve/.test(p)) { flush(); vs = 0; }
      else if (vs) buf += p;
    }
    flush();
  }
  return b.result('USFX XML');
}

function parseOsis(text) {
  const b = new Builder();
  const body = text.replace(/<note\b[\s\S]*?<\/note>/g, '').replace(/<title\b[\s\S]*?<\/title>/g, '');
  // container style: <verse osisID="Gen.1.1">text</verse>
  const vRe = /<verse\b[^>]*osisID="([^".]+)\.(\d+)\.(\d+)"[^>]*>([\s\S]*?)<\/verse>/g;
  let m;
  let found = 0;
  while ((m = vRe.exec(body))) { b.add(resolveBook(m[1]), +m[2], +m[3], m[4]); found += 1; }
  if (!found) {
    // milestone style: <verse sID="Gen.1.1" osisID="Gen.1.1"/> text <verse eID="Gen.1.1"/>
    const parts = body.split(/(<verse\b[^>]*\/>)/);
    let cur = null;
    for (const p of parts) {
      const s = /sID="([^".]+)\.(\d+)\.(\d+)"/.exec(p);
      if (s) { cur = { b: resolveBook(s[1]), c: +s[2], v: +s[3] }; continue; }
      if (/eID=/.test(p)) { cur = null; continue; }
      if (cur) b.add(cur.b, cur.c, cur.v, p);
    }
  }
  return b.result('OSIS XML');
}

function parseDelimited(text) {
  const b = new Builder();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sample = lines.slice(0, 20).join('\n');
  const sep = sample.includes('\t') ? '\t' : /^[^|\n]+\|\d+\|\d+\|/m.test(sample) ? '|' : ',';
  const split = (line) => {
    if (sep !== ',') return line.split(sep);
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  for (const line of lines) {
    const cols = split(line).map((c) => c.trim());
    // Book, Chapter, Verse, Text  — or  "John 3:16<sep>Text"
    let bi, c, v, t;
    if (cols.length >= 4 && /^\d+$/.test(cols[1]) && /^\d+$/.test(cols[2])) {
      [bi, c, v] = [resolveBook(cols[0]), +cols[1], +cols[2]];
      t = cols.slice(3).join(sep === ',' ? ', ' : ' ');
    } else if (cols.length >= 2) {
      const r = /^(.+?)\s+(\d+):(\d+)$/.exec(cols[0]);
      if (!r) continue; // header row or junk
      [bi, c, v] = [resolveBook(r[1]), +r[2], +r[3]];
      t = cols.slice(1).join(' ');
    } else continue;
    if (bi < 0) { b.skippedBooks.add(cols[0]); continue; }
    b.add(bi, c, v, t);
  }
  return b.result('CSV/TSV');
}

/** Detect the format and read the file. Throws with a friendly message if it can't. */
export function parseBibleFile(text, filename = '') {
  const t = text.replace(/^﻿/, '');
  const head = t.slice(0, 4000);
  let r;
  if (/^\s*[[{]/.test(t)) r = parseJson(t);
  else if (/<XMLBIBLE|<BIBLEBOOK/i.test(head)) r = parseZefania(t);
  else if (/<usfx|<book\s+id=/i.test(head)) r = parseUsfx(t);
  else if (/<osis/i.test(head)) r = parseOsis(t);
  else if (/\.(xml|osis)$/i.test(filename)) throw new Error('This XML format is not supported yet (try Zefania, USFX or OSIS).');
  else r = parseDelimited(t);
  if (r.stats.verses < 100) throw new Error(`Only ${r.stats.verses} verses were found — is this a whole Bible?`);
  return r;
}
