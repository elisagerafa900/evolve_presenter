// Scripture reference parser.
// Used now for the search box ("jn 3:16", "1 cor 13 4-7") and in Phase 3 for
// live transcripts ("turn with me to John chapter three verse sixteen").

export const BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians',
  '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

// Extra names people say or type. Index = book index.
const EXTRA = {
  0: ['gen', 'ge', 'gn'],
  1: ['exo', 'ex', 'exod'],
  2: ['lev', 'le', 'lv'],
  3: ['num', 'nu', 'nm'],
  4: ['deut', 'deu', 'dt'],
  5: ['josh', 'jos'],
  6: ['judg', 'jdg', 'jg'],
  7: ['ru', 'rth'],
  8: ['sam', 'sa', 'samuel'],
  9: ['sam', 'sa', 'samuel'],
  10: ['kgs', 'ki', 'kings'],
  11: ['kgs', 'ki', 'kings'],
  12: ['chr', 'chron', 'ch', 'chronicles'],
  13: ['chr', 'chron', 'ch', 'chronicles'],
  14: ['ezr'],
  15: ['neh', 'ne'],
  16: ['est', 'esth'],
  17: ['jb'],
  18: ['psalm', 'ps', 'psa', 'pss', 'psalms of david'],
  19: ['prov', 'pro', 'prv', 'pr', 'proverb'],
  20: ['eccl', 'ecc', 'eccles', 'qoh', 'ecclesiastics'],
  21: ['song of songs', 'songs', 'song', 'sos', 'canticles', 'song of sol'],
  22: ['isa', 'isiah', 'isaiha'],
  23: ['jer', 'je', 'jeremaiah'],
  24: ['lam', 'la'],
  25: ['ezek', 'eze', 'ezk'],
  26: ['dan', 'da', 'dn'],
  27: ['hos', 'ho'],
  28: ['jl'],
  29: ['am'],
  30: ['obad', 'ob'],
  31: ['jon', 'jnh'],
  32: ['mic', 'mi'],
  33: ['nah', 'na'],
  34: ['hab', 'hb'],
  35: ['zeph', 'zep'],
  36: ['hag', 'hg'],
  37: ['zech', 'zec'],
  38: ['mal', 'ml'],
  39: ['matt', 'mat', 'mt'],
  40: ['mk', 'mrk', 'mar'],
  41: ['lk', 'luk'],
  42: ['jn', 'jhn', 'joh'],
  43: ['act', 'ac', 'acts of the apostles'],
  44: ['rom', 'ro', 'rm'],
  45: ['cor', 'co', 'corinthians'],
  46: ['cor', 'co', 'corinthians'],
  47: ['gal', 'ga'],
  48: ['eph', 'ephes'],
  49: ['phil', 'php', 'pp', 'philipians'],
  50: ['col'],
  51: ['thess', 'thes', 'th', 'thessalonians'],
  52: ['thess', 'thes', 'th', 'thessalonians'],
  53: ['tim', 'ti', 'timothy'],
  54: ['tim', 'ti', 'timothy'],
  55: ['tit'],
  56: ['philem', 'phm', 'phlm'],
  57: ['heb'],
  58: ['jas', 'jm', 'jms'],
  59: ['pet', 'pe', 'pt', 'peter'],
  60: ['pet', 'pe', 'pt', 'peter'],
  61: ['jn', 'jhn', 'john'],
  62: ['jn', 'jhn', 'john'],
  63: ['jn', 'jhn', 'john'],
  64: ['jud'],
  65: ['rev', 're', 'rv', 'revelations', 'revelation of john', 'apocalypse'],
};

// Abbreviations too short/ambiguous to trust in a live transcript.
const SPOKEN_OK = new Set([
  'psalm', 'proverb', 'song of songs', 'songs', 'acts of the apostles', 'revelations',
  'revelation of john', 'samuel', 'kings', 'chronicles', 'corinthians', 'thessalonians',
  'timothy', 'peter', 'john', 'ecclesiastics', 'philipians', 'isiah', 'apocalypse',
]);

const NUM_PREFIX = {
  1: ['1', '1st', 'i', 'first', 'one'],
  2: ['2', '2nd', 'ii', 'second', 'two'],
  3: ['3', '3rd', 'iii', 'third', 'three'],
};

function aliasesFor(i, spoken) {
  const name = BOOKS[i];
  const m = name.match(/^([123]) (.+)$/);
  const bases = new Set([m ? m[2].toLowerCase() : name.toLowerCase()]);
  for (const e of EXTRA[i] || []) {
    if (!spoken || SPOKEN_OK.has(e)) bases.add(e);
  }
  const out = new Set();
  for (const b of bases) {
    if (m) {
      for (const p of NUM_PREFIX[m[1]]) {
        if (spoken && p === 'i') continue; // "I John" in speech is ambiguous
        out.add(`${p} ${b}`);
        if (/^\d/.test(p)) out.add(`${p}${b}`);
      }
    } else {
      out.add(b);
    }
  }
  return [...out];
}

