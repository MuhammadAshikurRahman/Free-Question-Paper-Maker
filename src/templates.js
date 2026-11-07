// HTML builders for the paper. The editor stores the paper as plain HTML.

export const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ---------- small pieces ----------
export const p = (t = '') => `<p>${t ? esc(t) : '<br>'}</p>`;

export const ol = (kind, items) =>
  `<ol class="ol-${kind}" data-kind="${kind}">${items
    .map((i) => `<li>${esc(i)}</li>`)
    .join('')}</ol>`;

// ---------- blocks ----------
export const q = (body = '', marks = '') =>
  `<div class="blk q" data-blk="q">` +
  `<span class="qno" contenteditable="false"></span>` +
  `<input class="qmark" lang="en" type="text" placeholder="নম্বর" aria-label="নম্বর" value="${esc(marks)}">` +
  `<div class="host qbody" contenteditable="true" data-ph="এখানে প্রশ্ন লিখুন...">${body || '<p><br></p>'}</div>` +
  `</div>`;

export const sec = (text = '') =>
  `<div class="blk sec" data-blk="sec">` +
  `<div class="host line" contenteditable="true" data-ph="বিভাগের নাম, যেমন: ক বিভাগ">${esc(text)}</div>` +
  `</div>`;

export const note = (body = '') =>
  `<div class="blk note" data-blk="note">` +
  `<div class="host" contenteditable="true" data-ph="এখানে নির্দেশনা বা যেকোনো লেখা লিখুন...">${body || '<p><br></p>'}</div>` +
  `</div>`;

// সৃজনশীল প্রশ্ন: উদ্দীপক + ক, খ, গ, ঘ (নম্বর ১, ২, ৩, ৪) = মোট ১০
export const creative = () =>
  q(
    p('উদ্দীপকটি পড় এবং প্রশ্নের উত্তর দাও :') +
      p('উদ্দীপক :') +
      p('') +
      ol('bn', ['প্রশ্ন লিখুন (১)', 'প্রশ্ন লিখুন (২)', 'প্রশ্ন লিখুন (৩)', 'প্রশ্ন লিখুন (৪)']),
    '১০'
  );

// ---------- উত্তরপত্রের ঘর: নাম, রোল, শাখা (হেডারের নিচে, চালু করলে) ----------
export const answerRow = () =>
  `<div class="ansrow" contenteditable="false">` +
  `<span class="af af-name"><span class="lb bn">নাম :</span><span class="fill"></span></span>` +
  `<span class="af af-sec"><span class="lb bn">শাখা :</span><span class="fill"></span></span>` +
  `<span class="af af-roll"><span class="lb bn">রোল :</span><span class="fill"></span></span>` +
  `</div>`;

