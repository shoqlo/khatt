// On-device storage (IndexedDB). Every customer's projects, pictures and recordings stay
// on their own phone/computer: no accounts, no server, works offline.
// Binary files are stored once, content-addressed: element.src = "asset:<sha256>".
import type { Project } from '../engine/types';

const DB_NAME = 'khatt';
const DB_VERSION = 1;

export interface AssetRecord { id: string; blob: Blob; type: string; name: string; created: number }
export interface ProjectSummary { id: string; title: string; elements: number; updated: number }

let dbPromise: Promise<IDBDatabase> | null = null;
let memoryFallback: { projects: Map<string, Project & { updated: number }>; assets: Map<string, AssetRecord> } | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Storage is blocked by another open tab'));
  });
  return dbPromise;
}

/** True when the browser refused storage (e.g. some private modes); data then lives only until the tab closes. */
export let storageIsVolatile = false;

async function store(name: 'projects' | 'assets', mode: IDBTransactionMode) {
  try {
    const db = await openDb();
    return db.transaction(name, mode).objectStore(name);
  } catch {
    storageIsVolatile = true;
    memoryFallback ??= { projects: new Map(), assets: new Map() };
    return null;
  }
}

// ---------------- projects ----------------
export async function listProjects(): Promise<ProjectSummary[]> {
  const s = await store('projects', 'readonly');
  const all: (Project & { updated: number })[] = s ? await req(s.getAll()) : [...memoryFallback!.projects.values()];
  return all
    .map((p) => ({ id: p.id, title: p.title, elements: p.elements?.length ?? 0, updated: p.updated ?? 0 }))
    .sort((a, b) => b.updated - a.updated);
}

export async function getProject(id: string): Promise<Project | null> {
  const s = await store('projects', 'readonly');
  const p = s ? await req(s.get(id)) : memoryFallback!.projects.get(id);
  if (!p) return null;
  const { updated: _u, ...rest } = p as Project & { updated?: number };
  return rest as Project;
}

export async function putProject(p: Project): Promise<void> {
  const rec = { ...structuredClone(p), updated: Date.now() };
  const s = await store('projects', 'readwrite');
  if (s) await req(s.put(rec));
  else memoryFallback!.projects.set(p.id, rec);
}

export async function deleteProject(id: string): Promise<void> {
  const s = await store('projects', 'readwrite');
  if (s) await req(s.delete(id));
  else memoryFallback!.projects.delete(id);
}

// ---------------- assets ----------------
async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store a file once; returns the "asset:<hash>" reference to put in the project. */
export async function putAsset(blob: Blob, name = ''): Promise<string> {
  const id = await sha256(blob);
  const rec: AssetRecord = { id, blob, type: blob.type || 'application/octet-stream', name, created: Date.now() };
  const s = await store('assets', 'readwrite');
  // Content-addressed: writing the same bytes again is a harmless no-op.
  if (s) await req(s.put(rec));
  else memoryFallback!.assets.set(id, rec);
  return `asset:${id}`;
}

export async function getAsset(ref: string): Promise<Blob | null> {
  const id = ref.replace(/^asset:/, '');
  const s = await store('assets', 'readonly');
  const rec: AssetRecord | undefined = s ? await req(s.get(id)) : memoryFallback!.assets.get(id);
  return rec?.blob ?? null;
}

const urlCache = new Map<string, Promise<string>>();
/** Turn any element src into something <img>/fetch can load. Object URLs are reused. */
export function resolveUrl(src: string): Promise<string> {
  if (!src.startsWith('asset:')) return Promise.resolve(src);
  let p = urlCache.get(src);
  if (!p) {
    p = getAsset(src).then((b) => {
      if (!b) throw new Error('A picture or sound used in this project is missing from this device.');
      return URL.createObjectURL(b);
    });
    urlCache.set(src, p);
    p.catch(() => urlCache.delete(src));
  }
  return p;
}

/** Ask the browser not to clear our data under storage pressure (important on iPhone). */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

// ---------------- project files (backup / share / move between devices) ----------------
function collectAssetRefs(p: Project): string[] {
  const refs = new Set<string>();
  for (const e of p.elements) if (e.kind === 'image' && e.src.startsWith('asset:')) refs.add(e.src);
  if (p.audio?.src.startsWith('asset:')) refs.add(p.audio.src);
  if (p.customHand?.src.startsWith('asset:')) refs.add(p.customHand.src);
  return [...refs];
}

async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function exportProjectFile(p: Project): Promise<Blob> {
  const assets: Record<string, { type: string; data: string }> = {};
  for (const ref of collectAssetRefs(p)) {
    const b = await getAsset(ref);
    if (b) assets[ref] = { type: b.type, data: await blobToBase64(b) };
  }
  return new Blob([JSON.stringify({ format: 'khatt-project', version: 1, project: p, assets })], { type: 'application/json' });
}

export async function importProjectFile(file: Blob, newId: () => string): Promise<Project> {
  let data: { format?: string; project?: Project; assets?: Record<string, { type: string; data: string }> };
  try { data = JSON.parse(await file.text()); } catch { throw new Error('This is not a Khatt project file.'); }
  if (data.format !== 'khatt-project' || !data.project || !Array.isArray(data.project.elements)) throw new Error('This is not a Khatt project file.');
  for (const [ref, a] of Object.entries(data.assets ?? {})) {
    const bin = atob(a.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stored = await putAsset(new Blob([bytes], { type: a.type }));
    if (stored !== ref) throw new Error('A file inside this project is damaged.');
  }
  // Import as a copy so it never overwrites a project already on this device.
  return { ...data.project, id: newId() };
}
