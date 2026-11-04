import { state, loadProject, commit, save, isPhone } from './app';
import { h, field, select, download, add } from './dom';
import { t, getLang, setLang } from './i18n';
import { toast } from './toast';
import { newProject, uid } from '../engine/types';
import { exportVideo, exportSrt, planExport, type ExportFormat } from '../engine/export';
import { listProjects, getProject, deleteProject, exportProjectFile, importProjectFile } from '../storage/db';
import { loadLibrary } from '../library/builtin';
import { projectCredits } from '../library/credits';
import { ui } from './app';
import { openWizard } from './wizard';
import { openSceneRecorder } from './recorder';
import { FRAMES } from '../engine/types';

function dialog(...children: (Node | false | null | undefined)[]) {
  const dlg = h('dialog', { class: 'dialog' });
  add(dlg, ...children);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // tap outside closes
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}
const closeBtn = (dlg: () => HTMLDialogElement) => h('button', { class: 'wide', onclick: () => dlg().close() }, t('close'));

// ---------------- install (PWA) ----------------
let installEvent: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e as typeof installEvent; });
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ---------------- menu ----------------
let fileInput: HTMLInputElement | null = null;
function projectFileInput() {
  if (fileInput) return fileInput;
  fileInput = h('input', { type: 'file', accept: '.khatt,application/json', class: 'visually-hidden' }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    const f = fileInput!.files?.[0];
    fileInput!.value = '';
    if (!f) return;
    try { loadProject(await importProjectFile(f, uid)); await save(); toast(t('imported'), 'ok'); } catch (e) { toast((e as Error).message, 'error'); }
  });
  document.body.append(fileInput);
  return fileInput;
}

export function openMenu() {
  let dlg!: HTMLDialogElement;
  const item = (label: string, run: () => void, cls = '') => h('button', { class: `menu-item ${cls}`, onclick: () => { dlg.close(); run(); } }, label);
  projectFileInput();
  dlg = dialog(
    h('h3', {}, t('menu')),
    item(`✨ ${t('fromScript')}`, openWizard, 'accent'),
    item(t('new'), () => { loadProject(newProject(t('untitled'))); commit(); }),
    item(`🎙 ${t('recordAll')}`, () => openSceneRecorder(state.project.scenes[0].id, true)),
    item(t('projects'), openProjects),
    item(t('saveFile'), async () => download(await exportProjectFile(state.project), `${state.project.title || 'khatt'}.khatt`)),
    item(t('openFile'), () => projectFileInput().click()),
    item(t('lang'), () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); ui.renderAll(); }),
    !isStandalone() && (installEvent
      ? item(t('install'), async () => { await installEvent!.prompt(); installEvent = null; })
      : isIos() ? item(t('install'), () => toast(t('installIos'), 'info', 12000)) : null),
    item(t('licences'), openLicences),
    h('div', { class: 'note' }, t('aboutText')),
    closeBtn(() => dlg),
  );
}

export async function openProjects() {
  const list = await listProjects();
  let dlg!: HTMLDialogElement;
  dlg = dialog(
    h('h3', {}, t('projects')),
    h('div', { class: 'list' }, list.map((p) => h('div', { class: 'row' },
      h('button', {
        class: 'grow', dir: 'auto',
        onclick: async () => { const proj = await getProject(p.id); if (proj) loadProject(proj); dlg.close(); },
      }, h('strong', {}, p.title || t('untitled')), h('small', {}, ` · ${p.elements} · ${new Date(p.updated).toLocaleString(getLang())}`)),
      h('button', {
        class: 'danger', 'aria-label': t('deleteProject'),
        onclick: async () => {
          if (!confirm(t('confirmDelete'))) return;
          await deleteProject(p.id);
          if (p.id === state.project.id) loadProject(newProject(t('untitled')));
          dlg.close(); openProjects();
        },
      }, '✕')))),
    closeBtn(() => dlg),
  );
}

// ---------------- licences ----------------
async function openLicences() {
  const lib = await loadLibrary().catch(() => null);
  let dlg!: HTMLDialogElement;
  dlg = dialog(
    h('h3', {}, t('licences')),
    h('h4', {}, t('drawingsFrom')),
    h('ul', { class: 'licences' }, (lib?.sets ?? []).map((s) => h('li', {},
      h('a', { href: s.authorUrl || s.licenseUrl || '#', target: '_blank', rel: 'noopener' }, s.name),
      ` — ${s.author ?? ''} · ${s.count} · `,
      h('a', { href: s.licenseUrl || '#', target: '_blank', rel: 'noopener' }, s.license)))),
    h('h4', {}, t('fonts')),
    h('ul', { class: 'licences' }, h('li', {}, 'Amiri — Khaled Hosny · SIL Open Font License 1.1'), h('li', {}, 'Cairo — Mohamed Gaber · SIL Open Font License 1.1')),
    h('h4', {}, t('software')),
    h('ul', { class: 'licences' }, ['HarfBuzz (MIT)', 'bidi-js (MIT)', 'mp4-muxer (MIT)', 'webm-muxer (MIT)', 'gifenc (MIT)'].map((x) => h('li', {}, x))),
    h('div', { class: 'note' }, t('openverseCredit'), ' · ', t('wikimediaCredit')),
    closeBtn(() => dlg),
  );
}

