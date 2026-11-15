# Evolve Presenter

Live presentation software for churches (working name). A separate app from Church Presenter.

## What works now (v0.4.0)
- **Library** of presentations (songs, announcements). Editor: type the words, a blank line starts a
  new slide, and `[Verse 1]`, `Chorus`, `[Blank]` lines start colour-coded groups.
- **Slide grid** — click a slide to put it on screen. `→` / `Space` next, `←` previous.
  At the end of an item it carries on into the next playlist item.
- **Playlists** — the order of service. Add from the library with ＋, reorder, rename, several playlists.
- **Layers** with their own **Clear** buttons: Media (background) → Slide → Message.
  `F1` clear all, `F2` slide, `F3` media, `F4` message.
- **Media bin** — built-in backgrounds, plus your own images and looping videos.
- **Messages** — a bar over the slide; `{timer}` and `{clock}` are filled in live.
- **Countdown timer.**
- **Audience output** and **Stage display** (current + next slide, clock, countdown, stage-only messages).
  On a second screen they open full screen; on the operator's own screen they open as a window.
- **Text style** — font, size, colour, caps, alignment, shadow.
- **Light / Auto / Dark** appearance. Everything saves automatically.
- **Import songs** (⤓ Import songs, or drop files on the window):
  - CCLI SongSelect lyrics (`.txt`, `.usr`), OpenLyrics (`.xml` from OpenLP, FreeWorship…),
    ChordPro (`.cho`, `.pro` — chords removed) and plain text. Authors, copyright and CCLI number
    go into the credits. Choose "as in the file", 2 or 4 lines per slide.
  - **Paste lyrics** — labels like `Verse 1` / `Chorus` are picked up; long pasted blocks are split.
  - **Find online** — searches CCLI SongSelect in your browser (the licensed source); download the
    lyrics file and drop it in. The app does not copy lyrics from unlicensed lyric websites.
- **Arrangements** — type each verse/chorus once, then set the order in Edit → Arrangement
  (Verse 1 → Chorus → Verse 2 → Chorus → Bridge → Chorus). Groups can repeat.
- **Own look per song** — Edit → Look: font, size, colour, alignment, caps, and a background that
  comes up by itself when the song goes live.
- **Props** — lower thirds (name + role, accent colour, optional photo) and logos (picture or text,
  any corner, any size). They stay up while slides change. `F5` hides all props.
- **NDI output** — *Full picture* and *Key / overlay* (see-through background for laying words over
  a camera in vMix / OBS). The NDI runtime is bundled from `vendor/ndi` (see `vendor/ndi/README.txt`),
  so church PCs don't need NDI Tools. Sends only when someone is watching.
- **Phone remote** — 📱 Remote → switch on → scan the QR code or open the address on a phone on the
  same Wi-Fi, type the 4-digit PIN. Next/previous, tap any slide or playlist item, clear layers.
  8 wrong PINs lock that phone out for 5 minutes. Off by default.
- **Bible** — *Bible* tab in the centre. KJV, WEB, BSB, ASV built in (public domain), plus
  **Import a Bible** (⤓) for translations your church is licensed for (Zefania / OSIS / USFX / OpenSong / JSON).
  Type `jn 3 16` — book names complete as you type (Tab / Space / Enter) — or words to search.
  Click a verse to go live; `←` `→` move verse by verse; the reference shows under the words.
  *Save to library* turns a passage into an item you can put in a playlist.
- **Transitions** — Cut, Fade, Slide up, Zoom, Blur, with a speed slider (Aa Text style).
- **Slide designer** — Edit → Design: move/resize the words box (or Full / Lower / Top / Left presets),
  add text, pictures and shapes that show on every slide of that song. Show-wide words position is in
  Aa Text style.
- **Macros** — one click does several things (background + message + countdown + props + go to an item…).
  Three ready-made: Pre-service, Start service, Black screen.
- **Controls** — MIDI pads/keyboards/foot switches (press *Learn*, then the button), and Stream Deck /
  Bitfocus Companion through web links (`/api/trigger/next?pin=…`, `/api/trigger/macro:…`).
  The links need the phone remote switched on (same server and PIN).
- **Export & backup** — *Export…* in the song editor or *Export songs* (all, as OpenLyrics .xml);
  *Back up* saves everything to one file; *Restore* adds anything missing from a backup (never overwrites).
- **Automatic updates** — the installed app checks GitHub Releases
  (`elisagerafa900/evolve-presenter-releases`), downloads in the background and installs when the
  app closes (or straight away with *Restart to update*).

## Run it
1. Install Node.js LTS (nodejs.org).
2. In this folder: `npm install`, then `npm start`
   (Windows PowerShell: `npm.cmd install`, `npm.cmd start`).
3. Installers: `npm run dist` (Windows) or `npm run dist:linux` — they appear in `release/`.

## Publishing an update
1. Raise `"version"` in `package.json` (e.g. 0.3.0 → 0.3.1).
2. PowerShell: `$env:GH_TOKEN="<your token>"` then `npm.cmd run release`.
   This builds the Setup .exe and uploads it to the GitHub release; installed copies update themselves.
   The releases repo must stay **public** so church PCs can download updates.
   Never put the token in a file or a commit.

If Electron fails to download during install, see the same fix used for Church Presenter: this app
uses the same Electron 33.4.11, so you can copy `node_modules/electron/dist` and
`node_modules/electron/path.txt` from the Church Presenter folder.

## Layout
```
electron/main.cjs     windows, outputs, saving, media files + local media server
electron/preload.cjs  bridge to the screens
src/App.jsx           operator screen
src/Render.jsx        audience + stage renderers (1920×1080, auto-fit text)
src/output.jsx        output window (?view=audience | stage)
src/defaults.js       starter content, built-in backgrounds, default props
src/ImportSongs.jsx   song import window
src/Panels.jsx        NDI, phone remote, update button
electron/ndi.cjs      NDI sender (koffi → NDI runtime)
electron/remote.cjs   phone remote web server + phone page
src/BiblePanel.jsx    Bible search, chapters, Import a Bible
src/Designer.jsx      slide designer
src/Control.jsx       macros, MIDI + Stream Deck controls
electron/bibles.cjs   imported Bibles (kept in the data folder)
public/bibles/        built-in public-domain Bibles
shared/               slides, arrangements, song import/export, Bible references (+ tests: npm test)
shared/presentation.js  words -> slides parser (npm test)
```

## Next
Ideas: live sermon transcription from Church Presenter, audio playlist, video cues with timeline, multiple screen "Looks".
