export type Lang = 'ar' | 'en';

const en = {
  appName: 'Khatt', untitled: 'Untitled', new: 'New', open: 'Open', saved: 'Saved', saving: 'Saving…', saveFailed: 'Not saved (offline) — kept in this browser',
  undo: 'Undo', redo: 'Redo', export: 'Export', lang: 'العربية',
  icons: 'Drawings', pixabay: 'Pixabay', text: 'Text', upload: 'Upload', audio: 'Audio',
  searchIcons: 'Search drawings (Arabic or English)…', searchPixabay: 'Search Pixabay (Arabic or English)…',
  searchedAs: 'Searched as', unknownWords: 'No translation for', noResults: 'No results',
  pixabayOff: 'Pixabay is off. Get a free API key at pixabay.com/api/docs, put PIXABAY_API_KEY=… in the .env file and restart the server.',
  pixabayHint: 'Illustrations and vectors draw best. Photos are sketched first, then coloured in.',
  illustration: 'Illustrations', vector: 'Vectors', photo: 'Photos', all: 'All', more: 'More',
  addText: 'Add text to board', font: 'Font', size: 'Size', colour: 'Colour', align: 'Align',
  alignStart: 'Start', alignCenter: 'Centre', alignEnd: 'End',
  uploadHint: 'Images (PNG, JPG, WebP) or SVG line art. SVG strokes draw best.', chooseFile: 'Choose file',
  voice: 'Voice-over / music', record: 'Record', stop: 'Stop', remove: 'Remove', fitAudio: 'Fit timing to audio',
  volume: 'Volume', noAudio: 'No audio yet',
  play: 'Play', pause: 'Pause', fromSelected: 'Play from selected',
  project: 'Project', element: 'Element', hand: 'Hand', background: 'Board colour', endHold: 'Hold at end (s)',
  handRight: 'Hand – right', handLeft: 'Hand – left', penOnly: 'Pen only', noHand: 'No hand', customHand: 'Custom hand image',
  tipX: 'Pen tip X (px)', tipY: 'Pen tip Y (px)', handScale: 'Hand scale',
  name: 'Name', reveal: 'Animation', draw: 'Draw', fade: 'Fade in', moveIn: 'Move in', none: 'Appear',
  direction: 'Drawing direction', ltr: 'Left → right', rtl: 'Right → left',
  transition: 'Camera move (s)', animate: 'Draw time (s)', pauseT: 'Pause (s)',
  scale: 'Scale', rotation: 'Rotation', opacity: 'Opacity', strokeWidth: 'Line width', colourOverride: 'Line colour',
  camera: 'Camera', setCamera: 'Use current view', autoCamera: 'Auto-frame', cameraAuto: 'auto', cameraSet: 'set',
  hideHand: 'Hide hand for this element', del: 'Delete', duplicate: 'Duplicate', moveEarlier: 'Earlier', moveLater: 'Later',
  credit: 'Credit', exportTitle: 'Export video', format: 'Format', resolution: 'Resolution', fps: 'Frame rate',
  start: 'Start export', cancel: 'Cancel', close: 'Close', download: 'Download', subtitles: 'Download subtitles (.srt)',
  exporting: 'Exporting…', done: 'Done', total: 'Total',
  emptyBoard: 'Add a drawing, image or text from the left panel.',
  stageHelp: 'Drag to move · wheel to zoom · drag empty space to pan',
  projects: 'Projects', delProject: 'Delete project', confirmDelete: 'Delete this project?',
  textPlaceholder: 'اكتب هنا… / Type here…',
};

