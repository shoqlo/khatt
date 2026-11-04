// The "Edit" panel: the selected element, else the selected scene, else the project.
import { state, ui, commit, softCommit, selectedEl, removeEl, moveEl, canMoveEl, moveElToScene, loadCustomHand, isPhone, setSceneVoice } from './app';
import { h, field, num, range, select, add } from './dom';
import { t } from './i18n';
import { toast } from './toast';
import { openSceneRecorder } from './recorder';
import { previewClip, unlockAudio } from './sound';
import { FONTS } from '../engine/fonts';
import { uid, FRAMES, type Aspect, type FontId, type HandId } from '../engine/types';
import { prepareAll } from '../engine/prepare';
import { autoCamera, fullView } from '../engine/timeline';
import { boundsOf } from '../engine/render';
import { sceneSpans, fitSceneToVoice, moveScene, deleteScene, normalizeProject } from '../engine/scenes';
import { putAsset } from '../storage/db';

export function renderProps() {
  const box = document.getElementById('props')!;
  box.replaceChildren();
  const e = selectedEl();
  if (e) return renderElementProps(box, e);
  const scene = state.scene ? state.project.scenes.find((s) => s.id === state.scene) : undefined;
  if (scene) return renderSceneProps(box, scene.id);
  return renderProjectProps(box);
}

function renderElementProps(box: HTMLElement, e: NonNullable<ReturnType<typeof selectedEl>>) {
  const upd = () => softCommit();
  const reprep = () => { prepareAll([e]).then(ui.requestDraw).catch((err) => toast(err.message, 'error')); softCommit(); };
  const idx = state.project.elements.indexOf(e);
  const scenes = state.project.scenes;
  add(box,
    h('h3', {}, `${t('element')} ${idx + 1}`),
    h('div', { class: 'row' },
      h('button', { disabled: !canMoveEl(e.id, -1), onclick: () => moveEl(e.id, -1) }, `‹ ${t('earlier')}`),
      h('button', { disabled: !canMoveEl(e.id, 1), onclick: () => moveEl(e.id, 1) }, `${t('later')} ›`),
      h('button', { onclick: () => { const c = structuredClone(e); c.id = uid(); c.x += 40; c.y += 40; state.project.elements.splice(idx + 1, 0, c); state.selected = c.id; commit(); } }, t('duplicate')),
      h('button', { class: 'danger', onclick: () => removeEl(e.id) }, t('del'))),
    e.kind !== 'text' && h('button', {
      class: 'primary wide replace-btn',
      onclick: () => { state.replaceTarget = e.id; document.body.classList.add('replacing'); ui.renderTabs(); toast(t('replacing'), 'info', 5000); ui.openSheet('add'); },
    }, `⇄ ${t('replace')}`),
    scenes.length > 1 && field(t('moveToScene'), select(e.scene ?? scenes[0].id, scenes.map((s, i) => [s.id, `${t('scene')} ${i + 1}`]), (v) => moveElToScene(e.id, v))),
    e.kind === 'text' && h('textarea', { dir: 'auto', rows: 3, value: e.text, 'aria-label': t('text'), oninput: (ev: Event) => { e.text = (ev.target as HTMLTextAreaElement).value; e.name = e.text.slice(0, 24); reprep(); } }),
    e.kind === 'text' && h('div', { class: 'triple' },
      field(t('font'), select(e.font, Object.entries(FONTS).map(([k, v]) => [k as FontId, v.label]), (v) => { e.font = v; reprep(); })),
      field(t('size'), num(e.size, (v) => { e.size = v; reprep(); }, { min: 8, max: 600, step: 1 })),
      field(t('colour'), h('input', { type: 'color', value: e.color, oninput: (ev: Event) => { e.color = (ev.target as HTMLInputElement).value; reprep(); } }))),
    e.kind === 'text' && field(t('align'), select(e.align, [['start', t('alignStart')], ['center', t('alignCenter')], ['end', t('alignEnd')]], (v) => { e.align = v; reprep(); })),
    e.kind === 'svg' && h('div', { class: 'pair' },
      field(t('colourOverride'), h('input', { type: 'color', value: e.color ?? '#1f1f1f', oninput: (ev: Event) => { e.color = (ev.target as HTMLInputElement).value; reprep(); } })),
      field(t('strokeWidth'), num(e.strokeWidth ?? 2, (v) => { e.strokeWidth = v; reprep(); }, { min: 0.1, max: 40, step: 0.1 }))),
    h('div', { class: 'pair' },
      field(t('reveal'), select(e.mode, [['draw', t('draw')], ['fade', t('fade')], ['move-in', t('moveIn')], ['none', t('none')]], (v) => { e.mode = v; upd(); })),
      field(t('direction'), select(e.direction, [['rtl', t('rtl')], ['ltr', t('ltr')]], (v) => { e.direction = v; reprep(); }))),
    h('div', { class: 'triple' },
      field(t('transition'), num(e.timing.transition, (v) => { e.timing.transition = Math.max(0, v); upd(); }, { min: 0, step: 0.1 })),
      field(t('animate'), num(e.timing.animate, (v) => { e.timing.animate = Math.max(0, v); upd(); }, { min: 0, step: 0.1 })),
      field(t('pauseT'), num(e.timing.pause, (v) => { e.timing.pause = Math.max(0, v); upd(); }, { min: 0, step: 0.1 }))),
    scaleField(),
    h('div', { class: 'pair' },
      field(t('rotation'), range(e.rotation, (v) => { e.rotation = v; upd(); }, -180, 180, 1)),
      field(t('opacity'), range(e.opacity, (v) => { e.opacity = v; upd(); }, 0.05, 1, 0.05))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!e.noHand, onchange: (ev: Event) => { e.noHand = (ev.target as HTMLInputElement).checked; upd(); } }), t('hideHand')),
    h('div', { class: 'field' }, h('span', {}, `${t('camera')}: ${e.camera ? t('cameraSet') : t('cameraAuto')}`),
      h('div', { class: 'row' },
        h('button', { onclick: () => { e.camera = { ...state.view }; commit(); } }, t('setCamera')),
        h('button', { onclick: () => { e.camera = null; state.view = autoCamera(boundsOf(e), state.project); commit(); } }, t('autoCamera')))),
    e.kind !== 'text' && e.source && e.source.provider !== 'upload' && h('div', { class: 'credit' },
      `${t('credit')}: `,
      e.source.pageUrl ? h('a', { href: e.source.pageUrl, target: '_blank', rel: 'noopener' }, e.source.author || e.source.provider) : (e.source.author || e.source.id),
      ` · ${e.source.license}`),
  );

  function scaleField() {
    // Logarithmic slider (small drawings need fine steps, big ones coarse); label shows the live value.
    const label = h('span', {}, `${t('scale')} (${e.scale.toFixed(2)})`);
    return h('label', { class: 'field' }, label, range(Math.log(e.scale), (v) => {
      e.scale = Math.round(Math.exp(v) * 100) / 100;
      label.textContent = `${t('scale')} (${e.scale.toFixed(2)})`;
      upd();
    }, Math.log(0.02), Math.log(60), 0.01));
  }
}

