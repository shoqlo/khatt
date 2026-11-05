# Khatt · خط

An Arabic-first whiteboard animation app. Drawings, photos and Arabic text are drawn by hand on screen, with a camera that follows, timed to your voice-over, and exported as MP4, WebM or GIF. It runs in any modern browser and installs on phones like an app. It needs no server, no accounts and no API keys.

This is an original implementation. It contains no VideoScribe code, artwork, image library or branding.

**To put it online or on customers' phones, see [DEPLOY.md](DEPLOY.md).**

Optional picture middleman (Pixabay, Unsplash, Pexels; keeps your API keys private):
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shoqlo/khatt/tree/main/cloudflare)

## Features

| | |
|---|---|
| **Video from a script** | Paste a script or start from one of six ready-made scripts (lesson, service explainer, children's story, restaurant offer, money tips, about us), then choose the type, the shape, the drawing style, the board look and the music. The app makes an editable draft in seconds: one scene per paragraph, key words written on the board, matching drawings, and timing set from reading speed. It plays the draft automatically. Pictures are matched by key words, not by understanding the meaning; every part of the draft can be changed. |
| **Scenes and a voice per scene** | Each scene has its own narration text and its own voice: record it or upload a voice note. The recorder shows the scene's text in large type while you speak, with a 3-2-1 countdown and a level meter, and can go through the scenes one by one. A scene stretches to its voice, and all voices are mixed into the exported video at the right moments. |
| **Video shapes** | Landscape 16:9 (YouTube), vertical 9:16 (WhatsApp Status, TikTok, Reels) or square 1:1 (Instagram). |
| **Replace drawing** | Swap any drawing or photo for another one. The new one keeps the old one's place, size, timing and scene. |
| **Arabic writing** | HarfBuzz shaping (letters join, ligatures and harakat handled), mixed Arabic, English and numbers in one line, and the hand writes right to left. Seven fonts (SIL OFL): Amiri and Amiri Bold (naskh), Aref Ruqaa (handwriting), Reem Kufi (kufi), Cairo, Tajawal and Lalezar (titles). |
| **Board looks** | Whiteboard (any colour), blackboard and green chalkboard with chalk-white ink and a chalk stick in the hand, glass board, lined notepad, sketchbook paper and grid paper. Line drawings and default-coloured text follow the board's ink. The drawing hand has four skin tones. |
| **Charts** | Bar, line and pie charts drawn by the hand, with Arabic or English labels written in real Arabic letters, Arabic digits (١٢٣) if wanted, units (%, ريال…) and right-to-left layout. Type the numbers in the Edit panel; the chart redraws as you type. Colours are a colour-blind-checked order stepped for light and dark boards, and every colour also has an outline and a written label. |
| **Background music** | Five original tracks made on the device: calm, bright, story, focus and oriental (maqam Hijaz with a maqsum hand-drum rhythm). They are synthesised in the browser, with no samples, so there is nothing to license or credit. They last exactly as long as the video, fade in and out, and get quieter automatically whenever a scene's voice speaks. |
| **Drawing library** | 12,963 drawings bundled with the app in 20 categories, in hand-drawn, line and colour styles. Search in Arabic or English: Arabic uses the official Unicode Arabic names plus a hand-checked glossary. The library works offline. |
| **Open images** | Wikimedia Commons and Openverse are searched directly from the device with no key. Pixabay, Unsplash and Pexels can be added through one free middleman that keeps your keys private (see DEPLOY.md). Only images free for commercial use are shown (CC0, public domain, CC BY), credits are collected automatically, and SVG files become drawable line art. |
| **Your own media** | Photos from the gallery or camera, SVG files, a microphone voice-over, or an audio file. |
| **Phones** | Bottom bar and slide-up panels, pinch to zoom the board, pinch to resize a drawing, double-tap to see the whole board, and Earlier/Later buttons instead of drag-and-drop. |
| **Animation** | Draw, fade, move-in, appear, or morph (the previous picture turns into this one). After drawing: pulse, wiggle or bounce. When the scene ends: fade out or move out. Mirror and flip. A camera frames each element automatically, or you can save a custom view. Per-element timing, and "fit timing to the sound". |
| **Export** | Made in the browser. It runs faster than real time where WebCodecs is available (Chrome, Android, iOS 26+). Otherwise it records in real time, so older iPhones still get sound. Also GIF and SRT subtitles. Results open in the phone's share menu (WhatsApp, gallery and so on), where the phone supports it. |
| **Storage** | Everything is saved on the device (IndexedDB) automatically, including the moment the app is hidden. A project file (`.khatt`) can be used for backup or to move work to another device. |
| **Offline and install** | A service worker caches the app, fonts and the drawings you've viewed. The manifest is Arabic/RTL and the icons are maskable. |
| **Interface** | Arabic (RTL) and English. |

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 87 unit tests
npm run typecheck
npm run build && npm run preview &   # production build on http://127.0.0.1:4173
npm run e2e          # 80 browser checks (phone + desktop); screenshots and videos in test-results/
```

You need Node 20 or later.

## Layout

```
src/engine/      data model, scenes, timeline/camera, Arabic text layout, stroke preparation, renderer, board looks,
                 charts, generated music, audio mixer (fades, voice ducking), export
src/generator/   script -> draft video (scene split, key words, layout, timing), ready-made scripts
src/library/     bundled-library search, Arabic glossary, Openverse/Wikimedia search, credits
src/storage/     on-device storage (IndexedDB), project files
src/ui/          phone-first editor (vanilla TypeScript), Arabic/English text
src/sw.js        offline service worker (filled in at build time)
scripts/         library builder, emoji/Arabic data generator, icon generator
cloudflare/      optional middleman for Pixabay, Unsplash and Pexels (keeps API keys off the public site)
public/config.json  site settings (the middleman link)
e2e/run.mjs      end-to-end checks
```

## Known limits

- The draft maker picks pictures by key words (Arabic via the glossary and Unicode emoji names). It doesn't understand meaning; abstract sentences get text instead of a picture.
- Live Openverse and Wikimedia searches are tested only against sample responses, not the real sites.
- iPhone is tested only through emulation in Chromium. Safari itself has not been tested.
- The generated music is checked by measurement (length, levels, seamless loop, fades, voice ducking), not by ear. It renders in about 1–2 s per style on a laptop; on a slow phone expect several seconds the first time a style is used.
- Morph cross-fades and reshapes one picture into the next. It does not trace one outline into the other.
- Credits for CC BY material have to be pasted into the video description. They are not burned into the video.
- Without AAC encoding (Chromium builds without proprietary codecs), MP4 audio is Opus. It plays in Chrome, Firefox and VLC; some older Apple players and apps may reject it, and WebM has the same limitation.