const ar: typeof en = {
  appName: 'خط', untitled: 'بدون عنوان', new: 'جديد', open: 'فتح', saved: 'تم الحفظ', saving: 'جارٍ الحفظ…', saveFailed: 'لم يُحفظ (بلا اتصال) — محفوظ في المتصفح',
  undo: 'تراجع', redo: 'إعادة', export: 'تصدير', lang: 'English',
  icons: 'رسومات', pixabay: 'Pixabay', text: 'نص', upload: 'رفع', audio: 'صوت',
  searchIcons: 'ابحث في الرسومات (عربي أو إنجليزي)…', searchPixabay: 'ابحث في Pixabay (عربي أو إنجليزي)…',
  searchedAs: 'تم البحث عن', unknownWords: 'لا توجد ترجمة لـ', noResults: 'لا نتائج',
  pixabayOff: 'Pixabay غير مفعّل. احصل على مفتاح مجاني من pixabay.com/api/docs وضع PIXABAY_API_KEY=… في ملف ‎.env ثم أعد تشغيل الخادم.',
  pixabayHint: 'الرسوم التوضيحية والمتجهات ترسم بشكل أفضل. الصور تُرسم كخطوط أولاً ثم تُلوَّن.',
  illustration: 'رسوم توضيحية', vector: 'متجهات', photo: 'صور', all: 'الكل', more: 'المزيد',
  addText: 'أضف النص إلى اللوحة', font: 'الخط', size: 'الحجم', colour: 'اللون', align: 'المحاذاة',
  alignStart: 'البداية', alignCenter: 'الوسط', alignEnd: 'النهاية',
  uploadHint: 'صور (PNG أو JPG أو WebP) أو رسومات SVG خطية. خطوط SVG ترسم بشكل أفضل.', chooseFile: 'اختر ملفاً',
  voice: 'تعليق صوتي / موسيقى', record: 'تسجيل', stop: 'إيقاف', remove: 'إزالة', fitAudio: 'اضبط التوقيت على طول الصوت',
  volume: 'مستوى الصوت', noAudio: 'لا يوجد صوت بعد',
  play: 'تشغيل', pause: 'إيقاف مؤقت', fromSelected: 'تشغيل من العنصر المحدد',
  project: 'المشروع', element: 'العنصر', hand: 'اليد', background: 'لون اللوحة', endHold: 'مدة الثبات في النهاية (ث)',
  handRight: 'يد – يمنى', handLeft: 'يد – يسرى', penOnly: 'قلم فقط', noHand: 'بدون يد', customHand: 'صورة يد مخصصة',
  tipX: 'رأس القلم X (بكسل)', tipY: 'رأس القلم Y (بكسل)', handScale: 'حجم اليد',
  name: 'الاسم', reveal: 'الحركة', draw: 'رسم', fade: 'ظهور تدريجي', moveIn: 'دخول', none: 'ظهور فوري',
  direction: 'اتجاه الرسم', ltr: 'من اليسار ← لليمين', rtl: 'من اليمين ← لليسار',
  transition: 'حركة الكاميرا (ث)', animate: 'مدة الرسم (ث)', pauseT: 'توقف (ث)',
  scale: 'الحجم', rotation: 'الدوران', opacity: 'الشفافية', strokeWidth: 'سماكة الخط', colourOverride: 'لون الخط',
  camera: 'الكاميرا', setCamera: 'استخدم العرض الحالي', autoCamera: 'تأطير تلقائي', cameraAuto: 'تلقائي', cameraSet: 'مضبوطة',
  hideHand: 'إخفاء اليد لهذا العنصر', del: 'حذف', duplicate: 'تكرار', moveEarlier: 'أبكر', moveLater: 'لاحقاً',
  credit: 'المصدر', exportTitle: 'تصدير الفيديو', format: 'الصيغة', resolution: 'الدقة', fps: 'معدل الإطارات',
  start: 'ابدأ التصدير', cancel: 'إلغاء', close: 'إغلاق', download: 'تنزيل', subtitles: 'تنزيل الترجمة (‎.srt)',
  exporting: 'جارٍ التصدير…', done: 'تم', total: 'المجموع',
  emptyBoard: 'أضف رسماً أو صورة أو نصاً من اللوحة الجانبية.',
  stageHelp: 'اسحب للتحريك · العجلة للتكبير · اسحب الفراغ لتحريك العرض',
  projects: 'المشاريع', delProject: 'حذف المشروع', confirmDelete: 'حذف هذا المشروع؟',
  textPlaceholder: 'اكتب هنا… / Type here…',
};

export type Key = keyof typeof en;
const tables = { en, ar };

let lang: Lang = (() => {
  try {
    const saved = localStorage.getItem('khatt.lang');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* storage blocked */ }
  return navigator.language?.startsWith('ar') ? 'ar' : 'en';
})();

export const t = (k: Key): string => tables[lang][k];
export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem('khatt.lang', l); } catch { /* ignore */ }
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
}
