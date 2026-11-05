// "Video from a script": paste a script, choose type/shape/style/pictures, get an editable draft.
import { state, loadProject, save, ui } from './app';
import { h, add } from './dom';
import { t, getLang, type Key } from './i18n';
import { toast } from './toast';
import { openSceneRecorder } from './recorder';
import { generateProject, splitScenes, sceneSeconds, type VideoType, type StyleChoice, type DrawingPick, type Keyword } from '../generator/script';
import type { Aspect, BoardElement, FontId } from '../engine/types';
import { prepare } from '../engine/prepare';
import { getFont } from '../engine/fonts';
import { layoutText } from '../engine/text';
import { putAsset, resolveUrl } from '../storage/db';
import { loadLibrary, type LibStyle } from '../library/builtin';
import { searchCommons, downloadHit } from '../library/online';
import { libraryCandidates } from '../generator/pick';

const opts = {
  script: '',
  type: 'lesson' as VideoType,
  aspect: 'landscape' as Aspect,
  style: 'hand' as StyleChoice,
  online: false,
  voice: 'record' as 'record' | 'none',
  photos: [] as File[],
};

/** Greedy word wrap measured with the real Arabic shaping, shrinking until it fits the box. */
async function fitText(text: string, font: FontId, box: { w: number; h: number }, maxSize: number) {
  const f = await getFont(font);
  const width = (s: string, size: number) => layoutText(f.hb, f.font, f.upem, s, size, 'start', false).width;
  let best = { text, size: Math.round(maxSize * 0.45) };
  for (let size = maxSize; size >= maxSize * 0.45; size = Math.round(size * 0.9)) {
    const lines: string[] = [];
    let cur = '';
    for (const w of text.split(/\s+/)) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && width(next, size) > box.w) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    const joined = lines.join('\n');
    const l = layoutText(f.hb, f.font, f.upem, joined, size, 'start', false);
    best = { text: joined, size };
    if (l.height <= box.h && l.width <= box.w * 1.02) return best;
  }
  return best;
}

async function imageSize(src: string) {
  const img = new Image();
  img.src = await resolveUrl(src);
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}