function buildMatcher(spoken) {
  const map = new Map();
  for (let i = 0; i < BOOKS.length; i++) {
    for (const a of aliasesFor(i, spoken)) if (!map.has(a)) map.set(a, i);
  }
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  const esc = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
  return { map, re: new RegExp(`\\b(${esc.join('|')})\\b\\.?`, 'g') };
}

const TYPED = buildMatcher(false);
const SPOKEN = buildMatcher(true);

// ---------- spoken numbers -> digits ----------
const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

export function wordsToDigits(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  let cur = null;
  const flush = () => { if (cur) { out.push(String(cur.v)); cur = null; } };
  for (const t of words) {
    const w = t.toLowerCase();
    const isUnit = w in UNITS, isTeen = w in TEENS, isTen = w in TENS, isHundred = w === 'hundred';
    if (isUnit || isTeen || isTen || isHundred) {
      if (cur && (
        (isUnit && (cur.unit || cur.teen)) ||
        ((isTeen || isTen) && (cur.unit || cur.teen || cur.tens)) ||
        (isHundred && cur.hundred))) flush();
      if (!cur) cur = { v: 0 };
      if (isUnit) { cur.v += UNITS[w]; cur.unit = true; }
      else if (isTeen) { cur.v += TEENS[w]; cur.teen = true; }
      else if (isTen) { cur.v += TENS[w]; cur.tens = true; }
      else { cur.v = (cur.v || 1) * 100; cur.hundred = true; cur.unit = cur.teen = cur.tens = false; }
      continue;
    }
    if (w === 'and' && cur && cur.hundred && !cur.unit && !cur.tens && !cur.teen) continue;
    flush();
    out.push(t);
  }
  flush();
  return out.join(' ');
}

function normalize(text) {
  let s = ` ${text} `.toLowerCase();
  s = s.replace(/[\u2013\u2014]/g, '-');
  s = s.replace(/([a-z])-([a-z])/g, '$1 $2'); // twenty-three -> twenty three
  s = s.replace(/[^a-z0-9:\-\s.]/g, ' ');
  s = s.replace(/\.(?=\s|$)/g, ' ');
  s = s.replace(/([a-z])(\d)/g, '$1 $2'); // jn3:16 -> jn 3:16
  s = wordsToDigits(s);
  // "verse 16 to 18", "16 through 18" -> 16-18
  s = s.replace(/(\d+)\s*(?:-|to|through|thru|till|until)\s*(?:verse\s*)?(\d+)/g, '$1-$2');
  return s.replace(/\s+/g, ' ');
}

// What may follow a book name.
const TAIL = [
  // chapter 3 verse(s) 16(-18)   / chapter 3 and verse 16 / chapter 3 from verse 16
  { re: /^\s*(?:chapter|chap|ch)\s*(\d+)\s*(?:,|and|from)?\s*(?:verses?|vs?|vv)\s*(\d+)(?:-(\d+))?/, ch: 1, v: 2, e: 3 },
  // 3:16(-18)  3 : 16
  { re: /^\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?/, ch: 1, v: 2, e: 3 },
  // 3 verse 16 / 3 v 16 / 3 vs 16
  { re: /^\s*(\d+)\s*(?:,)?\s*(?:verses?|vs?|vv)\s*(\d+)(?:-(\d+))?/, ch: 1, v: 2, e: 3 },
  // 3 16(-18)  (spoken "John three sixteen")
  { re: /^\s*(\d+)\s+(\d+)(?:-(\d+))?(?!\s*:)/, ch: 1, v: 2, e: 3 },
  // chapter 3 / 3  (whole chapter)
  { re: /^\s*(?:chapter|chap|ch)\s*(\d+)/, ch: 1 },
  { re: /^\s*(\d+)(?!\s*\d)/, ch: 1 },
];

/**
 * Find all scripture references in text.
 * @param {string} text
 * @param {{spoken?: boolean, books?: {chapters: string[][]}[], context?: {book:number, chapter:number}}} opts
 *   books: Bible data, used to reject impossible chapters/verses.
 *   context: last book/chapter, so "verse 17" alone resolves (spoken mode).
 * @returns {{book:number, chapter:number, verse:number|null, endVerse:number|null, index:number, text:string}[]}
 */
