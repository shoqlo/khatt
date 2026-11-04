// Arabic -> English search terms. Pixabay's API has no Arabic language option and the
// icon names are English, so Arabic queries are mapped through this list.
// Words are matched after stripping the definite article and common suffixes.
export const AR_EN: Record<string, string> = {
  'بيت': 'home house', 'منزل': 'home house', 'مدرسة': 'school', 'طالب': 'student', 'طلاب': 'students',
  'معلم': 'teacher', 'مدرس': 'teacher', 'كتاب': 'book', 'كتب': 'books', 'قلم': 'pen pencil', 'ورقة': 'paper file',
  'سبورة': 'blackboard presentation', 'تعليم': 'education school', 'تعلم': 'learning education', 'جامعة': 'university school',
  'شهادة': 'certificate', 'تخرج': 'graduation school', 'درس': 'lesson book', 'سؤال': 'question help', 'جواب': 'answer check',
  'فكرة': 'idea bulb', 'مصباح': 'bulb lamp', 'عقل': 'brain', 'دماغ': 'brain', 'تفكير': 'thinking brain',
  'عمل': 'work business briefcase', 'شركة': 'company building business', 'مكتب': 'office desk', 'موظف': 'employee user',
  'فريق': 'team users', 'اجتماع': 'meeting users', 'مدير': 'manager user', 'عميل': 'customer user', 'زبون': 'customer user',
  'مال': 'money cash', 'نقود': 'money cash coin', 'دينار': 'currency coin', 'ريال': 'currency coin', 'دولار': 'dollar currency',
  'بنك': 'bank building', 'ربح': 'profit chart growth', 'خسارة': 'loss chart down', 'سعر': 'price tag', 'بيع': 'sale shopping',
  'شراء': 'shopping cart', 'متجر': 'shop store', 'سوق': 'market shop', 'سلة': 'basket cart', 'هدية': 'gift',
  'رسم': 'chart drawing', 'بياني': 'chart graph', 'مخطط': 'chart diagram', 'نمو': 'growth chart up', 'هدف': 'target goal',
  'نجاح': 'success trophy', 'كأس': 'trophy cup', 'جائزة': 'award trophy', 'نجمة': 'star', 'نجم': 'star',
  'وقت': 'time clock', 'ساعة': 'clock watch', 'تقويم': 'calendar', 'يوم': 'day calendar', 'موعد': 'appointment calendar',
  'هاتف': 'phone', 'جوال': 'mobile phone', 'حاسوب': 'computer laptop', 'كمبيوتر': 'computer', 'شاشة': 'screen monitor',
  'انترنت': 'internet world wifi', 'إنترنت': 'internet world wifi', 'بريد': 'mail email', 'رسالة': 'message mail',
  'محادثة': 'chat message', 'بحث': 'search', 'قفل': 'lock', 'أمان': 'security shield lock', 'حماية': 'shield protection',
  'سحابة': 'cloud', 'بيانات': 'data database', 'ملف': 'file document', 'مجلد': 'folder', 'صورة': 'photo image',
  'كاميرا': 'camera', 'فيديو': 'video', 'موسيقى': 'music', 'صوت': 'sound volume microphone', 'ميكروفون': 'microphone',
  'سيارة': 'car', 'حافلة': 'bus', 'طائرة': 'plane', 'قطار': 'train', 'سفينة': 'ship', 'دراجة': 'bike bicycle',
  'طريق': 'road', 'خريطة': 'map', 'موقع': 'location map pin', 'مدينة': 'city building', 'مسجد': 'mosque building',
  'سفر': 'travel plane', 'شمس': 'sun', 'قمر': 'moon', 'سماء': 'sky cloud', 'مطر': 'rain cloud', 'ثلج': 'snow',
  'نار': 'fire flame', 'ماء': 'water droplet', 'شجرة': 'tree', 'زهرة': 'flower', 'نبات': 'plant leaf', 'ورق': 'leaf paper',
  'جبل': 'mountain', 'بحر': 'sea wave', 'أرض': 'earth world globe', 'عالم': 'world globe', 'بيئة': 'environment leaf recycle',
  'قلب': 'heart', 'حب': 'love heart', 'صحة': 'health heart medical', 'طبيب': 'doctor medical stethoscope', 'مستشفى': 'hospital',
  'دواء': 'medicine pill', 'رياضة': 'sport ball', 'كرة': 'ball football', 'طعام': 'food', 'أكل': 'food eat',
  'قهوة': 'coffee cup', 'شاي': 'tea cup', 'تمر': 'date fruit', 'فاكهة': 'fruit apple', 'تفاحة': 'apple',
  'رجل': 'man user', 'امرأة': 'woman user', 'طفل': 'child baby', 'أطفال': 'children kids', 'عائلة': 'family users',
  'شخص': 'person user', 'ناس': 'people users', 'يد': 'hand', 'عين': 'eye', 'ابتسامة': 'smile mood',
  'سعيد': 'happy mood smile', 'حزين': 'sad mood', 'غاضب': 'angry mood', 'سهم': 'arrow', 'يمين': 'right arrow',
  'يسار': 'left arrow', 'أعلى': 'up arrow', 'أسفل': 'down arrow', 'دائرة': 'circle', 'مربع': 'square', 'مثلث': 'triangle',
  'صح': 'check', 'خطأ': 'x error', 'تحذير': 'alert warning', 'معلومة': 'info', 'إعدادات': 'settings', 'أداة': 'tool',
  'أدوات': 'tools', 'مفتاح': 'key', 'باب': 'door', 'نافذة': 'window', 'مصنع': 'factory building', 'طاقة': 'energy bolt battery',
  'كهرباء': 'electricity bolt', 'بطارية': 'battery', 'صاروخ': 'rocket', 'علم': 'science flask flag', 'مختبر': 'lab flask',
  'رياضيات': 'math calculator', 'حاسبة': 'calculator', 'لغة': 'language', 'ترجمة': 'translate language',
  'قانون': 'law scale', 'عدالة': 'justice scale', 'عقد': 'contract file', 'توقيع': 'signature', 'خبر': 'news',
  'إعلان': 'announcement speakerphone', 'تسويق': 'marketing speakerphone', 'اتصال': 'communication phone',
  'شبكة': 'network', 'تطبيق': 'app apps', 'برنامج': 'software code', 'برمجة': 'code programming', 'روبوت': 'robot',
  'ذكاء': 'brain robot ai', 'اصطناعي': 'ai robot', 'ضوء': 'light bulb', 'بناء': 'building construction',
  'سلم': 'stairs ladder', 'مشكلة': 'problem alert', 'حل': 'solution puzzle check', 'لغز': 'puzzle', 'خطة': 'plan list',
  'قائمة': 'list', 'مهمة': 'task checklist', 'تقرير': 'report file chart', 'عرض': 'presentation', 'مشروع': 'project briefcase',
};

