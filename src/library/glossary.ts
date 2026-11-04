// Arabic -> English search terms. The bundled drawings and the open-image sites are
// indexed in English, so Arabic queries are translated word by word:
//   1. this hand-checked glossary (wins when present),
//   2. a ~3,000-word dictionary derived from Unicode CLDR emoji names (shipped in the library index).
export const AR_EN: Record<string, string> = {
  'بيت': 'home house', 'منزل': 'home house', 'مدرسة': 'school', 'طالب': 'student', 'طلاب': 'students',
  'معلم': 'teacher', 'مدرس': 'teacher', 'معلمة': 'teacher', 'كتاب': 'book', 'كتب': 'books', 'قلم': 'pen pencil', 'ورقة': 'paper file',
  'سبورة': 'blackboard presentation', 'تعليم': 'education school', 'تعلم': 'learning education', 'جامعة': 'university school',
  'شهادة': 'certificate', 'تخرج': 'graduation', 'درس': 'lesson book', 'سؤال': 'question help', 'جواب': 'answer check',
  'فكرة': 'idea bulb', 'مصباح': 'bulb lamp', 'عقل': 'brain', 'دماغ': 'brain', 'تفكير': 'thinking brain',
  'عمل': 'work business briefcase', 'شركة': 'company building business', 'مكتب': 'office desk', 'موظف': 'employee user',
  'فريق': 'team users', 'اجتماع': 'meeting users', 'مدير': 'manager user', 'عميل': 'customer user', 'زبون': 'customer user',
  'مال': 'money cash', 'نقود': 'money cash coin', 'دينار': 'currency coin', 'ريال': 'currency coin', 'دولار': 'dollar currency',
  'بنك': 'bank', 'ربح': 'profit chart growth', 'خسارة': 'loss chart down', 'سعر': 'price tag', 'بيع': 'sale shopping',
  'شراء': 'shopping cart', 'متجر': 'shop store', 'سوق': 'market shop', 'سلة': 'basket cart', 'هدية': 'gift',
  'رسم': 'chart drawing', 'بياني': 'chart graph', 'مخطط': 'chart diagram', 'نمو': 'growth chart', 'هدف': 'target goal',
  'نجاح': 'success trophy', 'كأس': 'trophy cup', 'جائزة': 'award trophy', 'نجمة': 'star', 'نجم': 'star',
  'وقت': 'time clock', 'ساعة': 'clock watch', 'تقويم': 'calendar', 'يوم': 'day calendar', 'موعد': 'appointment calendar',
  'هاتف': 'phone', 'جوال': 'mobile phone', 'حاسوب': 'computer laptop', 'كمبيوتر': 'computer', 'شاشة': 'screen monitor',
  'انترنت': 'internet world wifi', 'إنترنت': 'internet world wifi', 'بريد': 'mail email', 'رسالة': 'message mail',
  'محادثة': 'chat message', 'بحث': 'search', 'قفل': 'lock', 'أمان': 'security shield lock', 'حماية': 'shield protection',
  'سحابة': 'cloud', 'بيانات': 'data database', 'ملف': 'file document', 'مجلد': 'folder', 'صورة': 'photo image',
  'كاميرا': 'camera', 'فيديو': 'video', 'موسيقى': 'music', 'صوت': 'sound volume microphone', 'ميكروفون': 'microphone',
  'سيارة': 'car', 'حافلة': 'bus', 'طائرة': 'airplane plane', 'قطار': 'train', 'سفينة': 'ship', 'دراجة': 'bicycle bike',
  'طريق': 'road', 'خريطة': 'map', 'موقع': 'location map pin', 'مدينة': 'city building', 'مسجد': 'mosque',
  'سفر': 'travel airplane', 'شمس': 'sun', 'قمر': 'moon', 'سماء': 'sky cloud', 'مطر': 'rain cloud', 'ثلج': 'snow',
  'نار': 'fire flame', 'ماء': 'water droplet', 'شجرة': 'tree', 'زهرة': 'flower', 'نبات': 'plant leaf', 'ورق': 'leaf paper',
  'جبل': 'mountain', 'بحر': 'sea wave', 'أرض': 'earth world globe', 'عالم': 'world globe', 'بيئة': 'environment leaf recycle',
  'قلب': 'heart', 'حب': 'love heart', 'صحة': 'health heart medical', 'طبيب': 'doctor stethoscope', 'مستشفى': 'hospital',
  'دواء': 'medicine pill', 'رياضة': 'sport ball', 'كرة': 'ball football', 'طعام': 'food', 'أكل': 'food eat',
  'قهوة': 'coffee cup', 'شاي': 'tea cup', 'تمر': 'dates', 'فاكهة': 'fruit apple', 'تفاحة': 'apple',
  'رجل': 'man', 'امرأة': 'woman', 'طفل': 'child baby', 'أطفال': 'children kids', 'عائلة': 'family',
  'شخص': 'person user', 'ناس': 'people users', 'يد': 'hand', 'عين': 'eye', 'ابتسامة': 'smile',
  'سعيد': 'happy smile', 'سعادة': 'happy smile', 'حزين': 'sad', 'غاضب': 'angry', 'سهم': 'arrow', 'يمين': 'right arrow',
  'يسار': 'left arrow', 'أعلى': 'up arrow', 'أسفل': 'down arrow', 'دائرة': 'circle', 'مربع': 'square', 'مثلث': 'triangle',
  'صح': 'check', 'خطأ': 'error x', 'تحذير': 'warning alert', 'معلومة': 'info', 'إعدادات': 'settings', 'أداة': 'tool',
  'أدوات': 'tools', 'مفتاح': 'key', 'باب': 'door', 'نافذة': 'window', 'مصنع': 'factory', 'طاقة': 'energy bolt battery',
  'كهرباء': 'electricity bolt', 'بطارية': 'battery', 'صاروخ': 'rocket', 'علم': 'science flask', 'علوم': 'science flask', 'مختبر': 'lab flask',
  'رياضيات': 'math calculator', 'حاسبة': 'calculator', 'لغة': 'language', 'ترجمة': 'translate language',
  'قانون': 'law scale', 'عدالة': 'justice scale', 'عقد': 'contract file', 'توقيع': 'signature', 'خبر': 'news',
  'إعلان': 'announcement megaphone', 'تسويق': 'marketing megaphone', 'اتصال': 'communication phone',
  'شبكة': 'network', 'تطبيق': 'app', 'برنامج': 'software code', 'برمجة': 'code programming', 'روبوت': 'robot',
  'ذكاء': 'brain robot', 'اصطناعي': 'robot ai', 'ضوء': 'light bulb', 'بناء': 'building construction',
  'سلم': 'stairs ladder', 'مشكلة': 'problem alert', 'حل': 'solution puzzle', 'لغز': 'puzzle', 'خطة': 'plan list',
  'قائمة': 'list', 'مهمة': 'task checklist', 'تقرير': 'report chart', 'عرض': 'presentation', 'مشروع': 'project briefcase',
  'جمل': 'camel', 'قطة': 'cat', 'قط': 'cat', 'كلب': 'dog', 'حصان': 'horse', 'طير': 'bird', 'طائر': 'bird', 'سمكة': 'fish',
  'نخلة': 'palm tree', 'صحراء': 'desert', 'خيمة': 'tent', 'فانوس': 'lantern', 'هلال': 'crescent moon', 'رمضان': 'crescent moon lantern',
  'عيد': 'celebration gift', 'صلاة': 'pray', 'قرآن': 'book', 'كعبة': 'kaaba',
};