function renderSceneProps(box: HTMLElement, sceneId: string) {
  const p = state.project;
  const spans = sceneSpans(p);
  const span = spans.find((s) => s.scene.id === sceneId)!;
  const scene = span.scene;
  const n = span.index + 1;
  const voiceInput = h('input', { type: 'file', accept: 'audio/*', id: 'scene-voice-input', class: 'visually-hidden' }) as HTMLInputElement;
  voiceInput.addEventListener('change', async () => {
    const f = voiceInput.files?.[0];
    voiceInput.value = '';
    if (!f) return;
    try { await setSceneVoice(scene.id, f, f.name); toast(t('saved'), 'ok', 1200); } catch (err) { toast(`${t('error')}: ${(err as Error).message}`, 'error'); }
  });
  let stop: (() => void) | null = null;
  add(box,
    h('h3', {}, `${t('scene')} ${n}`),
    // Jump between scenes without closing the panel (on phones it covers the scene strip).
    spans.length > 1 && h('div', { class: 'chips scene-jump', role: 'tablist' }, spans.map((sp) => h('button', {
      class: sp.scene.id === scene.id ? 'chip active' : 'chip', role: 'tab', 'aria-selected': String(sp.scene.id === scene.id),
      onclick: () => { state.scene = sp.scene.id; state.selected = null; const first = p.elements.find((e) => e.scene === sp.scene.id); if (first) state.view = first.camera ?? autoCamera(boundsOf(first), p); commit(); },
    }, `${sp.index + 1}${sp.scene.voice ? ' 🎙' : ''}`))),
    h('div', { class: 'row' },
      h('button', { disabled: span.index === 0, onclick: () => { moveScene(p, scene.id, -1); commit(); } }, `‹ ${t('earlier')}`),
      h('button', { disabled: span.index === spans.length - 1, onclick: () => { moveScene(p, scene.id, 1); commit(); } }, `${t('later')} ›`),
      h('button', { class: 'danger', onclick: () => { if (!confirm(t('confirmDeleteScene'))) return; deleteScene(p, scene.id); state.scene = null; commit(); } }, t('deleteScene'))),
    span.first < 0 && h('div', { class: 'note warn' }, t('sceneEmpty')),
    h('button', { class: 'wide', onclick: () => { state.scene = scene.id; state.selected = null; ui.openSheet('add'); } }, `＋ ${t('addToScene')}`),
    h('h4', {}, `🎙 ${t('sceneVoice')}`),
    scene.voice
      ? h('div', { class: 'voice-box' },
          h('div', { class: 'note' }, `${scene.voice.name} · ${scene.voice.duration.toFixed(1)}s`),
          h('div', { class: 'row' },
            h('button', { onclick: async () => { unlockAudio(); stop?.(); stop = await previewClip(scene.voice!.src, scene.voice!.volume); } }, `▶ ${t('listen')}`),
            h('button', { onclick: () => openSceneRecorder(scene.id) }, `↺ ${t('retake')}`),
            h('button', { class: 'danger', onclick: () => { scene.voice = null; commit(); } }, t('removeVoice'))),
          field(t('volume'), range(scene.voice.volume, (v) => { scene.voice!.volume = v; softCommit(); }, 0, 1.5, 0.05)),
          h('button', { class: 'wide', onclick: () => { fitSceneToVoice(p, scene.id); commit(); } }, t('fitSceneVoice')))
      : h('div', { class: 'voice-box' },
          h('div', { class: 'note' }, t('noVoice')),
          h('div', { class: 'row' },
            h('button', { class: 'primary', onclick: () => openSceneRecorder(scene.id) }, `● ${t('recordVoice')}`),
            voiceInput, h('label', { for: 'scene-voice-input', class: 'button' }, `⬆ ${t('uploadVoice')}`))),
    h('label', { class: 'field' }, h('span', {}, t('narration')),
      h('textarea', { dir: 'auto', rows: 4, value: scene.narration, oninput: (ev: Event) => { scene.narration = (ev.target as HTMLTextAreaElement).value; softCommit(); } })),
    h('div', { class: 'note' }, t('narrationHint')),
    p.scenes.length > 1 && h('button', { class: 'wide', onclick: () => openSceneRecorder(scene.id, true) }, `🎙 ${t('recordAll')}`),
  );
}