const PREFIXES = ['وال', 'بال', 'كال', 'فال', 'لل', 'ال'];
const SUFFIXES = ['ات', 'ون', 'ين', 'ة', 'ه', 'ها'];

export function normalizeArabic(w: string): string {
  return w
    .replace(/[ً-ٰٟـ]/g, '') // harakat, tatweel
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

const NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(AR_EN).map(([k, v]) => [normalizeArabic(k), v]),
);

export function hasArabic(s: string): boolean {
  return /[؀-ۿ]/.test(s);
}

/** Translate an Arabic query into English search words; leaves other words untouched. */
export function toEnglishQuery(q: string): { query: string; unknown: string[] } {
  const out: string[] = [];
  const unknown: string[] = [];
  for (const raw of q.trim().split(/\s+/).filter(Boolean)) {
    if (!hasArabic(raw)) { out.push(raw.toLowerCase()); continue; }
    const w = normalizeArabic(raw);
    const candidates = new Set([w]);
    for (const p of PREFIXES) if (w.startsWith(normalizeArabic(p)) && w.length - p.length >= 2) candidates.add(w.slice(p.length));
    for (const c of Array.from(candidates)) for (const s of SUFFIXES) if (c.endsWith(s) && c.length - s.length >= 2) candidates.add(c.slice(0, -s.length));
    // ة is often written as ه, and stems may need ة back
    for (const c of Array.from(candidates)) candidates.add(c + 'ة');
    const hit = Array.from(candidates).map((c) => NORMALIZED[c]).find(Boolean);
    if (hit) out.push(hit.split(' ')[0]);
    else unknown.push(raw);
  }
  return { query: out.join(' '), unknown };
}