export function findReferences(text, opts = {}) {
  const { spoken = false, books = null, context = null } = opts;
  const m = spoken ? SPOKEN : TYPED;
  const s = normalize(text);
  const out = [];
  m.re.lastIndex = 0;
  let hit;
  while ((hit = m.re.exec(s))) {
    const alias = hit[1].replace(/\s+/g, ' ');
    const book = m.map.get(alias);
    const rest = s.slice(hit.index + hit[0].length);
    for (const t of TAIL) {
      const mm = rest.match(t.re);
      if (!mm) continue;
      const chapter = +mm[t.ch];
      let verse = t.v ? +mm[t.v] : null;
      let endVerse = t.e && mm[t.e] ? +mm[t.e] : null;
      // Single-chapter books: "Jude 3" means verse 3.
      if (!t.v && books && books[book] && books[book].chapters.length === 1 && chapter > 1) {
        verse = chapter;
      }
      const ref = validate({ book, chapter: verse !== null && !t.v ? 1 : chapter, verse, endVerse }, books);
      if (ref) {
        out.push({ ...ref, index: hit.index, text: (hit[0] + mm[0]).trim() });
        m.re.lastIndex = hit.index + hit[0].length + mm[0].length;
      }
      break;
    }
  }
  // "verse 17" with no book, using context (live reading follow-along)
  if (spoken && context && out.length === 0) {
    const vm = s.match(/\b(?:verses?|vs)\s*(\d+)(?:-(\d+))?/);
    if (vm) {
      const ref = validate({ book: context.book, chapter: context.chapter, verse: +vm[1], endVerse: vm[2] ? +vm[2] : null }, books);
      if (ref) out.push({ ...ref, index: vm.index, text: vm[0].trim(), fromContext: true });
    }
  }
  return out;
}

function validate(ref, books) {
  let { book, chapter, verse, endVerse } = ref;
  if (!chapter || chapter < 1) return null;
  if (endVerse !== null && verse !== null && endVerse < verse) endVerse = null;
  if (endVerse === verse) endVerse = null;
  if (books) {
    const b = books[book];
    if (!b || chapter > b.chapters.length) return null;
    const n = b.chapters[chapter - 1].length;
    if (verse !== null && (verse < 1 || verse > n)) return null;
    if (endVerse !== null && endVerse > n) endVerse = n;
  }
  return { book, chapter, verse, endVerse };
}

/** Parse what the operator typed in the search box. Returns one reference or null. */
export function parseQuery(q, books = null) {
  const refs = findReferences(q, { books });
  if (refs.length) return refs[0];
  // Fallback: prefix match, e.g. "phili 4 13", "1 thes 5"
  const m = normalize(q).trim().match(/^([123]?\s*[a-z][a-z ]*?)\s*(\d+)?(?:\s*[: ]\s*(\d+))?(?:-(\d+))?$/);
  if (!m) return null;
  const idx = suggestBooks(m[1])[0];
  if (idx === undefined) return null;
  return validate({ book: idx, chapter: m[2] ? +m[2] : 1, verse: m[3] ? +m[3] : null, endVerse: m[4] ? +m[4] : null }, books);
}

export function formatRef(ref) {
  if (!ref) return '';
  let s = `${BOOKS[ref.book]} ${ref.chapter}`;
  if (ref.verse) s += `:${ref.verse}`;
  if (ref.endVerse) s += `-${ref.endVerse}`;
  return s;
}

const ORDINAL_WORDS = { first: '1', '1st': '1', second: '2', '2nd': '2', third: '3', '3rd': '3', i: '1', ii: '2', iii: '3' };

/**
 * Autocomplete for the search box (EasyWorship-style).
 * "jo" -> [Joshua, Job, Joel, Jonah, John, ...], "jn" -> [John], "1 co" -> [1 Corinthians]
 * Returns book indexes, best first. Empty if the text already has numbers after the book.
 */
export function suggestBooks(typed) {
  let s = typed.toLowerCase().replace(/\s+/g, ' ').replace(/^\s+/, '');
  const m = s.match(/^(first|second|third|1st|2nd|3rd|iii|ii|i)\s+(.*)$/);
  if (m && (m[2] === '' || /^[a-z]/.test(m[2]))) s = `${ORDINAL_WORDS[m[1]]} ${m[2]}`;
  s = s.replace(/^([123])(?=[a-z])/, '$1 ').trimEnd();
  if (!/^([123] )?[a-z][a-z .]*$/.test(s)) return [];
  const flat = (x) => x.replace(/[ .]/g, '');
  const out = [];
  const add = (i) => { if (!out.includes(i)) out.push(i); };
  // 1. exact abbreviation ("jn", "ps", "1 cor")
  const exact = TYPED.map.get(s);
  if (exact !== undefined) add(exact);
  // 2. full names starting with the text, in Bible order
  BOOKS.forEach((b, i) => {
    const lb = b.toLowerCase();
    if (lb.startsWith(s) || flat(lb).startsWith(flat(s))) add(i);
  });
  // 3. abbreviations starting with the text ("phili" -> Philippians)
  for (const [alias, i] of TYPED.map) if (alias.length > 2 && alias.startsWith(s)) add(i);
  return out;
}
