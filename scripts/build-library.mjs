// Builds the bundled drawing library into public/library/:
//   index.json      search index: sets (with licences), categories, items, Arabic dictionary
//   <set>/<n>.json  drawings, split into small chunks loaded only when shown
// Only sets whose licence allows bundling them in an app are used, and share-alike
// (CC BY-SA) sets are left out so customers' videos carry no share-alike obligation.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const req = createRequire(path.join(root, 'package.json'));
const OUT = path.join(root, 'public', 'library');
const CHUNK_BYTES = 40_000;

const BRANDS = /(^|-)(brand|logo|facebook|twitter|instagram|youtube|whatsapp|google|apple|android|github|gitlab|linkedin|wechat|weibo|qq|tiktok|douyin|snapchat|microsoft|windows|amazon|paypal|alipay|telegram|discord|slack|figma|dribbble|behance|pinterest|reddit|skype|spotify|netflix|uber|airbnb|chrome|firefox|safari|opera|ie|bilibili|zhihu|taobao|tmall|jd|baidu|dingding|feishu|douban|toutiao)(-|$)/;
const TONE = /-(light|medium-light|medium|medium-dark|dark)$/;

const SETS = [
  { id: 'freehand', pkg: '@iconify-json/streamline-freehand', name: 'Streamline Freehand', style: 'hand' },
  { id: 'fluent-line', pkg: '@iconify-json/fluent-emoji-high-contrast', name: 'Fluent Emoji (line)', style: 'line', emoji: true },
  { id: 'fluent-color', pkg: '@iconify-json/fluent-emoji-flat', name: 'Fluent Emoji (colour)', style: 'colour', emoji: true },
  { id: 'tabler', pkg: '@iconify-json/tabler', name: 'Tabler Icons', style: 'line', filter: (n) => !n.endsWith('-filled') },
  { id: 'iconpark', pkg: '@iconify-json/icon-park-outline', name: 'IconPark', style: 'line' },
  {
    id: 'health', pkg: '@iconify-json/healthicons', name: 'Healthicons', style: 'line',
    filter: (n, all) => n.endsWith('-outline') || (!all.has(`${n}-outline`) && !/-(negative|alt)(-|$)/.test(n)),
  },
];

