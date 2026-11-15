// Run: node shared/bibleImport.test.js
import { readFileSync } from 'node:fs';
import { parseBibleFile, resolveBook } from './bibleImport.js';
import { BOOKS } from './bibleRef.js';

const kjv = JSON.parse(readFileSync(new URL('../public/bibles/KJV.json', import.meta.url)));
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log(`FAIL ${name}\n   got:  ${JSON.stringify(got)?.slice(0, 200)}\n   want: ${JSON.stringify(want)?.slice(0, 200)}`); }
};
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const same = (name, r) => {
  let diff = 0, first = null;
  kjv.books.forEach((b, bi) => b.chapters.forEach((ch, ci) => ch.forEach((t, vi) => {
    const got = r.books[bi]?.chapters[ci]?.[vi];
    if (got !== t) { diff++; if (!first) first = `${BOOKS[bi]} ${ci + 1}:${vi + 1} got ${JSON.stringify(got)}`; }
  })));
  eq(`${name}: every verse matches`, diff ? first : 0, 0);
  eq(`${name}: 66 books`, r.stats.books, 66);
};

// book names / codes / numbers
eq('resolve numbers', [resolveBook(1), resolveBook('66'), resolveBook(67)], [0, 65, -1]);
eq('resolve codes', [resolveBook('GEN'), resolveBook('1CO'), resolveBook('JHN'), resolveBook('PHM')], [0, 45, 42, 56]);
eq('resolve osis', [resolveBook('Ps'), resolveBook('1Thess'), resolveBook('Phil')], [18, 51, 49]);
eq('resolve names', [resolveBook('I Samuel'), resolveBook('Revelation of John'), resolveBook('Song of Songs'), resolveBook('1 Corinthians'), resolveBook('Psalm')], [8, 65, 21, 45, 18]);

// Our JSON round trip
same('our JSON', parseBibleFile(JSON.stringify(kjv), 'x.json'));

// scrollmapper JSON
const sm = { translation: 'KJV', books: kjv.books.map((b, bi) => ({ name: BOOKS[bi], chapters: b.chapters.map((ch, ci) => ({ chapter: ci + 1, verses: ch.map((t, vi) => ({ verse: vi + 1, text: t })) })) })) };
same('scrollmapper JSON', parseBibleFile(JSON.stringify(sm), 'x.json'));

// Zefania XML (with notes that must be dropped)
let z = '<?xml version="1.0"?><XMLBIBLE biblename="Test">';
kjv.books.forEach((b, bi) => {
  z += `<BIBLEBOOK bnumber="${bi + 1}" bname="${BOOKS[bi]}">`;
  b.chapters.forEach((ch, ci) => { z += `<CHAPTER cnumber="${ci + 1}">`; ch.forEach((t, vi) => { z += `<VERS vnumber="${vi + 1}">${esc(t)}${vi === 0 ? '<NOTE>a note</NOTE>' : ''}</VERS>`; }); z += '</CHAPTER>'; });
  z += '</BIBLEBOOK>';
});
same('Zefania XML', parseBibleFile(`${z}</XMLBIBLE>`, 'x.xml'));

// USFX (with footnotes + headings)
const CODES = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'];
let u = '<usfx>';
kjv.books.forEach((b, bi) => {
  u += `<book id="${CODES[bi]}"><h>${BOOKS[bi]}</h>`;
  b.chapters.forEach((ch, ci) => { u += `<c id="${ci + 1}"/><s>Heading</s><p>`; ch.forEach((t, vi) => { u += `<v id="${vi + 1}"/>${esc(t)}<f caller="+">footnote</f><ve/>`; }); u += '</p>'; });
  u += '</book>';
});
same('USFX XML', parseBibleFile(`${u}</usfx>`, 'x.xml'));

// OSIS (container verses)
const OS = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'];
let o = '<osis><osisText>';
kjv.books.forEach((b, bi) => b.chapters.forEach((ch, ci) => ch.forEach((t, vi) => { o += `<verse osisID="${OS[bi]}.${ci + 1}.${vi + 1}">${esc(t)}<note>n</note></verse>`; })));
same('OSIS XML', parseBibleFile(`${o}</osisText></osis>`, 'x.xml'));

// CSV with header + quotes, and TSV "John 3:16<TAB>text"
let csv = 'Book,Chapter,Verse,Text\n';
let tsv = '';
kjv.books.forEach((b, bi) => b.chapters.forEach((ch, ci) => ch.forEach((t, vi) => {
  csv += `${BOOKS[bi]},${ci + 1},${vi + 1},"${t.replace(/"/g, '""')}"\n`;
  tsv += `${BOOKS[bi]} ${ci + 1}:${vi + 1}\t${t}\n`;
})));
same('CSV', parseBibleFile(csv, 'x.csv'));
same('TSV ref+text', parseBibleFile(tsv, 'x.txt'));

// bad files
let err = '';
try { parseBibleFile('hello world', 'x.txt'); } catch (e) { err = e.message; }
eq('rejects non-Bible', /verses were found/.test(err), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
