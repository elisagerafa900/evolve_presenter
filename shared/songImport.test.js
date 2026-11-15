// Run: node shared/songImport.test.js
// Sample songs are made up (no real copyrighted lyrics), in each file format.
import { parseSongFile, songToText, slideCount, decodeBytes, chunk } from './songImport.js';
import { parsePresentation } from './presentation.js';

let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log('FAIL', n, '\n got ', JSON.stringify(g), '\n want', JSON.stringify(w)); } };

// --- SongSelect lyrics .txt ---
const ss = `Morning Light Test Song

Verse 1
Line one of the verse
Line two of the verse
Line three of the verse
Line four of the verse

Chorus
Sing chorus line A
Sing chorus line B

VERSE 2
Second verse line one
Second verse line two

CCLI Song # 1234567
Ada Writer | Ben Composer
© 2019 Example Music Publishing
For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com
CCLI License # 99999
`;
const a = parseSongFile(ss, 'Morning Light.txt');
eq('ss format', a.format, 'SongSelect');
eq('ss title', a.title, 'Morning Light Test Song');
eq('ss labels', a.sections.map((s) => s.label), ['Verse 1', 'Chorus', 'Verse 2']);
eq('ss credits', a.credits, 'Ada Writer, Ben Composer · © 2019 Example Music Publishing · CCLI Song #1234567');
eq('ss ccli', a.ccli, '1234567');
eq('ss whole sections', slideCount(a, 0), 3);
eq('ss 2 lines per slide', slideCount(a, 2), 4);
const t2 = songToText(a, 2);
eq('ss text parses back', parsePresentation(t2).map((s) => s.group), ['Verse 1', 'Verse 1', 'Chorus', 'Verse 2']);
eq('ss footer not in lyrics', /Terms of Use|License/.test(t2), false);

// --- SongSelect .usr ---
const usr = `[File]
Type=SongSelect Import File
Version=3.0
[S A7654321]
Title=River Test Song
Author=Ada Writer | Ben Composer
Copyright=2020 Example Songs | Another Publisher
Admin=Example Admin
Fields=Verse 1/tChorus/tBridge
Words=Verse line one/nVerse line two/tChorus line one/nChorus line two/nChorus line three/tBridge line/n
Keys=G`;
const b = parseSongFile(usr, 'river.usr');
eq('usr format', b.format, 'SongSelect (.usr)');
eq('usr title', b.title, 'River Test Song');
eq('usr labels', b.sections.map((s) => s.label), ['Verse 1', 'Chorus', 'Bridge']);
eq('usr chorus lines', b.sections[1].slides[0], ['Chorus line one', 'Chorus line two', 'Chorus line three']);
eq('usr credits', b.credits, 'Ada Writer, Ben Composer · © 2020 Example Songs, Another Publisher · CCLI Song #7654321');

// --- OpenLyrics with verseOrder, chords, comments, 2 slides in a verse ---
const ol = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
  <properties>
    <titles><title>Open Test Song</title></titles>
    <authors><author>Ada Writer</author><author type="music">Ben Composer</author></authors>
    <copyright>2021 Example &amp; Co</copyright>
    <ccliNo>5550001</ccliNo>
    <verseOrder>v1 c v2 c</verseOrder>
  </properties>
  <lyrics>
    <verse name="v1">
      <lines><chord name="G"/>First line here<br/>Second <comment>softly</comment>line</lines>
      <lines>Third line<br/>Fourth line</lines>
    </verse>
    <verse name="c"><lines>Chorus one<br/>Chorus two</lines></verse>
    <verse name="v2"><lines>Verse two line</lines></verse>
  </lyrics>
</song>`;
const c = parseSongFile(ol, 'open.xml');
eq('ol format', c.format, 'OpenLyrics');
eq('ol title', c.title, 'Open Test Song');
eq('ol order with repeat', c.sections.map((s) => s.label), ['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
eq('ol slides kept', c.sections[0].slides, [['First line here', 'Second line'], ['Third line', 'Fourth line']]);
eq('ol credits', c.credits, 'Ada Writer, Ben Composer · © 2021 Example & Co · CCLI Song #5550001');
// OpenLyrics 0.7 <line> elements
const ol7 = '<song><properties><titles><title>Old</title></titles></properties><lyrics><verse name="c1"><lines><line>One</line><line>Two</line></lines></verse></lyrics></song>';
eq('ol 0.7 lines', parseSongFile(ol7, 'x.xml').sections[0], { label: 'Chorus 1', slides: [['One', 'Two']] });

// --- ChordPro ---
const cp = `{title: Chord Test Song}
{artist: Ada Writer}
{copyright: 2022 Example}
# a comment
{comment: Verse 1}
[G]First [D]line of [Em]words
Second line

{start_of_chorus}
[C]Chorus line
{end_of_chorus}

Unlabelled line`;
const d = parseSongFile(cp, 'song.cho');
eq('cp format', d.format, 'ChordPro');
eq('cp title', d.title, 'Chord Test Song');
eq('cp chords removed', d.sections[0].slides[0], ['First line of words', 'Second line']);
eq('cp labels', d.sections.map((s) => s.label), ['Verse 1', 'Chorus', '']);
eq('cp credits', d.credits, 'Ada Writer · © 2022 Example');

// --- plain text, our own format ---
const e = parseSongFile('[Verse 1]\nA\nB\n\nC\n\nChorus\nD', 'My Song.txt');
eq('plain title from file name', e.title, 'My Song');
eq('plain structure', e.sections, [{ label: 'Verse 1', slides: [['A', 'B'], ['C']] }, { label: 'Chorus', slides: [['D']] }]);

// --- helpers ---
eq('chunk', chunk(['1', '2', '3', '4', '5'], 2), [['1', '2'], ['3', '4'], ['5']]);
eq('utf16 file', decodeBytes(new Uint8Array([0xff, 0xfe, 0x48, 0, 0x69, 0])), 'Hi');
eq('windows-1252 file', decodeBytes(new Uint8Array([0x93, 0x48, 0x94])), '“H”');
let err = ''; try { parseSongFile('<html><body>no</body></html>', 'page.xml'); } catch (x) { err = x.message; }
eq('rejects non-song xml', err, 'This XML file is not an OpenLyrics song.');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
