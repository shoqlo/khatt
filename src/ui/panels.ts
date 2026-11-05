// The "Add" panel: bundled drawings, open-image search, text, own photos, sound.
import { state, ui, commit, softCommit, afterLoad, addSvg, addImageBlob, addImageUrl, addText } from './app';
import { startRecording, blobDuration, unlockAudio, type Recording } from './sound';
import { openSceneRecorder } from './recorder';
import { h, field, num, range, select, add } from './dom';
import { t, getLang, type Key } from './i18n';
import { toast } from './toast';
import { FONTS } from '../engine/fonts';
import type { FontId } from '../engine/types';
import { fitToDuration } from '../engine/timeline';
import { putAsset } from '../storage/db';
import { loadLibrary, searchLibrary, drawingSvg, itemLabel, type LibItem, type LibStyle } from '../library/builtin';
import { searchOpenverse, searchCommons, searchPixabay, searchUnsplash, searchPexels, downloadHit, OnlineError, type OnlineHit, type Provider } from '../library/online';
import { appConfig } from '../config';

const onlineMessage = (err: unknown) => err instanceof OnlineError
  ? t(({ blocked: 'errBlocked', offline: 'errOffline', rate: 'errRate', server: 'errServer' } as const)[err.kind])
  : `${t('error')}: ${(err as Error).message}`;

export function renderTabs() {
  const tabs: [typeof state.tab, Key][] = [['icons', 'icons'], ['online', 'online'], ['text', 'text'], ['upload', 'upload'], ['audio', 'audio']];
  document.getElementById('tabs')!.replaceChildren(...tabs.map(([id, k]) => h('button', {
    class: state.tab === id ? 'tab active' : 'tab', 'aria-pressed': String(state.tab === id),
    onclick: () => { state.tab = id; renderTabs(); },
  }, t(k))));
  const body = document.getElementById('library')!;
  body.replaceChildren();
  if (state.replaceTarget) {
    body.append(h('div', { class: 'callout replace-banner' }, `⇄ ${t('replacing')} `,
      h('button', { onclick: () => { state.replaceTarget = null; document.body.classList.remove('replacing'); renderTabs(); } }, t('cancel'))));
  }
  if (state.tab === 'icons') drawingsTab(body);
  if (state.tab === 'online') onlineTab(body);
  if (state.tab === 'text') textTab(body);
  if (state.tab === 'upload') uploadTab(body);
  if (state.tab === 'audio') audioTab(body);
}

// Thumbnails load their drawing chunk only when scrolled into view.
const io = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io!.unobserve(e.target);
        (e.target as HTMLElement & { load?: () => void }).load?.();
      }
    }, { rootMargin: '200px' })
  : null;

function svgThumb(svg: string) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.replace('<svg ', '<svg color="#222" '));
}

// ---------------- built-in drawings ----------------
const lib = { query: '', cat: null as number | null, style: null as LibStyle | null, shown: 60 };

