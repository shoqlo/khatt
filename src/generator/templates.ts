// Ready-made scripts to start from in "Video from a script". One scene per paragraph.
// Written for Khatt (original text); the words are ones the drawing library knows, so the
// first draft gets fitting pictures. Users replace the details with their own.
import type { VideoType } from './script';

export interface ScriptTemplate { id: string; type: VideoType; ar: { name: string; text: string }; en: { name: string; text: string } }

export const TEMPLATES: ScriptTemplate[] = [
  {
    id: 'lesson-plant', type: 'lesson',
    ar: {
      name: 'درس: كيف تنمو النبتة',
      text: `كيف تنمو النبتة؟ لنكتشف ذلك معاً.

تبدأ النبتة بذرةً صغيرة تحت التربة.

تحتاج البذرة إلى الماء لتستيقظ وتنبت جذورها.

ثم تحتاج إلى ضوء الشمس لتصنع غذاءها في الأوراق.

ومع الوقت تكبر الساق وتظهر الزهرة.

تذكّر: الماء والشمس والتربة الجيدة هي سرّ نمو النبتة.`,
    },
    en: {
      name: 'Lesson: how a plant grows',
      text: `How does a plant grow? Let's find out together.

A plant starts as a small seed under the soil.

The seed needs water to wake up and grow roots.

Then the sun shines on the leaves, and they make food for the plant.

With time the stem grows taller and a flower opens.

Remember: water, sun and good soil are the secret of a growing plant.`,
    },
  },
  {
    id: 'explainer-delivery', type: 'explainer',
    ar: {
      name: 'شرح خدمة: توصيل الطلبات',
      text: `هل تضيّع وقتك في الانتظار؟

مع تطبيقنا اطلب ما تحتاجه من هاتفك في دقيقة واحدة.

نجهّز طلبك بعناية ونغلّفه في طرد محكم.

يصلك المندوب بالسيارة إلى باب بيتك في أقل من ساعة.

ادفع نقداً أو بالبطاقة، كما تحب.

اطلب الآن، وأول توصيل هدية منّا.`,
    },
    en: {
      name: 'Explain a service: delivery',
      text: `Tired of waiting in long queues?

With our app, order what you need from your phone in one minute.

We prepare your order with care and pack it in a package.

Our driver brings it by car to your door in less than an hour.

Pay in cash or by card, as you like.

Download the app now: your first delivery is our gift.`,
    },
  },
  {
    id: 'story-bird', type: 'story',
    ar: {
      name: 'قصة للأطفال: الولد والعصفور',
      text: `في قرية صغيرة عاش ولد طيب اسمه سالم.

في صباح يوم ممطر وجد سالم عصفوراً صغيراً سقط من عشّه.

حمل سالم العصفور بلطف ووضعه في صندوق دافئ.

أطعمه وسقاه الماء حتى عادت إليه قوته.

بعد أيام فتح سالم الصندوق، فطار العصفور فرحاً إلى الشجرة.

ومنذ ذلك اليوم صار العصفور يغرّد كل صباح عند نافذة سالم.`,
    },
    en: {
      name: "Children's story: the boy and the bird",
      text: `In a small village lived a kind boy called Salem.

One rainy morning Salem found a little bird that had fallen from its nest.

Salem picked up the bird gently and put it in a warm box.

He fed it and gave it water until it was strong again.

A few days later the bird was strong, and it flew happily up to the tree.

Since that day the bird sings every morning at Salem's window.`,
    },
  },
  {
    id: 'promo-offer', type: 'promo',
    ar: {
      name: 'إعلان: عرض لمطعم',
      text: `جائع؟ لدينا طعام يسعدك!

مطعمنا يقدّم همبرغر وسلطة طازجة كل يوم.

هذا الأسبوع فقط: خصم ٣٠٪ على وجبات العائلة.

اطلب الآن عبر الهاتف أو زرنا في وسط المدينة.

أسرع فالوقت يمضي: العرض ينتهي يوم الجمعة!`,
    },
    en: {
      name: 'Ad: restaurant offer',
      text: `Hungry? We have tasty food for you!

Our restaurant serves fresh burgers and salads every day.

This week only: 30% off every family meal.

Order now by phone or visit us in the city centre.

Hurry, the clock is ticking: the offer ends on Friday!`,
    },
  },
  {
    id: 'tips-money', type: 'lesson',
    ar: {
      name: 'نصائح: خمس طرق لتوفير المال',
      text: `خمس نصائح بسيطة لتوفير المال.

أولاً: اكتب خطة لمصاريفك في بداية كل شهر.

ثانياً: ادّخر جزءاً من راتبك قبل أن تبدأ بالصرف.

ثالثاً: قارن الأسعار قبل الشراء.

رابعاً: قلّل من الأكل خارج البيت.

خامساً: ضع هدفاً واضحاً، وراقب تقدّمك كل أسبوع.`,
    },
    en: {
      name: 'Tips: five ways to save money',
      text: `Five simple tips to save money.

First: write a spending plan in a notebook at the start of every month.

Second: put part of your salary in the bank before you spend.

Third: compare prices before you fill your shopping cart.

Fourth: cook at home more and eat out less.

Fifth: aim for a clear target, and check your progress every week.`,
    },
  },
  {
    id: 'about-us', type: 'explainer',
    ar: {
      name: 'تعريف: من نحن',
      text: `نحن فريق صغير بحلم كبير.

بدأنا قبل خمس سنوات بفكرة صغيرة.

اليوم نخدم أكثر من ألف عميل في كل المدن.

نعمل بجودة الخمس نجوم، وبصدق وسرعة.

اتصل بنا عبر الهاتف ودعنا نساعدك في مشروعك القادم.`,
    },
    en: {
      name: 'About us',
      text: `We are a team with a big dream.

We started five years ago with one small idea.

Today we serve more than a thousand customers in every city.

We give five-star quality, with honesty and speed.

Call us by phone and let us help with your next project.`,
    },
  },
];
