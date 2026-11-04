// Small non-blocking notices (instead of alert(), which is jarring on phones).
export function toast(message: string, kind: 'ok' | 'warn' | 'error' | 'info' = 'info', ms = 4000, action?: { label: string; run: () => void }) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.run(); el.remove(); };
    el.append(b);
  }
  box.append(el);
  if (ms > 0) setTimeout(() => el.remove(), ms);
  return el;
}
