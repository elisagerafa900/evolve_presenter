// Run: node shared/songExport.test.js — export, then read back with the importer
import { toOpenLyrics, exportFileName } from './songExport.js';
import { parseSongFile, songToText } from './songImport.js';
import { presentationSlides } from './presentation.js';
let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log('FAIL', n, '\n got ', JSON.stringify(g), '\n want', JSON.stringify(w)); } };
const p = { title: 'Test & Song', credits: 'Ada Writer, Ben Composer · © 2020 Example · CCLI Song #1234', text: '[Verse 1]\nA <one>\nB\n\nC\n\n[Chorus]\nD\n\n[Verse 2]\nE', arrangement: ['Verse 1', 'Chorus', 'Verse 2', 'Chorus'] };
const xml = toOpenLyrics(p);
eq('xml escapes', xml.includes('A &lt;one&gt;') && xml.includes('Test &amp; Song'), true);
eq('order', /<verseOrder>v1 c v2 c<\/verseOrder>/.test(xml), true);
const back = parseSongFile(xml, 'x.xml');
eq('title back', back.title, 'Test & Song');
eq('credits back', back.credits, 'Ada Writer, Ben Composer · © 2020 Example · CCLI Song #1234');
eq('sections back', back.sections.map((s) => s.label), ['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
eq('slides back', back.sections[0].slides, [['A <one>', 'B'], ['C']]);
eq('same slides as original', presentationSlides({ text: songToText(back) }).map((s) => s.text), presentationSlides(p).map((s) => s.text));
eq('file name', exportFileName('Is: it / ok?'), 'Is it  ok.xml');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
