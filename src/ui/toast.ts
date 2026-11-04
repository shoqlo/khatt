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
  // The same message twice in a row just refreshes; at most three notices on screen.
  const last = box.lastElementChild as HTMLElement | null;
  if (last && last.firstChild?.textContent === message && !action) last.remove();
  box.append(el);
  while (box.children.length > 3) box.firstElementChild!.remove();
  if (ms > 0) setTimeout(() => el.remove(), ms);
  return el;
}
