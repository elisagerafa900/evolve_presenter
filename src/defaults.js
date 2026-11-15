import { DEFAULT_THEME } from './Render.jsx';
import { defaultMacros } from './Control.jsx';

export const uid = () => Math.random().toString(36).slice(2, 10);

// Built-in backgrounds, so the media bin is useful before any file is added.
export const BUILTIN_MEDIA = [
  { id: 'bg-night', kind: 'color', name: 'Night', css: 'radial-gradient(ellipse at 30% 20%, #1e3a8a 0%, #0b1022 55%, #030611 100%)' },
  { id: 'bg-dawn', kind: 'color', name: 'Dawn', css: 'linear-gradient(160deg, #7c2d12 0%, #be123c 45%, #1e1b4b 100%)' },
  { id: 'bg-forest', kind: 'color', name: 'Forest', css: 'linear-gradient(160deg, #064e3b 0%, #022c22 60%, #010f0c 100%)' },
  { id: 'bg-royal', kind: 'color', name: 'Royal', css: 'radial-gradient(ellipse at 70% 10%, #6d28d9 0%, #2e1065 50%, #0c0420 100%)' },
  { id: 'bg-steel', kind: 'color', name: 'Steel', css: 'linear-gradient(180deg, #334155 0%, #0f172a 100%)' },
];

const AMAZING_GRACE = `[Verse 1]
Amazing grace! How sweet the sound
That saved a wretch like me!

I once was lost, but now am found;
Was blind, but now I see.

[Verse 2]
'Twas grace that taught my heart to fear,
And grace my fears relieved;

How precious did that grace appear
The hour I first believed.

[Verse 3]
Through many dangers, toils and snares,
I have already come;

'Tis grace hath brought me safe thus far,
And grace will lead me home.`;

const WELCOME = `[Welcome]
Welcome!
We're glad you're here

[Announcement]
Please silence your phones

[Blank]`;

export function defaultShow() {
  const a = { id: uid(), title: 'Amazing Grace', credits: 'John Newton, 1779 · Public domain', text: AMAZING_GRACE };
  const w = { id: uid(), title: 'Welcome', credits: '', text: WELCOME };
  return {
    presentations: [w, a],
    playlists: [{ id: uid(), name: 'Sunday Service', items: [{ id: uid(), presId: w.id }, { id: uid(), presId: a.id }] }],
    currentPlaylist: null,
    media: [],
    messages: [
      { id: uid(), text: 'Service starts in {timer}' },
      { id: uid(), text: 'Please silence your phones' },
    ],
    theme: { ...DEFAULT_THEME },
    props: defaultProps(),
    macros: defaultMacros(),
    midi: {},
    bibleT: 'KJV',
    timer: { label: 'Countdown', minutes: 5 },
  };
}

// Props: logos and lower thirds that can be shown over anything.
export function defaultProps() {
  return [
    { id: uid(), kind: 'lower', name: 'Speaker', title: 'Speaker name', subtitle: 'Title or role', color: '#6d6af0', position: 'bl', mediaId: '' },
    { id: uid(), kind: 'logo', name: 'Logo', title: 'LOGO', position: 'tr', size: 140, mediaId: '' },
  ];
}