function drawingsTab(body: HTMLElement) {
  const grid = h('div', { class: 'grid', role: 'list' });
  const note = h('div', { class: 'note' });
  const more = h('button', { class: 'more', hidden: true, onclick: () => { lib.shown += 60; run(); } }, t('more'));
  const chips = h('div', { class: 'chips', role: 'toolbar' });
  const styles = h('div', { class: 'chips' });
  let runId = 0;

  const run = async () => {
    const my = ++runId;
    let r;
    try {
      r = await searchLibrary(lib.query, { cat: lib.cat, style: lib.style, limit: lib.shown });
    } catch (e) { note.textContent = (e as Error).message; return; }
    if (my !== runId) return;
    const lang = getLang();
    const parts = [`${r.total} ${t('results')}`];
    if (r.translated !== undefined && r.translated) parts.push(`${t('searchedAs')}: ${r.translated}`);
    if (r.unknown.length) parts.push(`${t('unknownWords')}: ${r.unknown.join('، ')}`);
    note.textContent = parts.join(' · ');
    const libIdx = await loadLibrary();
    grid.replaceChildren(...(r.items.length ? r.items.map((item: LibItem) => {
      const label = itemLabel(item, lang);
      const img = h('img', { alt: label, loading: 'lazy' }) as HTMLImageElement;
      const b = h('button', {
        class: 'thumb', title: label, role: 'listitem',
        onclick: async () => {
          try {
            const set = libIdx.sets[item.set];
            await addSvg(label, await drawingSvg(item), { provider: 'library', id: `${set.id}:${item.name}`, set: set.id, author: set.author, license: set.license }, set.style);
          } catch (e) { toast((e as Error).message, 'error'); }
        },
      }, img) as HTMLButtonElement & { load?: () => void };
      b.load = () => { drawingSvg(item).then((svg) => { img.src = svgThumb(svg); }).catch(() => b.classList.add('broken')); };
      if (io) io.observe(b); else b.load();
      return b;
    }) : [h('div', { class: 'note' }, t('noResults'))]));
    more.hidden = r.items.length >= r.total;
  };

  loadLibrary().then((l) => {
    const lang = getLang();
    const chip = (label: string, active: boolean, on: () => void) => h('button', { class: active ? 'chip active' : 'chip', 'aria-pressed': String(active), onclick: on }, label);
    const renderChips = () => {
      chips.replaceChildren(
        chip(t('allCats'), lib.cat === null, () => { lib.cat = null; lib.shown = 60; renderChips(); run(); }),
        ...l.cats.map((c, i) => chip(lang === 'ar' ? c.ar : c.en, lib.cat === i, () => { lib.cat = lib.cat === i ? null : i; lib.shown = 60; renderChips(); run(); })),
      );
      const st: [LibStyle | null, Key][] = [[null, 'styleAll'], ['hand', 'styleHand'], ['line', 'styleLine'], ['colour', 'styleColour']];
      styles.replaceChildren(...st.map(([s, k]) => chip(t(k), lib.style === s, () => { lib.style = s; lib.shown = 60; renderChips(); run(); })));
    };
    renderChips();
  }).catch((e) => { note.textContent = (e as Error).message; });

  let timer = 0;
  add(body,
    h('input', {
      type: 'search', dir: 'auto', placeholder: t('searchDrawings'), value: lib.query, 'aria-label': t('searchDrawings'),
      oninput: (e: Event) => { lib.query = (e.target as HTMLInputElement).value; lib.shown = 60; clearTimeout(timer); timer = window.setTimeout(run, 250); },
    }),
    styles, chips, note, grid, more,
  );
  run();
}

// ---------------- open images (Pixabay / Unsplash / Pexels via the middleman; Wikimedia / Openverse keyless) ----------------
const online = { query: '', provider: null as Provider | null, drawingsOnly: true, page: 1, offset: 0 };

const CREDIT: Record<Provider, { key: Key; href: string }> = {
  pixabay: { key: 'pixabayCredit', href: 'https://pixabay.com/' },
  unsplash: { key: 'unsplashCredit', href: 'https://unsplash.com/?utm_source=khatt&utm_medium=referral' },
  pexels: { key: 'pexelsCredit', href: 'https://www.pexels.com/' },
  wikimedia: { key: 'wikimediaCredit', href: 'https://commons.wikimedia.org/' },
  openverse: { key: 'openverseCredit', href: 'https://openverse.org/' },
};