// ---------------- export ----------------
export async function openExport() {
  const phone = isPhone();
  let format: ExportFormat = 'mp4', res = phone ? '720' : '1080', fps = 30;
  let abort: AbortController | null = null;
  const bar = h('progress', { max: 1, value: 0 }) as HTMLProgressElement;
  const msg = h('div', { class: 'note', role: 'status' });
  const planNote = h('div', { class: 'note warn' });
  const out = h('div', { class: 'row' });
  const lib = await loadLibrary().catch(() => null);
  const credits = projectCredits(state.project, lib?.sets ?? []);
  const creditsText = credits.join('\n');

  const updatePlan = async () => {
    try {
      const plan = await planExport(state.project, format);
      planNote.textContent = plan.method === 'realtime' ? t('realtimeNote') : plan.silent ? t('silentNote') : '';
    } catch (e) { planNote.textContent = (e as Error).message; }
  };

  const startBtn = h('button', {
    class: 'primary wide', onclick: async () => {
      // Created inside the tap so iPhones allow sound in the real-time recorder.
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const audioContext = state.project.audio && AC ? new AC() : undefined;
      audioContext?.resume();
      abort = new AbortController();
      startBtn.disabled = true; out.replaceChildren(); msg.textContent = `${t('exporting')} ${t('keepOpen')}`; bar.value = 0;
      // Size follows the video shape: e.g. 1080p vertical = 1080x1920.
      const f = FRAMES[state.project.aspect];
      const short = res === '1080' ? 1080 : res === '720' ? 720 : 480;
      const k = short / Math.min(f.w, f.h);
      const [w, hh] = [Math.round((f.w * k) / 2) * 2, Math.round((f.h * k) / 2) * 2];
      const lock = await (navigator as { wakeLock?: { request: (k: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen').catch(() => null);
      const t0 = performance.now();
      try {
        const r = await exportVideo(state.project, { format, width: w, height: hh, fps, signal: abort.signal, customHand: state.customHand, audioContext, onProgress: (f) => (bar.value = f) });
        const secs = ((performance.now() - t0) / 1000).toFixed(1);
        msg.textContent = `${t('done')} — ${(r.blob.size / 1e6).toFixed(1)} MB · ${secs}s`;
        const name = `${state.project.title || 'khatt'}.${r.ext}`;
        const file = new File([r.blob], name, { type: r.mime });
        const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
        out.replaceChildren();
        add(out,
          canShare && h('button', {
            class: 'primary', onclick: () => navigator.share({ files: [file], title: state.project.title }).catch(() => { /* user cancelled */ }),
          }, t('share')),
          h('button', { class: canShare ? '' : 'primary', onclick: () => download(r.blob, name) }, t('download')),
        );
        (dlg as HTMLDialogElement & { lastResult?: unknown }).lastResult = r;
        if (!canShare) download(r.blob, name);
      } catch (err) {
        msg.textContent = (err as Error).name === 'AbortError' ? t('cancel') : `${t('error')}: ${(err as Error).message}`;
      } finally {
        startBtn.disabled = false; abort = null;
        lock?.release().catch(() => {});
        audioContext?.close().catch(() => {});
      }
    },
  }, t('start'));

  const creditsBox = h('div', { class: 'credits' },
    h('h4', {}, t('credits')),
    credits.length
      ? [h('textarea', { readonly: true, rows: Math.min(5, credits.length + 1), dir: 'ltr', value: creditsText }),
         h('button', { onclick: async () => { try { await navigator.clipboard.writeText(creditsText); toast(t('copied'), 'ok', 1500); } catch { /* clipboard blocked */ } } }, t('copy'))]
      : h('div', { class: 'note' }, t('noCredits')));

  let dlg!: HTMLDialogElement;
  dlg = dialog(
    h('h3', {}, t('exportTitle')),
    h('div', { class: 'triple' },
      field(t('format'), select(format, [['mp4', 'MP4'], ['webm', 'WebM'], ['gif', 'GIF']], (v) => { format = v; updatePlan(); })),
      field(t('resolution'), select(res, [['1080', '1080p'], ['720', '720p'], ['480', '480p']], (v) => (res = v))),
      field(t('fps'), select(String(fps), [['30', '30'], ['25', '25'], ['24', '24']], (v) => (fps = Number(v))))),
    planNote, bar, msg, out,
    startBtn,
    h('button', { class: 'wide', onclick: () => download(new Blob([exportSrt(state.project)], { type: 'application/x-subrip' }), `${state.project.title || 'khatt'}.srt`) }, t('subtitles')),
    creditsBox,
    h('button', { class: 'wide', onclick: () => { abort?.abort(); dlg.close(); } }, t('close')),
  );
  dlg.addEventListener('close', () => abort?.abort());
  updatePlan();
}