function renderProjectProps(box: HTMLElement) {
  const p = state.project;
  const handFile = h('input', { type: 'file', accept: 'image/png,image/webp', id: 'hand-input', class: 'visually-hidden' }) as HTMLInputElement;
  handFile.addEventListener('change', async () => {
    const f = handFile.files?.[0];
    if (!f) return;
    const src = await putAsset(f, f.name);
    p.customHand = { src, tipX: 0, tipY: 0, scale: 0.5 };
    await loadCustomHand(); commit();
  });
  add(box,
    h('h3', {}, t('project')),
    isPhone() && h('div', { class: 'note' }, t('tapToEdit')),
    field(t('shape'), select(p.aspect, [['landscape', t('shapeLandscape')], ['portrait', t('shapePortrait')], ['square', t('shapeSquare')]] as [Aspect, string][], (v) => {
      // Changing shape keeps the drawings; a board that was exactly one frame becomes the new frame.
      const f0 = FRAMES[p.aspect], f1 = FRAMES[v];
      if (p.board.width === f0.w && p.board.height === f0.h) { p.board.width = f1.w; p.board.height = f1.h; }
      p.aspect = v;
      normalizeProject(p);
      state.view = fullView(p);
      commit();
    })),
    h('button', { class: 'primary wide', onclick: () => openSceneRecorder(p.scenes[0].id, true) }, `🎙 ${t('recordAll')}`),
    field(t('hand'), select(p.hand, [['marker-right', t('handRight')], ['marker-left', t('handLeft')], ['pen-only', t('penOnly')], ['none', t('noHand')]] as [HandId, string][], (v) => { p.hand = v; commit(); })),
    handFile, h('label', { for: 'hand-input', class: 'button' }, t('customHand')),
    p.customHand && h('div', { class: 'triple' },
      field(t('tipX'), num(p.customHand.tipX, (v) => { p.customHand!.tipX = v; loadCustomHand(); softCommit(); }, { step: 1 })),
      field(t('tipY'), num(p.customHand.tipY, (v) => { p.customHand!.tipY = v; loadCustomHand(); softCommit(); }, { step: 1 })),
      field(t('handScale'), num(p.customHand.scale, (v) => { p.customHand!.scale = v; loadCustomHand(); softCommit(); }, { step: 0.05, min: 0.05 }))),
    p.customHand && h('button', { onclick: () => { p.customHand = null; loadCustomHand(); commit(); } }, t('remove')),
    h('div', { class: 'pair' },
      field(t('background'), h('input', { type: 'color', value: p.board.background, oninput: (e: Event) => { p.board.background = (e.target as HTMLInputElement).value; softCommit(); } })),
      field(t('endHold'), num(p.endHold, (v) => { p.endHold = Math.max(0, v); softCommit(); }, { min: 0 }))),
    h('div', { class: 'note' }, t('stageHelp')),
  );
}
