NDI runtime for Evolve Presenter
================================

Put this ONE file in this folder:

    Processing.NDI.Lib.x64.dll

Where to get it (one time, on the computer you build the app on):
  1. Go to ndi.video -> For Developers -> download the free "NDI SDK" for Windows
     (you fill a short form, then download and install it).
  2. Copy  C:\Program Files\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll
     into this folder.

That's it. `npm start` will find it here, and `npm run dist` packs it into the
installer, so church PCs do NOT need NDI Tools installed - same as EasyWorship.

The NDI SDK licence allows shipping this DLL inside your app. Its conditions:
  - Show "NDI® is a registered trademark of Vizrt NDI AB" with a link to https://ndi.video
    (the app shows this in its NDI window).
  - Ship the DLL unchanged.
  - Read the licence included with the SDK for the full terms.


Linux
=====
Put this file in this folder instead:

    libndi.so.6

Where to get it: ndi.video -> For Developers -> "NDI SDK for Linux". Run the downloaded
installer script, then copy  lib/x86_64-linux-gnu/libndi.so.6.*  into this folder and
name it  libndi.so.6 .  `npm run dist:linux` then packs it into the AppImage / .deb.
Without it, the app also looks for an NDI runtime already installed on the system
(/usr/lib, /usr/local/lib). The browser-source output works with no NDI at all.
