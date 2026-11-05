import type { FontId } from './types';
import type { HbFont, HbModule } from './text';
import amiriUrl from '@expo-google-fonts/amiri/400Regular/Amiri_400Regular.ttf?url';
import amiriBoldUrl from '@expo-google-fonts/amiri/700Bold/Amiri_700Bold.ttf?url';
import cairoUrl from '@expo-google-fonts/cairo/600SemiBold/Cairo_600SemiBold.ttf?url';
import ruqaaUrl from '@expo-google-fonts/aref-ruqaa/400Regular/ArefRuqaa_400Regular.ttf?url';
import kufiUrl from '@expo-google-fonts/reem-kufi/400Regular/ReemKufi_400Regular.ttf?url';
import lalezarUrl from '@expo-google-fonts/lalezar/400Regular/Lalezar_400Regular.ttf?url';
import tajawalUrl from '@expo-google-fonts/tajawal/700Bold/Tajawal_700Bold.ttf?url';

// All SIL Open Font License; all cover Arabic and Latin. Loaded only when used.
export const FONTS: Record<FontId, { label: string; url: string }> = {
  amiri: { label: 'Amiri · نسخ', url: amiriUrl },
  'amiri-bold': { label: 'Amiri Bold · نسخ عريض', url: amiriBoldUrl },
  ruqaa: { label: 'Aref Ruqaa · رقعة (خط اليد)', url: ruqaaUrl },
  kufi: { label: 'Reem Kufi · كوفي', url: kufiUrl },
  cairo: { label: 'Cairo · حديث', url: cairoUrl },
  tajawal: { label: 'Tajawal · بسيط عريض', url: tajawalUrl },
  lalezar: { label: 'Lalezar · عناوين', url: lalezarUrl },
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
