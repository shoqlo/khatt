// Scene voice recorder: shows the scene's script in large text (teleprompter), a live
// microphone level, 3-2-1 countdown, then listen / record again / use. In "all scenes"
// mode it walks through every scene in order.
import { state, setSceneVoice, commit } from './app';
import { h, add } from './dom';
import { t } from './i18n';
import { toast } from './toast';
import { startRecording, previewClip, unlockAudio, type Recording } from './sound';

export function openSceneRecorder(sceneId: string, walkAll = false) {
  unlockAudio();
  let index = Math.max(0, state.project.scenes.findIndex((s) => s.id === sceneId));
  let rec: Recording | null = null;
  let take: Blob | null = null;
  let takeUrl = '';
  let timer = 0, meterFrame = 0, startedAt = 0;
  let stopPreview: (() => void) | null = null;

  const dlg = h('dialog', { class: 'dialog recorder', 'aria-label': t('recordVoice') });
  const body = h('div', {});
  dlg.append(body);
  document.body.append(dlg);

  const cleanup = () => {
    clearInterval(timer); cancelAnimationFrame(meterFrame);
    rec?.cancel(); rec = null;
    stopPreview?.(); stopPreview = null;
    if (takeUrl) URL.revokeObjectURL(takeUrl);
  };
  dlg.addEventListener('close', () => { cleanup(); dlg.remove(); });

  const scene = () => state.project.scenes[index];
  const total = () => state.project.scenes.length;

  function render(mode: 'idle' | 'countdown' | 'recording' | 'review', extra?: string) {
    const s = scene();
    const nav = walkAll && h('div', { class: 'row rec-nav' },
      h('button', { disabled: index === 0 || mode === 'recording', onclick: () => go(index - 1) }, `‹ ${t('prevScene')}`),
      h('span', { class: 'grow note' }, `${t('scene')} ${index + 1} / ${total()}`),
      index < total() - 1
        ? h('button', { disabled: mode === 'recording', onclick: () => go(index + 1) }, `${t('nextScene')} ›`)
        : h('button', { class: 'primary', disabled: mode === 'recording', onclick: () => dlg.close() }, t('finish')));
    const script = s.narration.trim()
      ? h('div', { class: 'teleprompter', dir: 'auto' }, s.narration)
      : h('textarea', {
          class: 'teleprompter-input', dir: 'auto', rows: 3, placeholder: t('typeNarration'),
          oninput: (e: Event) => { s.narration = (e.target as HTMLTextAreaElement).value; commit({ rerender: false }); },
        });
    const meter = h('div', { class: 'meter' }, h('div', { class: 'meter-bar' }));
    body.replaceChildren();
    add(body,
      h('h3', {}, `${t('recordVoice')} · ${t('scene')} ${index + 1}${s.title && s.title !== String(index + 1) ? ` — ${s.title}` : ''}`),
      nav, script,
      mode === 'countdown' && h('div', { class: 'countdown' }, extra ?? ''),
      mode === 'recording' && h('div', { class: 'rec-status' }, h('span', { class: 'rec-dot' }), h('span', { class: 'rec-time', dir: 'ltr' }, '0:00')),
      mode === 'recording' && meter,
      mode === 'idle' && h('div', { class: 'row' },
        h('button', { class: 'primary big rec-start', onclick: begin }, `● ${t('record')}`),
        s.voice && h('button', { onclick: () => listen(s.voice!.src) }, `▶ ${t('listen')}`)),
      mode === 'idle' && s.voice && h('div', { class: 'note' }, `${t('sceneVoice')}: ${s.voice.duration.toFixed(1)}s`),
      mode === 'recording' && h('button', { class: 'danger big', onclick: finish }, `■ ${t('stop')}`),
      mode === 'review' && h('div', { class: 'row' },
        h('button', { onclick: () => listenBlob() }, `▶ ${t('listen')}`),
        h('button', { onclick: () => { take = null; render('idle'); } }, `↺ ${t('retake')}`),
        h('button', { class: 'primary', onclick: useTake }, `✓ ${t('useTake')}`)),
      h('button', { class: 'wide', onclick: () => dlg.close() }, t('close')),
    );
    if (mode === 'recording') {
      const bar = meter.firstElementChild as HTMLElement;
      const time = body.querySelector('.rec-time')!;
      const loop = () => {
        if (!rec) return;
        bar.style.width = `${Math.round(rec.level() * 100)}%`;
        const secs = (performance.now() - startedAt) / 1000;
        time.textContent = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
        meterFrame = requestAnimationFrame(loop);
      };
      loop();
    }
  }

  function go(i: number) {
    stopPreview?.(); stopPreview = null;
    take = null;
    index = i;
    render('idle');
  }

  async function begin() {
    unlockAudio();
    try {
      rec = await startRecording();
    } catch (e) {
      toast(`${t('micPermission')} (${(e as Error).message})`, 'error', 7000);
      return;
    }
    // Countdown with the microphone open (so the level shows) but not yet recording:
    // the recording starts exactly when the speaker does, so voice and drawing stay in sync.
    for (const n of ['3', '2', '1']) {
      render('countdown', n);
      await new Promise((r) => setTimeout(r, 600));
      if (!rec) return; // dialog closed
    }
    rec.begin();
    startedAt = performance.now();
    render('recording');
  }

  async function finish() {
    if (!rec) return;
    const r = rec;
    rec = null;
    cancelAnimationFrame(meterFrame);
    take = await r.stop();
    if (takeUrl) URL.revokeObjectURL(takeUrl);
    takeUrl = URL.createObjectURL(take);
    render('review');
  }

  async function listen(src: string) {
    stopPreview?.();
    try { stopPreview = await previewClip(src); } catch (e) { toast((e as Error).message, 'error'); }
  }
  function listenBlob() {
    stopPreview?.();
    const a = new Audio(takeUrl);
    a.play().catch(() => {});
    stopPreview = () => a.pause();
  }

  async function useTake() {
    if (!take) return;
    try {
      await setSceneVoice(scene().id, take, `${t('scene')} ${index + 1}`);
      toast(t('saved'), 'ok', 1200);
      take = null;
      if (walkAll && index < total() - 1) go(index + 1);
      else render('idle');
    } catch (e) { toast(`${t('error')}: ${(e as Error).message}`, 'error'); }
  }

  render('idle');
  dlg.showModal();
}
