// The "Edit" panel: the selected element, else the selected scene, else the project.
import { state, ui, commit, softCommit, selectedEl, removeEl, moveEl, canMoveEl, moveElToScene, loadCustomHand, isPhone, setSceneVoice, rebuildChart } from './app';
import { h, field, num, range, select, add } from './dom';
import { t } from './i18n';
import { toast } from './toast';
import { openSceneRecorder } from './recorder';
import { previewClip, unlockAudio } from './sound';
import { FONTS } from '../engine/fonts';
import { uid, FRAMES, type SvgElement, type Aspect, type FontId, type HandId, type HandTone, type BoardStyle, type RevealMode, type Emphasis, type ExitMode } from '../engine/types';
import { BOARD_LOOKS, boardStyle, boardIsDark } from '../engine/board';
import { CHART_LIMIT, PALETTE_DARK, PALETTE_LIGHT, type ChartKind, type ChartSpec } from '../engine/chart';
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

/** Data table for a chart: type, title, one row per bar/point/slice. Rebuilds the drawing as you type. */
function chartEditor(e: SvgElement & { chart: ChartSpec }) {
  const c = e.chart;
  let timer = 0;
  const rebuild = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      rebuildChart(e).then(() => { ui.requestDraw(); softCommit(); }).catch((err) => toast((err as Error).message, 'error'));
    }, 250);
  };
  const rows = h('div', { class: 'chart-rows' });
  const addRow = h('button', { class: 'wide' }, `+ ${t('chartAddRow')}`) as HTMLButtonElement;
  const limit = () => (c.kind === 'pie' ? 12 : CHART_LIMIT);
  const renderRows = () => {
    rows.replaceChildren(...c.labels.map((lab, i) => h('div', { class: 'chart-row' },
      h('input', { value: lab, dir: 'auto', placeholder: t('chartLabel'), 'aria-label': `${t('chartLabel')} ${i + 1}`,
        oninput: (ev: Event) => { c.labels[i] = (ev.target as HTMLInputElement).value; rebuild(); } }),
      h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: String(c.values[i] ?? 0), 'aria-label': `${t('chartValue')} ${i + 1}`,
        oninput: (ev: Event) => { const v = parseFloat((ev.target as HTMLInputElement).value); c.values[i] = Number.isFinite(v) ? v : 0; rebuild(); } }),
      h('button', { class: 'icon danger', 'aria-label': `${t('del')} ${i + 1}`, disabled: c.labels.length <= 1,
        onclick: () => { c.labels.splice(i, 1); c.values.splice(i, 1); renderRows(); rebuild(); } }, '✕'))));
    addRow.disabled = c.labels.length >= limit();
  };
  addRow.onclick = () => { c.labels.push(''); c.values.push(0); renderRows(); rebuild(); (rows.lastElementChild?.firstElementChild as HTMLInputElement | null)?.focus(); };
  renderRows();
  const palette = boardIsDark(state.project) ? PALETTE_DARK : PALETTE_LIGHT;
  const colour = field(t('colour'), h('input', { type: 'color', value: c.color ?? palette[0], oninput: (ev: Event) => { c.color = (ev.target as HTMLInputElement).value; rebuild(); } }));
  colour.hidden = c.kind === 'pie';
  const note = h('div', { class: 'note' }, c.kind === 'bar' ? t('chartBarNote') : c.kind === 'pie' ? t('chartPieNote') : '');
  return h('div', { class: 'chart-editor' },
    h('h4', {}, t('chartData')),
    h('div', { class: 'pair' },
      field(t('chartType'), select(c.kind, [['bar', t('chartBar')], ['line', t('chartLine')], ['pie', t('chartPie')]] as [ChartKind, string][], (v) => {
        c.kind = v; colour.hidden = v === 'pie';
        note.textContent = v === 'bar' ? t('chartBarNote') : v === 'pie' ? t('chartPieNote') : '';
        renderRows(); rebuild();
      })),
      field(t('font'), select(c.font, Object.entries(FONTS).map(([k, v]) => [k as FontId, v.label]), (v) => { c.font = v; rebuild(); }))),
    field(t('chartTitle'), h('input', { value: c.title, dir: 'auto', oninput: (ev: Event) => { c.title = (ev.target as HTMLInputElement).value; rebuild(); } })),
    h('div', { class: 'chart-row head' }, h('span', {}, t('chartLabel')), h('span', {}, t('chartValue')), h('span', {})),
    rows, addRow, note,
    h('div', { class: 'pair' },
      field(t('chartUnit'), h('input', { value: c.unit, dir: 'auto', placeholder: '% · ريال · $', oninput: (ev: Event) => { c.unit = (ev.target as HTMLInputElement).value; rebuild(); } })),
      colour),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: c.showValues, onchange: (ev: Event) => { c.showValues = (ev.target as HTMLInputElement).checked; rebuild(); } }), t('chartShowValues')),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: c.arabicDigits, onchange: (ev: Event) => { c.arabicDigits = (ev.target as HTMLInputElement).checked; rebuild(); } }), t('chartArabicDigits')),
  );
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
    e.kind === 'svg' && e.chart && chartEditor(e as SvgElement & { chart: ChartSpec }),
    scenes.length > 1 && field(t('moveToScene'), select(e.scene ?? scenes[0].id, scenes.map((s, i) => [s.id, `${t('scene')} ${i + 1}`]), (v) => moveElToScene(e.id, v))),
    e.kind === 'text' && h('textarea', { dir: 'auto', rows: 3, value: e.text, 'aria-label': t('text'), oninput: (ev: Event) => { e.text = (ev.target as HTMLTextAreaElement).value; e.name = e.text.slice(0, 24); reprep(); } }),
    e.kind === 'text' && h('div', { class: 'triple' },
      field(t('font'), select(e.font, Object.entries(FONTS).map(([k, v]) => [k as FontId, v.label]), (v) => { e.font = v; reprep(); })),
      field(t('size'), num(e.size, (v) => { e.size = v; reprep(); }, { min: 8, max: 600, step: 1 })),
      field(t('colour'), h('input', { type: 'color', value: e.color, oninput: (ev: Event) => { e.color = (ev.target as HTMLInputElement).value; reprep(); } }))),
    e.kind === 'text' && field(t('align'), select(e.align, [['start', t('alignStart')], ['center', t('alignCenter')], ['end', t('alignEnd')]], (v) => { e.align = v; reprep(); })),
    e.kind === 'svg' && !e.chart && h('div', { class: 'pair' },
      field(t('colourOverride'), h('input', { type: 'color', value: e.color ?? '#1f1f1f', oninput: (ev: Event) => { e.color = (ev.target as HTMLInputElement).value; reprep(); } })),
      field(t('strokeWidth'), num(e.strokeWidth ?? 2, (v) => { e.strokeWidth = v; reprep(); }, { min: 0.1, max: 40, step: 0.1 }))),
    h('div', { class: 'pair' },
      field(t('reveal'), select(e.mode, ([['draw', t('draw')], ['fade', t('fade')], ['move-in', t('moveIn')], ['none', t('none')]] as [RevealMode, string][])
        .concat(idx > 0 ? [['morph', t('morph')]] : []), (v) => { e.mode = v; upd(); if (v === 'morph') toast(t('morphHint'), 'info', 3000); })),
      field(t('direction'), select(e.direction, [['rtl', t('rtl')], ['ltr', t('ltr')]], (v) => {
        e.direction = v;
        if (e.kind === 'svg' && e.chart) rebuildChart(e).then(() => { ui.requestDraw(); softCommit(); }).catch((err) => toast(err.message, 'error'));
        else reprep();
      }))),
    h('div', { class: 'pair' },
      field(t('emphasis'), select(e.emphasis ?? 'none', [['none', t('emNone')], ['pulse', t('emPulse')], ['wiggle', t('emWiggle')], ['bounce', t('emBounce')]] as [Emphasis, string][], (v) => { e.emphasis = v; upd(); })),
      field(t('exit'), select(e.exit ?? 'none', [['none', t('exitNone')], ['fade', t('exitFade')], ['move-out', t('exitMove')]] as [ExitMode, string][], (v) => { e.exit = v; upd(); }))),
    h('div', { class: 'triple' },
      field(t('transition'), num(e.timing.transition, (v) => { e.timing.transition = Math.max(0, v); upd(); }, { min: 0, step: 0.1 })),
      field(t('animate'), num(e.timing.animate, (v) => { e.timing.animate = Math.max(0, v); upd(); }, { min: 0, step: 0.1 })),
      field(t('pauseT'), num(e.timing.pause, (v) => { e.timing.pause = Math.max(0, v); upd(); }, { min: 0, step: 0.1 }))),
    scaleField(),
    h('div', { class: 'pair' },
      field(t('rotation'), range(e.rotation, (v) => { e.rotation = v; upd(); }, -180, 180, 1)),
      field(t('opacity'), range(e.opacity, (v) => { e.opacity = v; upd(); }, 0.05, 1, 0.05))),
    h('div', { class: 'row' },
      h('button', { class: 'toggle', 'aria-pressed': String(!!e.flipX), onclick: (ev: Event) => { e.flipX = !e.flipX; (ev.currentTarget as HTMLElement).setAttribute('aria-pressed', String(e.flipX)); upd(); } }, t('flipX')),
      h('button', { class: 'toggle', 'aria-pressed': String(!!e.flipY), onclick: (ev: Event) => { e.flipY = !e.flipY; (ev.currentTarget as HTMLElement).setAttribute('aria-pressed', String(e.flipY)); upd(); } }, t('flipY'))),
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
    field(t('boardLook'), select(boardStyle(p), ([
      ['whiteboard', 'lookWhiteboard'], ['blackboard', 'lookBlackboard'], ['greenboard', 'lookGreenboard'], ['glass', 'lookGlass'],
      ['notepad', 'lookNotepad'], ['sketchbook', 'lookSketchbook'], ['grid', 'lookGrid'],
    ] as [BoardStyle, Parameters<typeof t>[0]][]).map(([v, k]) => [v, t(k)] as [BoardStyle, string]), (v) => {
      // Text that used the old board's default ink follows the new board (e.g. dark text becomes chalk-white).
      const oldInk = BOARD_LOOKS[boardStyle(p)].ink.toLowerCase(), newInk = BOARD_LOOKS[v].ink;
      for (const e of p.elements) if (e.kind === 'text' && e.color.toLowerCase() === oldInk) e.color = newInk;
      // Charts switch to the colours stepped for a light or dark board.
      const darkChanged = BOARD_LOOKS[v].dark !== boardIsDark(p);
      p.board.style = v;
      const charts = darkChanged ? p.elements.filter((e): e is SvgElement => e.kind === 'svg' && !!e.chart) : [];
      Promise.all(charts.map(rebuildChart)).catch((err) => toast((err as Error).message, 'error')).finally(() => commit());
    })),
    field(t('hand'), select(p.hand, [['marker-right', t('handRight')], ['marker-left', t('handLeft')], ['pen-only', t('penOnly')], ['none', t('noHand')]] as [HandId, string][], (v) => { p.hand = v; commit(); })),
    field(t('handTone'), select(p.handTone ?? 'medium', [['light', t('toneLight')], ['medium', t('toneMedium')], ['tan', t('toneTan')], ['dark', t('toneDark')]] as [HandTone, string][], (v) => { p.handTone = v; commit(); })),
    handFile, h('label', { for: 'hand-input', class: 'button' }, t('customHand')),
    p.customHand && h('div', { class: 'triple' },
      field(t('tipX'), num(p.customHand.tipX, (v) => { p.customHand!.tipX = v; loadCustomHand(); softCommit(); }, { step: 1 })),
      field(t('tipY'), num(p.customHand.tipY, (v) => { p.customHand!.tipY = v; loadCustomHand(); softCommit(); }, { step: 1 })),
      field(t('handScale'), num(p.customHand.scale, (v) => { p.customHand!.scale = v; loadCustomHand(); softCommit(); }, { step: 0.05, min: 0.05 }))),
    p.customHand && h('button', { onclick: () => { p.customHand = null; loadCustomHand(); commit(); } }, t('remove')),
    h('div', { class: 'pair' },
      boardStyle(p) === 'whiteboard' && field(t('background'), h('input', { type: 'color', value: p.board.background, oninput: (e: Event) => { p.board.background = (e.target as HTMLInputElement).value; softCommit(); } })),
      field(t('endHold'), num(p.endHold, (v) => { p.endHold = Math.max(0, v); softCommit(); }, { min: 0 }))),
    h('div', { class: 'note' }, t('stageHelp')),
  );
}
