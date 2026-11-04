# Khatt · خط

An Arabic-first whiteboard animation editor. You place drawings, images and text on a board, and they are drawn by hand in order, with the camera following, synced to a voice-over and exported to MP4, WebM or GIF in the browser.

This is an original implementation. It contains no VideoScribe code, artwork, image library or branding.

## Run it

```bash
npm install
cp .env.example .env        # optional: add PIXABAY_API_KEY
npm run build
npm start                   # http://127.0.0.1:8787
```

During development, run `node server/index.mjs` and `npx vite` side by side, then open http://localhost:5173.

You need Node 20 or later. For export you need Chrome or Edge, because export uses WebCodecs.

## What it does

| Area | Details |
|---|---|
| **Arabic text** | Text is shaped by HarfBuzz, so letters join correctly and ligatures and harakat are handled. Unicode bidi is applied, so Arabic, English and numbers can share a line. Letters are written in reading order, so Arabic goes right to left. Fonts are Amiri, Amiri Bold and Cairo (SIL OFL). |
| **Drawing library** | About 6,000 Tabler line icons (MIT), bundled so they work offline. You can search in Arabic: a built-in glossary maps Arabic words to English, and handles the article, suffixes and harakat. |
| **Pixabay** | Search illustrations, vectors and photos. The API key stays on the server. Searches are cached for 24 hours and requests are limited to 100 per minute, as Pixabay requires. Images you use are downloaded into `data/assets`, not hotlinked. The author and licence are stored with each element. |
| **Drawing styles** | SVG strokes are drawn by a hand that follows the pen tip. Filled shapes are outlined first and then filled. Photos are sketched as edges first and then coloured in. Each element can be set to right-to-left or left-to-right drawing. |
| **Camera** | The camera frames each element automatically, or you can save the current view as that element's camera. It moves smoothly between shots and stays within the board. |
| **Timeline** | Each element has a camera-move, draw and pause time. Drag cards to reorder them. You can play from the selected element, and undo and redo work. |
| **Audio** | Upload or record a voice-over. "Fit timing to audio" stretches the drawing times so the video ends with the voice. Audio is included in MP4 and WebM exports. |
| **Export** | MP4 (H.264), WebM (VP9) or GIF, at 1080p, 720p or 480p. Rendering happens in the browser, typically about 5× faster than real time. You can also download `.srt` subtitles generated from the text elements. |
| **Hands** | A right hand, left hand, pen only, no hand, or your own PNG with an adjustable pen-tip position. |
| **UI** | Arabic (RTL) and English, chosen from the browser language with a toggle to switch. |
| **Storage** | Projects are saved as JSON in `data/projects`, with automatic saving and a copy kept in the browser. |

## Layout

```
server/app.mjs        API: Pixabay proxy + cache, uploads, projects (no dependencies)
src/engine/           types, timeline/camera, text shaping, stroke preparation, renderer, export
src/library/          Tabler search, Arabic glossary, Pixabay client
src/ui/               editor (vanilla TypeScript), i18n
tests/                unit tests (vitest)
e2e/run.mjs           end-to-end test in real Chromium, including export checks
```

## Tests

```bash
npm test          # 21 unit tests
npm run typecheck
npm start & npm run e2e   # 14 browser checks; writes frames and videos to test-results/
```

## Known limits

- **MP4 audio** is AAC where the browser supports encoding it (Chrome or Edge on Windows and macOS). Otherwise MP4 audio falls back to Opus. Opus in MP4 plays in Chrome, Firefox and VLC, but some older Apple players and editors reject it; export WebM or re-encode in that case.
- Export has only been tested in Chromium. Safari and Firefox WebCodecs support varies.
- **Pixabay content licence:** you may use the images in your videos, including commercial ones. You may not resell or redistribute them as standalone files.
