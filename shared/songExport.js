// Song -> OpenLyrics 0.9 XML (opens in OpenLP, FreeWorship, Evolve and others).
import { parsePresentation } from './presentation.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CODES = [[/^verse/i, 'v'], [/^(chorus|refrain|hook)/i, 'c'], [/^pre/i, 'p'], [/^bridge/i, 'b'], [/^intro/i, 'i'], [/^outro/i, 'o'], [/^ending/i, 'e'], [/^tag/i, 't']];

function codeFor(group, used) {
  const num = (/(\d+)\s*$/.exec(group || '') || [])[1] || '';
  let base = 'm';
  for (const [re, c] of CODES) if (re.test(group || '')) { base = c; break; }
  let name = `${base}${num || (base === 'v' ? '1' : '')}`;
  // two different groups that would get the same code (e.g. "Chorus" and "Chorus (alt)")
  let n = 2;
  while (used.has(name) && used.get(name) !== (group || '').toLowerCase()) name = `${base}${num || ''}${'abcdefghij'[n++ - 2]}`;
  used.set(name, (group || '').toLowerCase());
  return name;
}

export function toOpenLyrics(p, { app = 'Evolve Presenter', version = '' } = {}) {
  const slides = parsePresentation(p.text).filter((s) => s.lines.length);
  const used = new Map();
  const groups = [];
  for (const s of slides) {
    const key = (s.group || '').toLowerCase();
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, name: codeFor(s.group, used), slides: [] }; groups.push(g); }
    g.slides.push(s.lines);
  }
  const nameOf = new Map(groups.map((g) => [g.key, g.name]));
  const order = (p.arrangement?.length ? p.arrangement : groups.map((g) => g.key)).map((x) => nameOf.get(String(x).toLowerCase())).filter(Boolean);
  const [authorsPart = '', ...rest] = String(p.credits || '').split(' · ');
  const copyright = rest.find((x) => x.startsWith('©'))?.replace(/^©\s*/, '') || '';
  const authors = authorsPart && !authorsPart.startsWith('©') && !/^CCLI/i.test(authorsPart) ? authorsPart.split(/,\s*/) : [];
  const ccli = p.ccli || (/CCLI Song #\s*(\d+)/.exec(p.credits || '') || [])[1] || '';
  const now = new Date().toISOString().replace(/\.\d+Z$/, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9" createdIn="${esc(app)}${version ? ` ${esc(version)}` : ''}" modifiedDate="${now}">
  <properties>
    <titles><title>${esc(p.title)}</title></titles>${authors.length ? `
    <authors>${authors.map((a) => `<author>${esc(a)}</author>`).join('')}</authors>` : ''}${copyright ? `
    <copyright>${esc(copyright)}</copyright>` : ''}${ccli ? `
    <ccliNo>${esc(ccli)}</ccliNo>` : ''}${order.length ? `
    <verseOrder>${order.join(' ')}</verseOrder>` : ''}
  </properties>
  <lyrics>
${groups.map((g) => `    <verse name="${g.name}">
${g.slides.map((ls) => `      <lines>${ls.map(esc).join('<br/>')}</lines>`).join('\n')}
    </verse>`).join('\n')}
  </lyrics>
</song>
`;
}

export const exportFileName = (title) => `${String(title || 'song').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'song'}.xml`;