function onlineTab(body: HTMLElement) {
  const grid = h('div', { class: 'grid photos', role: 'list' });
  const note = h('div', { class: 'note' });
  const more = h('button', { class: 'more', hidden: true, onclick: () => run(true) }, t('more'));
  const credit = h('a', { class: 'credit', target: '_blank', rel: 'noopener' }) as HTMLAnchorElement;
  const photoNote = h('div', { class: 'note' }, t('photosOnlyNote'));
  const drawingsToggle = h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: online.drawingsOnly, onchange: (e: Event) => { online.drawingsOnly = (e.target as HTMLInputElement).checked; run(); } }),
    t('drawingsOnly'));

  // Services with keys on the app's middleman appear first; Wikimedia and Openverse need no key.
  const { middleman, services } = appConfig();
  const sources: [Provider, Key][] = [
    ...(services.pixabay ? [['pixabay', 'sourcePixabay'] as [Provider, Key]] : []),
    ...(services.unsplash ? [['unsplash', 'sourceUnsplash'] as [Provider, Key]] : []),
    ...(services.pexels ? [['pexels', 'sourcePexels'] as [Provider, Key]] : []),
    ['wikimedia', 'sourceWikimedia'], ['openverse', 'sourceOpenverse'],
  ];
  if (!online.provider || !sources.some(([p]) => p === online.provider)) online.provider = sources[0][0];
  const setCredit = () => {
    const c = CREDIT[online.provider!];
    credit.textContent = t(c.key);
    credit.href = c.href;
    const photos = online.provider === 'unsplash' || online.provider === 'pexels';
    drawingsToggle.hidden = online.provider === 'openverse' || photos;
    photoNote.hidden = !photos;
  };

  const search = async (dict: Record<string, string>) => {
    switch (online.provider) {
      case 'pixabay': return searchPixabay(online.query, online.page, online.drawingsOnly, middleman, dict);
      case 'unsplash': return searchUnsplash(online.query, online.page, middleman, dict);
      case 'pexels': return searchPexels(online.query, online.page, middleman, dict);
      case 'openverse': return searchOpenverse(online.query, online.page, dict);
      default: return searchCommons(online.query, online.offset, online.drawingsOnly, dict);
    }
  };

  const use = async (hit: OnlineHit) => {
    const source = { provider: hit.provider, id: hit.id, author: hit.creator, pageUrl: hit.pageUrl, license: hit.license, attribution: hit.attribution };
    if (hit.hotlink) {
      // Unsplash: report the use, then draw the photo straight from Unsplash's link.
      if (hit.trackUrl) fetch(hit.trackUrl).catch(() => { /* reporting is best effort */ });
      await addImageUrl(hit.title, hit.hotlink, hit.width ?? 1600, hit.height ?? 1200, source);
      return;
    }
    const { blob, isSvg } = await downloadHit(hit);
    if (isSvg) await addSvg(hit.title, await blob.text(), source);
    else await addImageBlob(hit.title, blob, source);
  };

  const run = async (append = false) => {
    if (!online.query.trim()) return;
    if (!navigator.onLine) { note.textContent = t('offline'); return; }
    if (!append) { online.page = 1; online.offset = 0; grid.replaceChildren(); }
    note.textContent = '…';
    try {
      const { dict } = await loadLibrary();
      const r = await search(dict);
      online.page++; online.offset += 24;
      const parts = [];
      if (r.searchedAs && r.searchedAs !== online.query.trim()) parts.push(`${t('searchedAs')}: ${r.searchedAs}`);
      if (r.unknown.length) parts.push(`${t('unknownWords')}: ${r.unknown.join('، ')}`);
      if (!r.hits.length && !append) parts.push(t('noResults'));
      note.textContent = parts.join(' · ');
      grid.append(...r.hits.map((hit: OnlineHit) => h('button', {
        class: 'thumb', role: 'listitem', title: `${hit.title} — ${hit.creator} — ${hit.license}`,
        onclick: async (e: Event) => {
          const btn = e.currentTarget as HTMLButtonElement;
          btn.disabled = true;
          const busy = toast(t('downloading'), 'info', 0);
          try { await use(hit); } catch (err) { toast(onlineMessage(err), 'error', 7000); } finally { busy.remove(); btn.disabled = false; }
        },
      },
        h('img', { src: hit.thumb, alt: hit.title, loading: 'lazy', referrerpolicy: 'no-referrer' }),
        // Photo services ask apps to show who took the photo.
        h('span', { class: 'badge' }, hit.provider === 'unsplash' || hit.provider === 'pexels' ? `📷 ${hit.creator}` : hit.license))));
      more.hidden = !r.more;
    } catch (err) { note.textContent = onlineMessage(err); }
  };

  const srcChips = h('div', { class: 'chips' });
  const renderSrc = () => srcChips.replaceChildren(...sources.map(([p, k]) => h('button', {
    class: online.provider === p ? 'chip active' : 'chip', 'aria-pressed': String(online.provider === p),
    onclick: () => { online.provider = p; renderSrc(); setCredit(); run(); },
  }, t(k))));
  renderSrc(); setCredit();
  add(body,
    h('form', { class: 'row', onsubmit: (e: Event) => { e.preventDefault(); run(); } },
      h('input', { type: 'search', dir: 'auto', enterkeyhint: 'search', placeholder: t('searchOnline'), value: online.query, 'aria-label': t('searchOnline'), oninput: (e: Event) => { online.query = (e.target as HTMLInputElement).value; } }),
      h('button', { type: 'submit', class: 'primary', 'aria-label': 'search' }, '⌕')),
    srcChips, drawingsToggle, photoNote,
    h('div', { class: 'note' }, t('onlineHint')),
    note, grid, more, credit,
  );
  if (online.query) run();
}

