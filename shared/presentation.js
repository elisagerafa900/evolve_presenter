// Turns the text of a song / presentation into slides.
//   [Verse 1]            <- a label line starts a group (also "Chorus", "Bridge:" ...)
//   Line one
//   Line two
//                        <- a blank line starts a new slide
//   Line three
const LABEL = /^(verse|chorus|refrain|pre[- ]?chorus|bridge|intro|outro|ending|tag|interlude|instrumental|vamp|hook|turnaround|blank|announcement|scripture|prayer|welcome)(\s+\d+)?\s*:?$/i;

export function parsePresentation(text) {
  const slides = [];
  let group = '';
  let cur = [];
  const push = () => {
    if (cur.length) slides.push({ group, lines: cur, text: cur.join('\n') });
    cur = [];
  };
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const bracket = /^\[(.+)\]$/.exec(line);
    if (bracket || LABEL.test(line)) {
      push();
      group = (bracket ? bracket[1] : line.replace(/:$/, '')).trim().replace(/\s+/g, ' ');
      group = group.charAt(0).toUpperCase() + group.slice(1);
      if (/^blank$/i.test(group)) { slides.push({ group: 'Blank', lines: [], text: '' }); group = ''; }
      continue;
    }
    if (!line) { push(); continue; }
    cur.push(line);
  }
  push();
  return slides.map((s, i) => ({ ...s, index: i }));
}

const COLORS = [
  [/^verse/i, '#3b82f6'], [/^(chorus|refrain|hook)/i, '#ef4444'], [/^pre/i, '#f59e0b'], [/^bridge/i, '#a855f7'],
  [/^(intro|outro|ending|interlude|instrumental|turnaround|vamp)/i, '#10b981'], [/^tag/i, '#ec4899'], [/^blank/i, '#475569'],
];
export function groupColor(group) {
  for (const [re, c] of COLORS) if (re.test(group || '')) return c;
  return '#64748b';
}

/** "4:05" / "1:02:09" from milliseconds (never negative). */
export function formatDuration(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/** Replaces {timer} and {clock} in message text. */
export function fillTokens(text, { timerMs = 0, now = Date.now() } = {}) {
  const clock = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return String(text || '').replace(/\{timer\}/gi, formatDuration(timerMs)).replace(/\{clock\}/gi, clock);
}

/** The groups of a song in the order they first appear: ["Verse 1", "Chorus", …]. */
export function groupNames(slides) {
  const seen = new Map();
  for (const s of slides) if (s.group && !seen.has(s.group.toLowerCase())) seen.set(s.group.toLowerCase(), s.group);
  return [...seen.values()];
}

/**
 * Arrangement: the order groups are sung in, e.g. ["Verse 1", "Chorus", "Verse 2", "Chorus", "Bridge"].
 * Groups can repeat. Empty arrangement = the order they are typed in.
 * Each slide keeps `src` (its index in the typed order) so edits still line up.
 */
export function arrangeSlides(slides, arrangement) {
  const base = slides.map((s, i) => ({ ...s, src: i }));
  if (!Array.isArray(arrangement) || !arrangement.length) return base;
  const byGroup = new Map();
  for (const s of base) {
    const k = (s.group || '').toLowerCase();
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(s);
  }
  const out = arrangement.flatMap((name) => byGroup.get(String(name).toLowerCase()) || []);
  if (!out.length) return base;
  return out.map((s, i) => ({ ...s, index: i }));
}

/** Slides of a presentation, in its arrangement. */
export const presentationSlides = (p) => arrangeSlides(parsePresentation(p?.text), p?.arrangement);
