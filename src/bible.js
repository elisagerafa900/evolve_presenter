// Bibles: four public-domain translations built in, plus any the church imports.
import { BOOKS } from '../shared/bibleRef.js';

export const TRANSLATIONS = [
  { id: 'KJV', name: 'King James Version' },
  { id: 'WEB', name: 'World English Bible' },
  { id: 'BSB', name: 'Berean Standard Bible' },
  { id: 'ASV', name: 'American Standard Version' },
];
export const BUILTIN_IDS = new Set(TRANSLATIONS.map((t) => t.id));
const cache = new Map();

export function loadBible(id) {
  if (!cache.has(id)) {
    const p = BUILTIN_IDS.has(id)
      ? fetch(`./bibles/${id}.json`).then((r) => { if (!r.ok) throw new Error(`Could not load ${id}`); return r.json(); })
      : window.presenter?.biblesRead
        ? window.presenter.biblesRead(id).then((t) => JSON.parse(t))
        : Promise.reject(new Error(`${id} is not available`));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return cache.get(id);
}
export const forgetBible = (id) => cache.delete(id);

export const refLabel = (book, chapter, verse, end) => `${BOOKS[book]} ${chapter}${verse ? `:${verse}` : ''}${end && end !== verse ? `-${end}` : ''}`;

/** Every word must appear; exact phrase first. */
export function searchText(bible, query, limit = 80) {
  const words = query.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  if (!words.length || !bible) return [];
  const phrase = words.join(' ');
  const hits = [];
  bible.books.forEach((b, bi) => b.chapters.forEach((ch, ci) => ch.forEach((t, vi) => {
    const lt = t.toLowerCase();
    if (words.every((w) => lt.includes(w))) hits.push({ book: bi, chapter: ci + 1, verse: vi + 1, text: t, exact: lt.includes(phrase) });
  })));
  hits.sort((a, b) => b.exact - a.exact);
  return hits.slice(0, limit);
}

/** A chapter as a presentation the rest of the app can show: one verse per slide, reference as caption. */
export function chapterPresentation(bible, tId, book, chapter) {
  const verses = bible?.books[book]?.chapters[chapter - 1] || [];
  const title = `${BOOKS[book]} ${chapter} (${tId})`;
  return {
    id: `bible:${tId}:${book}:${chapter}`,
    title,
    credits: bible?.name || tId,
    scripture: true,
    virtual: true,
    slides: verses.map((t, i) => ({ group: `${BOOKS[book]} ${chapter}:${i + 1}`, text: t, lines: [t], index: i, caption: `${BOOKS[book]} ${chapter}:${i + 1} ${tId}` })),
  };
}

/** Verses → text for a saved library item (each verse a slide, labelled with its reference). */
export function passageText(bible, tId, book, chapter, from, to) {
  const verses = bible?.books[book]?.chapters[chapter - 1] || [];
  const out = [];
  for (let v = from; v <= Math.min(to, verses.length); v++) out.push(`[${BOOKS[book]} ${chapter}:${v}]\n${verses[v - 1]}`);
  return out.join('\n\n');
}
