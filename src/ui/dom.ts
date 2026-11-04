type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | number | null | undefined | false;

/** Tiny DOM builder; text is always inserted as text (no innerHTML), so library data can't inject markup. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
    else if (k === 'checked') (el as HTMLInputElement).checked = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function field(label: string, control: HTMLElement): HTMLLabelElement {
  return h('label', { class: 'field' }, h('span', {}, label), control);
}

export function num(value: number, onChange: (v: number) => void, opts: { min?: number; max?: number; step?: number } = {}) {
  return h('input', {
    type: 'number', value: String(value), min: opts.min, max: opts.max, step: opts.step ?? 0.1,
    oninput: (e: Event) => { const v = parseFloat((e.target as HTMLInputElement).value); if (Number.isFinite(v)) onChange(v); },
  });
}

export function range(value: number, onChange: (v: number) => void, min: number, max: number, step: number) {
  return h('input', { type: 'range', value: String(value), min, max, step, oninput: (e: Event) => onChange(parseFloat((e.target as HTMLInputElement).value)) });
}

export function select<T extends string>(value: T, options: [T, string][], onChange: (v: T) => void) {
  const s = h('select', { onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value as T) },
    options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  s.value = value;
  return s;
}

export function download(blob: Blob, name: string) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/** append() that skips null/false, for conditional children */
export function add(parent: HTMLElement, ...children: Child[]) {
  for (const c of children) if (c != null && c !== false) parent.append(c instanceof Node ? c : String(c));
}
