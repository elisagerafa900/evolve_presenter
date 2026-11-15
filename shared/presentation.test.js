// Run: node shared/presentation.test.js
import { parsePresentation, groupColor, formatDuration, fillTokens, groupNames, arrangeSlides, presentationSlides } from './presentation.js';
let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log('FAIL', n, '\n got ', JSON.stringify(g), '\n want', JSON.stringify(w)); } };
const s = parsePresentation(`[Verse 1]\nLine a\nLine b\n\nLine c\n\nChorus\nSing it\nloud\n\n\nBridge 2:\nOver\n[blank]\n[Tag]\nEnd`);
eq('slide count', s.length, 6);
eq('groups', s.map((x) => x.group), ['Verse 1', 'Verse 1', 'Chorus', 'Bridge 2', 'Blank', 'Tag']);
eq('text', s[0].text, 'Line a\nLine b');
eq('blank slide', s[4].text, '');
eq('index', s.map((x) => x.index), [0, 1, 2, 3, 4, 5]);
eq('no label', parsePresentation('Hello\nworld\n\nBye').map((x) => [x.group, x.text]), [['', 'Hello\nworld'], ['', 'Bye']]);
eq('lyric line that starts with a label word is not a label', parsePresentation('Verse by verse we sing\nChorus of angels').length, 1);
eq('empty', parsePresentation(''), []);
eq('colors', [groupColor('Verse 2'), groupColor('Chorus'), groupColor(''), groupColor('Pre-Chorus')], ['#3b82f6', '#ef4444', '#64748b', '#f59e0b']);
eq('duration', [formatDuration(245000), formatDuration(3729000), formatDuration(-5), formatDuration(900)], ['4:05', '1:02:09', '0:00', '0:01']);
eq('tokens', fillTokens('Starts in {timer}', { timerMs: 61000 }), 'Starts in 1:01');
// arrangements
{
  const sl = parsePresentation('[Verse 1]\nA\n\nB\n[Chorus]\nC\n[Verse 2]\nD\n[Bridge]\nE');
  eq('group names', groupNames(sl), ['Verse 1', 'Chorus', 'Verse 2', 'Bridge']);
  const ar = arrangeSlides(sl, ['Verse 1', 'Chorus', 'Verse 2', 'chorus', 'Bridge', 'Chorus']);
  eq('arranged order', ar.map((s) => s.text), ['A', 'B', 'C', 'D', 'C', 'E', 'C']);
  eq('arranged index', ar.map((s) => s.index), [0, 1, 2, 3, 4, 5, 6]);
  eq('arranged src', ar.map((s) => s.src), [0, 1, 2, 3, 2, 4, 2]);
  eq('empty arrangement', arrangeSlides(sl, []).map((s) => s.text), ['A', 'B', 'C', 'D', 'E']);
  eq('unknown groups fall back', arrangeSlides(sl, ['Tag']).length, 5);
  eq('presentationSlides', presentationSlides({ text: '[Chorus]\nX\n[Verse]\nY', arrangement: ['Verse', 'Chorus', 'Verse'] }).map((s) => s.text), ['Y', 'X', 'Y']);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