const CATS = [
  ['people', 'People', 'أشخاص'], ['faces', 'Faces & feelings', 'وجوه ومشاعر'], ['hands', 'Hands & gestures', 'أيدٍ وإشارات'],
  ['business', 'Business & money', 'أعمال ومال'], ['education', 'Education & science', 'تعليم وعلوم'], ['health', 'Health', 'صحة'],
  ['food', 'Food & drink', 'طعام وشراب'], ['nature', 'Animals & nature', 'حيوانات وطبيعة'], ['weather', 'Weather & sky', 'طقس وسماء'],
  ['transport', 'Transport & travel', 'مواصلات وسفر'], ['places', 'Buildings & places', 'مبانٍ وأماكن'], ['tech', 'Technology', 'تقنية'],
  ['communication', 'Communication', 'تواصل'], ['time', 'Time & calendar', 'الوقت والتقويم'], ['ideas', 'Ideas & goals', 'أفكار وأهداف'],
  ['sports', 'Sports & fun', 'رياضة وترفيه'], ['home', 'Home & objects', 'المنزل والأدوات'], ['arrows', 'Arrows & shapes', 'أسهم وأشكال'],
  ['symbols', 'Symbols & signs', 'رموز وعلامات'], ['other', 'Other', 'أخرى'],
];
const catIndex = Object.fromEntries(CATS.map(([id], i) => [id, i]));
const w = (list) => new RegExp(`(^|-)(${list})(-|$)`);
const RULES = [
  ['hands', w('hand|hands|finger|fingers|thumb|thumbs|fist|palm|clap|clapping|handshake|pinch|pointing|point|raised-hand|waving|wave-hand|writing-hand|ok-hand|victory|gesture')],
  ['people', w('user|users|man|woman|men|women|person|people|boy|girl|child|children|kid|kids|baby|family|team|group|student|teacher|doctor|nurse|worker|elderly|old|adult|businessman|businesswoman|police|farmer|cook|judge|pilot|astronaut|firefighter|mechanic|scientist|artist|singer|technologist|guard|detective|prince|princess|bride|groom|avatar|customer|employee|crowd|couple|human|body|walking|running|standing|kneeling|beard|bald')],
  ['health', w('health|medical|medicine|hospital|doctor|nurse|pill|pills|capsule|syringe|vaccine|virus|bacteria|stethoscope|heart-rate|pulse|thermometer|first-aid|bandage|tooth|teeth|dental|blood|ambulance|wheelchair|mask|lungs|kidney|kidneys|liver|stomach|bone|bones|pregnant|clinic|pharmacy|dna|covid|disease|sick|injury|surgery|xray|x-ray|diagnosis|eye|ear|nose|microbe')],
  ['education', w('school|book|books|notebook|pen|pencil|pencils|graduation|graduate|diploma|certificate|classroom|blackboard|chalkboard|ruler|abacus|calculator|microscope|flask|test-tube|atom|science|math|maths|formula|backpack|library|compass|eraser|crayon|crayons|palette|brush|lesson|learn|learning|study|exam|quiz|alphabet|language|translate|teacher|student|university|college|education|knowledge|reading|write|writing|homework|paperclip|bookmark|telescope|magnet|chemistry|physics|biology|geometry')],
  ['business', w('money|coin|coins|cash|bank|dollar|euro|pound|yen|currency|credit|card|wallet|briefcase|business|chart|graph|analytics|report|invoice|receipt|tax|price|tag|shop|shopping|cart|store|sale|discount|percent|percentage|profit|growth|stock|market|accounting|finance|financial|budget|contract|meeting|presentation|office|work|job|portfolio|safe|piggy|investment|crypto|bitcoin|payment|pay|deal|agreement|ceo|manager|company|corporate|startup|strategy|statistics|pie|bar|trend')],
  ['food', w('food|drink|drinks|coffee|tea|cup|mug|apple|banana|orange|grapes|grape|pizza|burger|hamburger|bread|cake|cookie|candy|ice-cream|milk|bottle|juice|egg|eggs|cheese|meat|chicken|rice|soup|salad|carrot|tomato|vegetable|vegetables|fruit|fruits|lemon|cherry|cherries|strawberry|watermelon|pear|peach|date|dates|restaurant|fork|knife|spoon|chef|cooking|kitchen|bowl|plate|sandwich|taco|noodles|sushi|honey|chocolate|popcorn|donut|croissant|pepper|potato|corn|mushroom|avocado|coconut|mango|pineapple|melon|kiwi|olive|garlic|onion|cucumber|broccoli|baguette|pretzel|bacon|steak|shrimp|dumpling|cupcake|pie|pancakes|waffle|butter|salt|beverage|teapot')],
  ['nature', w('tree|trees|leaf|leaves|plant|plants|flower|flowers|seedling|cactus|palm-tree|forest|mountain|mountains|sea|ocean|river|lake|beach|desert|island|earth|planet|animal|animals|pet|pets|dog|cat|bird|fish|horse|camel|cow|sheep|goat|lion|tiger|bear|rabbit|mouse|rat|elephant|monkey|butterfly|bug|bee|ant|spider|snake|turtle|whale|dolphin|paw|feather|nature|recycle|eco|environment|wolf|fox|deer|pig|chicken|duck|owl|eagle|penguin|frog|crab|octopus|shark|squirrel|hedgehog|bat|dragon|unicorn|dinosaur|sprout|herb|rose|tulip|sunflower|blossom|mushroom|volcano|rock|stone|wood|log')],
  ['weather', w('sun|sunny|moon|star|stars|cloud|clouds|cloudy|rain|rainy|snow|snowflake|snowman|storm|thunder|lightning|wind|windy|fog|foggy|rainbow|umbrella|temperature|weather|sunrise|sunset|tornado|hail|drizzle|sky|comet|galaxy|milky|crescent|eclipse')],
  ['transport', w('car|cars|bus|train|tram|metro|subway|plane|airplane|flight|airport|bike|bicycle|motorcycle|scooter|truck|ship|boat|sailboat|anchor|rocket|helicopter|taxi|tractor|road|traffic|fuel|gas-station|parking|map|location|pin|route|navigation|travel|luggage|suitcase|ticket|passport|vehicle|transport|delivery|van|railway|station|ferry|canoe|kick-scooter|skateboard|wheel|steering|gps|direction|directions|signpost')],
  ['places', w('building|buildings|city|town|castle|mosque|kaaba|church|temple|synagogue|shrine|tent|camping|stadium|factory|warehouse|hotel|museum|bridge|tower|monument|park|garden|fountain|apartment|skyscraper|village|houses|hut|cottage|post-office|courthouse|government|pyramid|statue|landmark|carousel|ferris')],
  ['tech', w('computer|laptop|desktop|monitor|screen|device|devices|phone|mobile|smartphone|tablet|keyboard|mouse|printer|camera|video|tv|television|server|database|wifi|bluetooth|signal|network|internet|code|coding|program|programming|robot|chip|cpu|battery|plug|usb|cable|headphones|headphone|headset|microphone|speaker|gamepad|joystick|controller|vr|drone|satellite|antenna|download|upload|app|apps|browser|website|web|qr|barcode|ai|software|hardware|disk|floppy|cd|dvd|electric|electricity|power|bolt|cloud-computing|data|digital|online|pixel|cursor|click|touch|fingerprint|scan|scanner|projector|film|movie|clapper|record|radio')],
  ['communication', w('message|messages|mail|email|envelope|inbox|chat|comment|comments|bubble|speech|talk|call|megaphone|speakerphone|announcement|bell|notification|notifications|news|newspaper|share|send|letter|postbox|mailbox|contact|contacts|address|social|feedback|conversation|telephone|loudspeaker|broadcast|subscribe')],
  ['time', w('clock|time|timer|alarm|hourglass|stopwatch|calendar|schedule|history|watch|deadline|event|day|week|month|year|date-time|clock-history')],
  ['sports', w('sport|sports|ball|football|soccer|basketball|volleyball|tennis|golf|swim|swimming|gym|dumbbell|yoga|karate|boxing|game|games|chess|dice|playing-cards|music|musical|guitar|piano|drum|violin|trumpet|saxophone|party|celebration|balloon|confetti|fireworks|trophy|medal|ticket|theater|circus|kite|bowling|cricket|baseball|rugby|hockey|ski|skiing|surf|fishing|racing|cycling|run|running|marathon|whistle|stadium|ping-pong|badminton|martial|wrestling|joystick|puzzle-piece')],
  ['home', w('home|house|bed|sofa|couch|chair|table|lamp|door|key|lock|tools|tool|hammer|wrench|screwdriver|saw|paint-roller|broom|bucket|basket|box|package|gift|bag|clothes|shirt|t-shirt|dress|shoe|shoes|hat|cap|glasses|sunglasses|ring|toilet|bath|bathtub|shower|soap|towel|trash|bin|candle|mirror|scissors|vase|fridge|refrigerator|oven|washing|furniture|pillow|blanket|plug|socket|light|bulb-off|tie|coat|jacket|sock|gloves|scarf|backpack|purse|handbag|umbrella|needle|thread|magnifying|magnifier|glass|camera|frame|picture|photo|clipboard|calendar-event')],
  ['ideas', w('idea|ideas|bulb|lightbulb|brain|think|thinking|thought|puzzle|target|goal|goals|trophy|award|medal|crown|flag|plan|planning|innovation|creative|creativity|magic|wand|diamond|gem|success|win|winner|ladder|mission|vision|focus|insight|solution|question|inspiration|sparkle|sparkles|rocket')],
  ['arrows', w('arrow|arrows|chevron|chevrons|caret|circle|circles|square|squares|triangle|rectangle|polygon|hexagon|pentagon|octagon|shape|shapes|line|lines|curve|curved|dot|dots|heart|oval|cross|plus|minus|check|border|frame|grid|layout|bracket|brackets|spiral|zigzag|wave|loop|refresh|rotate|repeat|swap|exchange|corner|align|undo|redo|expand|collapse|maximize|minimize|move|drag')],
  ['symbols', w('symbol|sign|signs|warning|alert|info|information|question|exclamation|cancel|forbidden|prohibited|stop|copyright|trademark|registered|hash|hashtag|at|percent|infinity|peace|yin|religion|islam|star-and-crescent|om|radioactive|biohazard|male|female|accessibility|flag|flags|badge|certificate|verified|shield|security|lock|unlock|ban|block|error|success|help|support|settings|gear|cog|filter|search|zoom|home|menu|like|dislike|thumbs|vote|number|letter|emoji|bookmark|pin|label|tags|equal|divide|multiply|sum')],
];