export function openWizard() {
  const dlg = h('dialog', { class: 'dialog wizard' });
  const body = h('div', {});
  dlg.append(body);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);

  const chips = <T extends string>(value: () => T, options: [T, Key][], set: (v: T) => void) => {
    const box = h('div', { class: 'chips wrap', role: 'radiogroup' });
    const draw = () => box.replaceChildren(...options.map(([v, k]) => h('button', {
      class: value() === v ? 'chip active' : 'chip', role: 'radio', 'aria-checked': String(value() === v),
      onclick: () => { set(v); draw(); },
    }, t(k))));
    draw();
    return box;
  };

  const stats = h('div', { class: 'note' });
  const updateStats = () => {
    const scenes = splitScenes(opts.script);
    const secs = scenes.reduce((a, s) => a + sceneSeconds(s, opts.type), 0);
    stats.textContent = scenes.length ? `${scenes.length} ${t('scenesWord')} · ${t('approx')} ${Math.round(secs)} ${t('secondsShort')}` : t('scriptHint');
  };
  const ta = h('textarea', {
    dir: 'auto', rows: 8, class: 'script', placeholder: t('scriptPlaceholder'), value: opts.script, 'aria-label': t('scriptLabel'),
    oninput: (e: Event) => { opts.script = (e.target as HTMLTextAreaElement).value; updateStats(); },
  }) as HTMLTextAreaElement;
  updateStats();

  const photoInput = h('input', { type: 'file', accept: 'image/*', multiple: true, id: 'wizard-photos', class: 'visually-hidden' }) as HTMLInputElement;
  const photoNote = h('span', { class: 'note' });
  const showPhotos = () => { photoNote.textContent = opts.photos.length ? `${opts.photos.length} ✓` : ''; };
  photoInput.addEventListener('change', () => { opts.photos = Array.from(photoInput.files ?? []); showPhotos(); });
  showPhotos();

  const bar = h('progress', { max: 1, value: 0, hidden: true }) as HTMLProgressElement;
  const status = h('div', { class: 'note', role: 'status' });
  const go = h('button', { class: 'primary big wide', onclick: () => create() }, `✨ ${t('createDraft')}`) as HTMLButtonElement;

  add(body,
    h('h3', {}, t('wizardTitle')),
    h('label', { class: 'field' }, h('span', {}, t('scriptLabel')), ta), stats,
    h('div', { class: 'field' }, h('span', {}, t('videoType')),
      chips(() => opts.type, [['lesson', 'typeLesson'], ['explainer', 'typeExplainer'], ['story', 'typeStory'], ['promo', 'typePromo']], (v) => { opts.type = v; updateStats(); })),
    h('div', { class: 'field' }, h('span', {}, t('shape')),
      chips(() => opts.aspect, [['landscape', 'shapeLandscape'], ['portrait', 'shapePortrait'], ['square', 'shapeSquare']], (v) => (opts.aspect = v))),
    h('div', { class: 'field' }, h('span', {}, t('drawingStyle')),
      chips(() => opts.style, [['hand', 'styleHand'], ['line', 'styleLine'], ['colour', 'styleColour'], ['mixed', 'styleMixed']], (v) => (opts.style = v))),
    h('div', { class: 'field' }, h('span', {}, t('resources')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, disabled: true }), t('resBuiltin')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: opts.online, onchange: (e: Event) => (opts.online = (e.target as HTMLInputElement).checked) }), t('resOnline')),
      h('div', { class: 'row' }, photoInput, h('label', { for: 'wizard-photos', class: 'button' }, `${t('resPhotos')}…`), photoNote),
      h('div', { class: 'note' }, t('resPhotosHint'))),
    h('div', { class: 'field' }, h('span', {}, t('voicePlan')),
      chips(() => opts.voice, [['record', 'voiceRecordAfter'], ['none', 'voiceNone']], (v) => (opts.voice = v))),
    h('div', { class: 'note' }, t('newProjectNote')),
    go, bar, status,
    h('button', { class: 'wide', onclick: () => dlg.close() }, t('close')),
  );
  dlg.showModal();

  async function create() {
    if (!splitScenes(opts.script).length) { toast(t('scriptEmpty'), 'warn'); ta.focus(); return; }
    go.disabled = true; bar.hidden = false;
    try {
      const lib = await loadLibrary();
      const styleFor = (scene: number): LibStyle | null => opts.style === 'mixed' ? null : opts.style;
      const candidate = libraryCandidates(lib, styleFor, getLang(), opts.type === 'story');
      const online = async (k: Keyword, used: Set<string>): Promise<DrawingPick | null> => {
        if (!opts.online || !navigator.onLine || !k.english.length) return null;
        try {
          const r = await searchCommons(k.english[0], 0, true, lib.dict);
          for (const hit of r.hits.slice(0, 4)) {
            if (used.has(hit.id)) continue;
            try {
              const { blob, isSvg } = await downloadHit(hit);
              used.add(hit.id);
              const source = { provider: hit.provider, id: hit.id, author: hit.creator, pageUrl: hit.pageUrl, license: hit.license, attribution: hit.attribution };
              return isSvg ? { isSvg: true, svg: await blob.text(), name: hit.title, source } : { isSvg: false, blob, name: hit.title, source };
            } catch { /* try the next one */ }
          }
        } catch { /* offline or rate-limited */ }
        return null;
      };
      const project = await generateProject(
        { script: opts.script, type: opts.type, aspect: opts.aspect, style: opts.style, photos: opts.photos },
        {
          candidate,
          online,
          dict: lib.dict,
          measure: async (el: BoardElement) => { const p = await prepare(el); return { w: p.w, h: p.h }; },
          fitText,
          storeImage: async (blob, name) => { const src = await putAsset(blob, name); return { src, ...(await imageSize(src)) }; },
          onProgress: (done, total) => { bar.value = done / total; status.textContent = `${t('making')} ${Math.min(done + 1, total)} / ${total}…`; },
        },
      );
      loadProject(project);
      await save();
      dlg.close();
      ui.play?.(0);
      toast(t('draftReady'), 'ok', 9000, opts.voice === 'record'
        ? { label: `🎙 ${t('recordAll')}`, run: () => { ui.stop?.(); openSceneRecorder(state.project.scenes[0].id, true); } }
        : undefined);
    } catch (e) {
      status.textContent = `${t('error')}: ${(e as Error).message}`;
    } finally {
      go.disabled = false;
    }
  }
}
