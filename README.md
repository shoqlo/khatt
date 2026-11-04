# Khatt · خط

An Arabic-first whiteboard animation app. Drawings, photos and Arabic text are drawn by hand on screen, with a camera that follows, timed to your voice-over, and exported as MP4, WebM or GIF. It runs in any modern browser and installs on phones like an app. It needs no server, no accounts and no API keys.

This is an original implementation. It contains no VideoScribe code, artwork, image library or branding.

**To put it online or on customers' phones, see [DEPLOY.md](DEPLOY.md).**

## Features

| | |
|---|---|
| **Arabic writing** | HarfBuzz shaping (letters join, ligatures and harakat handled), mixed Arabic, English and numbers in one line, and the hand writes right to left. Fonts: Amiri and Cairo (SIL OFL). |
| **Drawing library** | 12,963 drawings bundled with the app in 20 categories, in hand-drawn, line and colour styles. Search in Arabic or English: Arabic uses the official Unicode Arabic names plus a hand-checked glossary. The library works offline. |
| **Open images** | Wikimedia Commons and Openverse are searched directly from the device with no key. Only images free for commercial use are shown (CC0, public domain, CC BY), credits are collected automatically, and SVG files become drawable line art. |
| **Your own media** | Photos from the gallery or camera, SVG files, a microphone voice-over, or an audio file. |
| **Phones** | Bottom bar and slide-up panels, pinch to zoom the board, pinch to resize a drawing, double-tap to see the whole board, and Earlier/Later buttons instead of drag-and-drop. |
| **Animation** | Draw, fade, move-in or appear. A camera frames each element automatically, or you can save a custom view. Per-element timing, and "fit timing to the sound". |
| **Export** | Made in the browser. It runs faster than real time where WebCodecs is available (Chrome, Android, iOS 26+). Otherwise it records in real time, so older iPhones still get sound. Also GIF and SRT subtitles. Results open in the phone's share menu (WhatsApp, gallery and so on), where the phone supports it. |
| **Storage** | Everything is saved on the device (IndexedDB) automatically, including the moment the app is hidden. A project file (`.khatt`) can be used for backup or to move work to another device. |
| **Offline and install** | A service worker caches the app, fonts and the drawings you've viewed. The manifest is Arabic/RTL and the icons are maskable. |
| **Interface** | Arabic (RTL) and English. |

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 27 unit tests
npm run typecheck
npm run build && npm run preview &   # production build on http://127.0.0.1:4173
npm run e2e          # 38 browser checks (phone + desktop); screenshots and videos in test-results/
```

You need Node 20 or later.

## Layout

```
src/engine/      data model, timeline/camera, Arabic text layout, stroke preparation, renderer, export
src/library/     bundled-library search, Arabic glossary, Openverse/Wikimedia search, credits
src/storage/     on-device storage (IndexedDB), project files
src/ui/          phone-first editor (vanilla TypeScript), Arabic/English text
src/sw.js        offline service worker (filled in at build time)
scripts/         library builder, emoji/Arabic data generator, icon generator
e2e/run.mjs      end-to-end checks
```

## Known limits

- Live Openverse and Wikimedia searches are tested only against sample responses, not the real sites.
- iPhone is tested only through emulation in Chromium. Safari itself has not been tested.
- Credits for CC BY material have to be pasted into the video description. They are not burned into the video.
- Without AAC encoding (Chromium builds without proprietary codecs), MP4 audio is Opus. It plays in Chrome, Firefox and VLC; some older Apple players and apps may reject it, and WebM has the same limitation.