function categorize(name, emoji) {
  if (emoji) {
    const g = emoji.group;
    if (g === 'Smileys & Emotion') return /heart|kiss-mark|anger|collision|dizzy|sweat-droplets|dashing|hole|speech|thought|zzz|bomb|hundred/.test(name) ? 'symbols' : 'faces';
    if (g === 'People & Body') return RULES[0][1].test(name) ? 'hands' : 'people';
    if (g === 'Animals & Nature') return 'nature';
    if (g === 'Food & Drink') return 'food';
    if (g === 'Travel & Places') {
      for (const id of ['transport', 'weather', 'time']) if (RULES.find((r) => r[0] === id)[1].test(name)) return id;
      return 'places';
    }
    if (g === 'Activities') return 'sports';
    if (g === 'Symbols') return RULES.find((r) => r[0] === 'arrows')[1].test(name) ? 'arrows' : 'symbols';
    if (g === 'Flags') return 'symbols';
  }
  for (const [id, re] of RULES) if (re.test(name)) return id;
  return emoji?.group === 'Objects' ? 'home' : 'other';
}

const emojiData = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/emoji-meta.json'), 'utf8'));
const emojiMeta = (name) => {
  const m = emojiData.emoji[name];
  return m ? { group: emojiData.groups[m.g], en: m.en, ar: m.ar } : null;
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const index = { v: 1, sets: [], cats: CATS.map(([id, en, ar]) => ({ id, en, ar })), items: [], dict: JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/ar-en.json'), 'utf8')) };
let totalBytes = 0;
const perCat = new Map();

for (const set of SETS) {
  const icons = req(`${set.pkg}/icons.json`);
  const info = req(`${set.pkg}/info.json`);
  if (/SA|NC|ND/.test(info.license.spdx || info.license.title)) throw new Error(`${set.id}: licence ${info.license.title} not allowed`);
  const all = new Set(Object.keys(icons.icons));
  const names = [...all].filter((n) => !BRANDS.test(n) && !(TONE.test(n) && all.has(n.replace(TONE, ''))) && (!set.filter || set.filter(n, all)));
  const rows = names.map((n) => {
    const em = set.emoji ? emojiMeta(n) : null;
    return { n, cat: categorize(n, em), em, icon: icons.icons[n] };
  }).sort((a, b) => catIndex[a.cat] - catIndex[b.cat] || a.n.localeCompare(b.n));
  const setIdx = index.sets.length;
  const W = icons.width ?? 16, H = icons.height ?? 16;
  fs.mkdirSync(path.join(OUT, set.id));
  let chunk = {}, chunkNo = 0, bytes = 0;
  const flush = () => {
    if (!Object.keys(chunk).length) return;
    const s = JSON.stringify(chunk);
    fs.writeFileSync(path.join(OUT, set.id, `${chunkNo}.json`), s);
    totalBytes += s.length;
    chunk = {}; chunkNo++; bytes = 0;
  };
  for (const r of rows) {
    const body = r.icon.body;
    const iw = r.icon.width ?? W, ih = r.icon.height ?? H;
    chunk[r.n] = iw === W && ih === H ? body : [body, iw, ih];
    bytes += body.length;
    const item = [setIdx, r.n, catIndex[r.cat], chunkNo];
    if (r.em) item.push(r.em.en, r.em.ar);
    index.items.push(item);
    perCat.set(r.cat, (perCat.get(r.cat) ?? 0) + 1);
    if (bytes > CHUNK_BYTES) flush();
  }
  flush();
  index.sets.push({
    id: set.id, name: set.name, style: set.style, w: W, h: H, count: rows.length,
    license: info.license.spdx || info.license.title, licenseUrl: info.license.url,
    author: info.author?.name, authorUrl: info.author?.url,
  });
  console.log(`${set.id.padEnd(13)} ${String(rows.length).padStart(5)} drawings, ${chunkNo} chunks, ${info.license.spdx || info.license.title}`);
}
const indexJson = JSON.stringify(index);
fs.writeFileSync(path.join(OUT, 'index.json'), indexJson);
console.log(`total ${index.items.length} drawings; drawings ${(totalBytes / 1e6).toFixed(1)} MB; index ${(indexJson.length / 1e3).toFixed(0)} KB`);
console.log([...perCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join('  '));
