// Run: node shared/bibleRef.test.js
import { readFileSync } from 'node:fs';
import { findReferences, parseQuery, formatRef, wordsToDigits, suggestBooks, BOOKS } from './bibleRef.js';

const kjv = JSON.parse(readFileSync(new URL('../public/bibles/KJV.json', import.meta.url)));
const books = kjv.books;
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (got === want) pass++;
  else { fail++; console.log(`FAIL ${name}\n   got:  ${got}\n   want: ${want}`); }
};

// Typed queries
const typed = {
  'john 3:16': 'John 3:16',
  'jn 3 16': 'John 3:16',
  'Jn3:16': 'John 3:16',
  'gen 1': 'Genesis 1',
  '1 cor 13:4-7': '1 Corinthians 13:4-7',
  '1cor 13 4-7': '1 Corinthians 13:4-7',
  'ps 23': 'Psalms 23',
  'psalm 119:105': 'Psalms 119:105',
  'phil 4:13': 'Philippians 4:13',
  'phili 4 13': 'Philippians 4:13',
  'rev 21:4': 'Revelation 21:4',
  '2 tim 3:16': '2 Timothy 3:16',
  'song of solomon 2:4': 'Song of Solomon 2:4',
  'jude 3': 'Jude 1:3',
  'heb 11 1': 'Hebrews 11:1',
  'rom 8:28': 'Romans 8:28',
  'isa 53': 'Isaiah 53',
  'matt 28:19-20': 'Matthew 28:19-20',
  '1 thes 5': '1 Thessalonians 5',
  'exodus 14 v 14': 'Exodus 14:14',
};
for (const [q, want] of Object.entries(typed)) eq(`typed "${q}"`, formatRef(parseQuery(q, books)), want);
eq('invalid chapter', parseQuery('john 30:1', books), null);

// Spoken (transcript) text
const spoken = [
  ['Turn with me to John chapter three verse sixteen', ['John 3:16']],
  ['the bible says in John three sixteen for God so loved', ['John 3:16']],
  ['Psalm twenty three', ['Psalms 23']],
  ['Psalm one hundred and nineteen verse one hundred and five', ['Psalms 119:105']],
  ['open your bibles to Romans 8:28 and also Philippians 4 verse 13', ['Romans 8:28', 'Philippians 4:13']],
  ['first Corinthians chapter thirteen verses four to seven', ['1 Corinthians 13:4-7']],
  ['second Timothy three sixteen', ['2 Timothy 3:16']],
  ['Hebrews chapter eleven', ['Hebrews 11']],
  ['Isaiah fifty-three verse five', ['Isaiah 53:5']],
  ['Matthew twenty eight verse nineteen through twenty', ['Matthew 28:19-20']],
  ['Genesis chapter one and verse one', ['Genesis 1:1']],
  ['I want to tell you something today', []],
  ['and Mark my words, God is good', []],
  ['the Acts of the Apostles chapter two verse four', ['Acts 2:4']],
];
for (const [t, want] of spoken) {
  const got = findReferences(t, { spoken: true, books }).map(formatRef).join(' | ');
  eq(`spoken "${t}"`, got, want.join(' | '));
}
// Context: "verse seventeen" while reading John 3
eq('context verse', findReferences('and verse seventeen says', { spoken: true, books, context: { book: 42, chapter: 3 } }).map(formatRef).join(), 'John 3:17');

eq('words', wordsToDigits('john three sixteen'), 'john 3 16');
eq('words2', wordsToDigits('one hundred and nineteen'), '119');
eq('words3', wordsToDigits('twenty three'), '23');

// Autocomplete
const sug = { jo: 'Joshua', joh: 'John', jn: 'John', ps: 'Psalms', '1 co': '1 Corinthians', '1co': '1 Corinthians', 'first cor': '1 Corinthians', rev: 'Revelation', phili: 'Philippians', philem: 'Philemon', song: 'Song of Solomon', mat: 'Matthew', '2 ti': '2 Timothy', ex: 'Exodus', ge: 'Genesis', '3 j': '3 John' };
for (const [t, want] of Object.entries(sug)) eq(`suggest "${t}"`, BOOKS[suggestBooks(t)[0]], want);
eq('suggest none for numbers', suggestBooks('john 3').length, 0);
eq('suggest none for words', suggestBooks('xyz').length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