const PREFIXES = ['وبال', 'وال', 'بال', 'كال', 'فال', 'لل', 'ال', 'و', 'ب', 'ل'];
const SUFFIXES = ['ات', 'ون', 'ين', 'ان', 'ها', 'هم', 'ة', 'ه', 'ي'];

export function normalizeArabic(w: string): string {
  return w
    .replace(/[ً-ٰٟـ]/g, '') // harakat, tatweel
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

export function hasArabic(s: string): boolean {
  return /[؀-ۿ]/.test(s);
}

/** Normalised word plus plausible stems (article, conjunction, plural/feminine endings removed). */
export function arabicCandidates(raw: string): string[] {
  const w = normalizeArabic(raw);
  const out = [w];
  for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 2) out.push(w.slice(p.length));
  for (const c of [...out]) for (const s of SUFFIXES) if (c.endsWith(s) && c.length - s.length >= 2) out.push(c.slice(0, -s.length));
  for (const c of [...out]) if (!c.endsWith('ة')) out.push(c + 'ة'); // ة is often typed as ه or dropped
  return [...new Set(out)];
}

const MANUAL: Record<string, string> = Object.fromEntries(Object.entries(AR_EN).map(([k, v]) => [normalizeArabic(k), v]));

/** English words for one Arabic word ([] if unknown). */
export function translateArabicWord(raw: string, dict: Record<string, string> = {}): string[] {
  const cands = arabicCandidates(raw);
  for (const c of cands) if (MANUAL[c]) return MANUAL[c].split(' ');
  for (const c of cands) if (dict[c]) return dict[c].split(' ');
  return [];
}

/** Translate a whole query; English words pass through. `query` uses each word's best translation. */
export function toEnglishQuery(q: string, dict: Record<string, string> = {}): { query: string; unknown: string[] } {
  const out: string[] = [];
  const unknown: string[] = [];
  for (const raw of q.trim().split(/\s+/).filter(Boolean)) {
    if (!hasArabic(raw)) { out.push(raw.toLowerCase()); continue; }
    const tr = translateArabicWord(raw, dict);
    if (tr.length) out.push(tr[0]);
    else unknown.push(raw);
  }
  return { query: out.join(' '), unknown };
}
