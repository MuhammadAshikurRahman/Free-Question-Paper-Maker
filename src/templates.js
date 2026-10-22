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
  `<input class="qmark" type="text" placeholder="নম্বর" aria-label="নম্বর" value="${esc(marks)}">` +
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

export const BLOCKS = { q, sec, note };

// ---------- header ----------
const line = (cls, ph, text = '') =>
  `<div class="host line ${cls}" contenteditable="true" data-ph="${esc(ph)}">${esc(text)}</div>`;

const meta = (bn, en, ph, text = '', total = false) =>
  `<div class="mrow"><span class="lb bn">${bn} :</span><span class="lb en">${en} :</span> ` +
  `<span class="host line val" contenteditable="true" data-ph="${esc(ph)}"${total ? ' data-total="1"' : ''}>${esc(text)}</span></div>`;

// Layout follows the school's own paper: name / section / exam centred,
// then Subject, Class, Time on the left and Full Marks on the right.
export const header = (v = {}) =>
  `<div class="hdr">` +
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

  