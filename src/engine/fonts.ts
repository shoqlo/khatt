import type { FontId } from './types';
import type { HbFont, HbModule } from './text';
import amiriUrl from '@expo-google-fonts/amiri/400Regular/Amiri_400Regular.ttf?url';
import amiriBoldUrl from '@expo-google-fonts/amiri/700Bold/Amiri_700Bold.ttf?url';
import cairoUrl from '@expo-google-fonts/cairo/600SemiBold/Cairo_600SemiBold.ttf?url';

// Both fonts are SIL Open Font License; both cover Arabic and Latin.
export const FONTS: Record<FontId, { label: string; url: string }> = {
  amiri: { label: 'Amiri (نسخ)', url: amiriUrl },
  'amiri-bold': { label: 'Amiri Bold', url: amiriBoldUrl },
  cairo: { label: 'Cairo', url: cairoUrl },
};

export interface LoadedFont { hb: HbModule; font: HbFont; upem: number }

let hbPromise: Promise<typeof import('harfbuzzjs')> | null = null;
const loaded = new Map<FontId, Promise<LoadedFont>>();

export function getFont(id: FontId): Promise<LoadedFont> {
  let p = loaded.get(id);
  if (!p) {
    p = (async () => {
      hbPromise ??= import('harfbuzzjs');
      const hb = await hbPromise;
      const buf = await (await fetch(FONTS[id].url)).arrayBuffer();
      const face = new hb.Face(new hb.Blob(buf));
      return { hb: hb as unknown as HbModule, font: new hb.Font(face) as unknown as HbFont, upem: face.upem };
    })();
    loaded.set(id, p);
  }
  return p;
}