// ---------------- text ----------------
function textTab(body: HTMLElement) {
  let font: FontId = 'amiri', size = 96, color = '#1f1f1f';
  const ta = h('textarea', { dir: 'auto', rows: 4, placeholder: 'اكتب هنا… / Type here…' }) as HTMLTextAreaElement;
  add(body,
    ta,
    h('div', { class: 'triple' },
      field(t('font'), select(font, Object.entries(FONTS).map(([k, v]) => [k as FontId, v.label]), (v) => (font = v))),
      field(t('size'), num(size, (v) => (size = v), { min: 8, max: 600, step: 1 })),
      field(t('colour'), h('input', { type: 'color', value: color, oninput: (e: Event) => (color = (e.target as HTMLInputElement).value) }))),
    h('button', { class: 'primary wide', onclick: () => { if (ta.value.trim()) addText(ta.value, font, size, color); } }, t('addText')),
  );
}

// ---------------- own photos ----------------
function uploadTab(body: HTMLElement) {
  const input = h('input', { type: 'file', accept: 'image/*,.svg', id: 'photo-input', class: 'visually-hidden' }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const source = { provider: 'upload' as const, id: f.name, license: 'own' };
      if (f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg')) await addSvg(f.name.replace(/\.svg$/i, ''), await f.text(), source);
      else await addImageBlob(f.name, f, source);
    } catch (err) { toast((err as Error).message, 'error'); }
    input.value = '';
  });
  add(body, h('div', { class: 'note' }, t('uploadHint')), input,
    h('label', { for: 'photo-input', class: 'button primary wide' }, t('chooseFile')));
}

// ---------------- sound (whole video) ----------------
// Per-scene voices live on each scene (tap the scene in the strip under the board).
// This tab is for background music, or one recording that covers the whole video.
let recording: Recording | null = null;
function audioTab(body: HTMLElement) {
  const a = state.project.audio;
  const input = h('input', { type: 'file', accept: 'audio/*', id: 'audio-input', class: 'visually-hidden' }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (f) await setAudio(f, f.name);
    input.value = '';
  });
  const rec = h('button', {
    class: recording ? 'danger wide' : 'wide',
    onclick: async () => {
      unlockAudio();
      if (recording) {
        const r = recording;
        recording = null;
        await setAudio(await r.stop(), t('record'));
        return;
      }
      try {
        recording = await startRecording();
        recording.begin();
        renderTabs();
      } catch (err) { toast(`${t('micPermission')} (${(err as Error).message})`, 'error'); }
    },
  }, recording ? `■ ${t('stop')}` : `● ${t('record')}`);
  add(body,
    h('div', { class: 'callout' },
      h('div', {}, `🎙 ${t('perSceneHint')}`),
      h('button', { class: 'primary wide', onclick: () => { ui.closeSheetOnPhone(); openSceneRecorder(state.project.scenes[0].id, true); } }, t('recordAll'))),
    h('h3', {}, t('backgroundMusic')),
    recording ? h('div', { class: 'note recording' }, t('recording')) : a ? h('div', { class: 'note' }, `${a.name} — ${a.duration.toFixed(1)}s`) : h('div', { class: 'note' }, t('noAudio')),
    input, h('div', { class: 'row' }, h('label', { for: 'audio-input', class: 'button wide' }, t('chooseAudio')), rec),
    a && field(t('volume'), range(a.volume, (v) => { a.volume = v; softCommit(); }, 0, 1, 0.05)),
    a && h('button', { class: 'primary wide', onclick: () => { state.project = fitToDuration(state.project, a.duration); commit(); } }, t('fitAudio')),
    a && h('button', { class: 'wide', onclick: () => { state.project.audio = null; afterLoad(); commit(); renderTabs(); } }, t('remove')),
  );
}

async function setAudio(blob: Blob, name: string) {
  try {
    // Decoding gives an exact duration (recorded files often have no duration header).
    const duration = await blobDuration(blob);
    const src = await putAsset(blob, name);
    state.project.audio = { src, name, duration, volume: 1 };
    afterLoad();
    commit();
    renderTabs();
  } catch (err) { toast(`${t('error')}: ${(err as Error).message}`, 'error'); }
}

ui.renderTabs = renderTabs;