// ---------- MCQ এর OMR বৃত্ত শীট: রোল, রেজিস্ট্রেশন নম্বর ও প্রশ্নের উত্তর ----------
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const bnNum = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);
const clampInt = (v, min, max, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

// one column of digit bubbles 0-9 (a box on top to write the digit)
const digitCols = (n) => {
  let out = '';
  for (let c = 0; c < n; c += 1) {
    out +=
      `<div class="omr-col"><span class="omr-box"></span>` +
      BN_DIGITS.map((d, i) => `<span class="bub" data-v="${i}">${d}</span>`).join('') +
      `</div>`;
  }
  return out;
};

export const omr = (opts = {}) => {
  const q = clampInt(opts.q, 1, 100, 20);
  const roll = clampInt(opts.roll, 1, 10, 6);
  const reg = clampInt(opts.reg, 1, 12, 8);
  const letters = ['ক', 'খ', 'গ', 'ঘ']; // the MCQ bubbles are always ক, খ, গ, ঘ (4 options)
  let qs = '';
  for (let i = 1; i <= q; i += 1) {
    qs +=
      `<div class="omr-q"><span class="omr-n">${bnNum(i)}.</span>` +
      letters.map((L) => `<span class="bub" data-v="${L}">${L}</span>`).join('') +
      `</div>`;
  }
  return (
    `<div class="blk omr" data-blk="omr">` +
    `<div class="host line omr-title" contenteditable="true" data-ph="শিরোনাম, যেমন: বহুনির্বাচনী প্রশ্নের উত্তরপত্র">বহুনির্বাচনী প্রশ্নের উত্তরপত্র</div>` +
    `<div class="omr-body" contenteditable="false">` +
    `<p class="omr-note">বৃত্ত সম্পূর্ণ ভরাট করো। ভুল হলে বৃত্তটি কেটে নতুন বৃত্ত ভরাট করো।</p>` +
    `<div class="omr-top">` +
    `<div class="omr-part"><div class="omr-lbl">রোল নম্বর</div><div class="omr-cols">${digitCols(roll)}</div></div>` +
    `<div class="omr-part"><div class="omr-lbl">রেজিস্ট্রেশন নম্বর</div><div class="omr-cols">${digitCols(reg)}</div></div>` +
    `</div>` +
    `<div class="omr-lbl">উত্তর</div>` +
    `<div class="omr-qs">${qs}</div>` +
    `</div></div>`
  );
};

export const BLOCKS = { q, sec, note, cq: creative, omr };

// ---------- header ----------
const line = (cls, ph, text = '') =>
  `<div class="host line ${cls}" contenteditable="true" data-ph="${esc(ph)}">${esc(text)}</div>`;

const meta = (bn, en, ph, text = '', total = false) =>
  `<div class="mrow"><span class="lb bn">${bn} :</span><span class="lb en">${en} :</span> ` +
  `<span class="host line val" contenteditable="true" data-ph="${esc(ph)}"${total ? ' data-total="1"' : ''}>${esc(text)}</span></div>`;

// ক / খ সেট: হেডারের উপরে ডানে বক্স, চালু থাকলেই দেখা যাবে
export const setBox = (text = '') =>
  `<div class="setbox" contenteditable="false"><span class="lb bn">সেট :</span> ` +
  `<span class="host line val" contenteditable="true" data-ph="সেট">${esc(text)}</span></div>`;

// Layout follows the school's own paper: name / section / exam centred,
// then Subject, Class, Time on the left and Full Marks on the right.
export const header = (v = {}) =>
  `<div class="hdr" data-sets="0">` +
  setBox(v.set) +
  line('c-big', 'বিদ্যালয়ের নাম লিখুন', v.school) +
  line('c-mid', 'সেকশন / শাখা (ঐচ্ছিক)', v.section) +
  line('c-mid', 'পরীক্ষার নাম, যেমন: অর্ধবার্ষিক পরীক্ষা, ২০২৬', v.exam) +
  `<div class="meta">` +
  `<div class="mleft">` +
  meta('বিষয়', 'Subject', 'বিষয়', v.subject) +
  meta('শ্রেণি', 'Class', 'শ্রেণি', v.cls) +
  meta('সময়', 'Time', 'সময়', v.time) +
  `</div>` +
  `<div class="mright">` +
  meta('পূর্ণমান', 'Full Marks', 'মোট', v.total, true) +
  `</div></div></div>`;

// ---------- whole documents ----------
export const blankDoc = () =>
  header() + `<div class="blocks">${q()}</div>`;

export const sampleDoc = () =>
  header({
    school: 'তানযীমুল উম্মাহ হিফয মাদ্রাসা, ময়মনসিংহ শাখা',
    section: 'নাহা রোড সেকশন',
    exam: 'অর্ধবার্ষিক পরীক্ষা, ২০২৬',
    subject: 'বাংলা',
    cls: 'তৃতীয়',
    time: '২ঃ৩০ ঘণ্টা',
    total: '৮০',
  }) +
  `<div class="blocks">` +
  q(
    p('শব্দার্থ লিখ ( যেকোনো ১০ টি )') +
      p('আলসে, সিপাই, কেল্লা, গম্বুজ, গুজব, উঁকি দেওয়া, মিনার, কিরণ, আত্মীয়, বাদল, উৎকন্ঠা, বিখ্যাত, তীব্রবেগে।'),
    '১×১০ = ১০'
  ) +
  q(
    p('প্রশ্নোত্তর লিখ ( যেকোনো ৩ টি )') +
      ol('bn', [
        'নোমান স্যার কিভাবে বুঝলেন রাশেদ মেধাবী ?',
        'কার জাগার আগে খোকা জেগে উঠতে চায়?',
        'তিথি কেন পাখিদের কথা ভাবছিল?',
        'গ্রামের গাছপালা দেখে কী মনে হয়?',
        'খেলা শেষে হেড স্যার কি বললেন?',
      ]),
    '৫×৩ = ১৫'
  ) +
  q(
    p('বাক্য গঠন কর ( যেকোনো ৫ টি )') + p('প্রতিবেশী, মেধাবী, প্রাচীন, সাহায্য, বরণ, অলস, ঝলমল'),
    '১×৫ = ৫'
  ) +
  q(
    p('যুক্তবর্ণ আলাদা কর ও ১ টি শব্দ গঠন কর ( যেকোনো ৫ টি )') + p('ল্প, ক্ষ, ন্ট, ম্ব, ষ্ট, ন্ত, ত্ব'),
    '১×৫ = ৫'
  ) +
  q(
    p('কবিতা লিখ ( কবিতা ও কবির নাম সহ ১০ লাইন ) যেকোনো ১ টি') + ol('bn', ['আমি হব', 'হাসি']),
    '১×১০ = ১০'
  ) +
  q(
    p('শূন্যস্থান পূরণ কর ( যেকোনো ৫ টি )') +
      ol('bn', [
        'সুপারি গাছের সারি দিয়ে উঁকি দেয় সকালের ………।',
        'স্যার বুঝেছিলেন ছেলেটা অত্যন্ত ………।',
        '……… বাংলা বছরের প্রথম দিন।',
        'খেলার উত্তেজনায় ……… সবাই করতে লাগলো।',
        'কৃষক মাঠে ……… ফলান।',
        'রঙিন কাগজ দিয়ে ……… সাজানো হয়েছে।',
        'সন্ধ্যায় প্রদীপ ……… হয়।',
      ]),
    '১×৫ = ৫'
  ) +
  q(
    p('সংজ্ঞা লিখ উদাহরণ সহ ( যেকোনো ৩ টি )') +
      ol('bn', ['ভাষা কাকে বলে ?', 'ব্যাকরণ কাকে বলে ?', 'বর্ণ কাকে বলে ?', 'শব্দ কাকে বলে ?', 'বাক্য কাকে বলে ?']),
    '৩×৩ = ৯'
  ) +
  q(
    p('পত্র / আবেদন পত্র লিখ ( যেকোনো ১ টি )') +
      ol('bn', ['টাকা চেয়ে পিতার নিকট পত্র লিখ।', 'অনুপস্থিতির জন্য ছুটি চেয়ে অধ্যক্ষের নিকট আবেদন পত্র লিখ।']),
    '১×৬ = ৬'
  ) +
  q(p('রচনা ( যেকোনো ১ টি )') + ol('bn', ['আমাদের মাদ্রাসা', 'চরিত্র']), '১×১০ = ১০') +
  q(
    p('নিম্নোক্ত ৫ টি বাক্য সুন্দর করে লিখ।') +
      p('মিতু আমাদের প্রতিবেশী। মিতুরা দুই বোন। বড় বোন হাই স্কুলে পড়ে। তিনি আমাদের খুব আদর করেন। বড় হয়ে আমি সেই স্কুলে পড়ব।'),
    '১×৫ = ৫'
  ) +
  `</div>`;