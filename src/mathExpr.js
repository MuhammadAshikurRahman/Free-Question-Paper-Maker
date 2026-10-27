// mathExpr.js
// The "সমীকরণ" (equation) kind of the math box: fractions, roots, brackets, powers and subscripts, one inside another.
//
// The teacher builds it with buttons that put a template in the box, for example  \frac{ }{ }  for a fraction.
// Anything can go inside any { } part, so  \frac{(a+b)^2}{\sqrt{\frac{c}{d}}}  works.
//   \frac{লব}{হর}      fraction            \sqrt{...}  root       \sqrt[3]{...}  3rd root
//   ( ... ) [ ... ]    brackets            ^{...}  power          _{...}  subscript
//   \overline{...}  line above    \underline{...}  line under    \vec{...}  arrow above
//   \sum \prod \int \oint \lim  and  \pi \theta \times \le \ge ...  (see SYM)

const MAX_LEN = 900;
const MAX_DEPTH = 24;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SYM = {
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', circ: '°', degree: '°', prime: '′',
  pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', lambda: 'λ', mu: 'μ',
  sigma: 'σ', Sigma: 'Σ', omega: 'ω', Omega: 'Ω', phi: 'φ', rho: 'ρ', tau: 'τ',
  infty: '∞', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼',
  angle: '∠', triangle: '△', perp: '⊥', parallel: '∥', therefore: '∴', because: '∵',
  rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔', leftrightarrow: '↔',
  partial: '∂', nabla: '∇', in: '∈', notin: '∉', cup: '∪', cap: '∩', subset: '⊂', subseteq: '⊆', emptyset: '∅',
  forall: '∀', exists: '∃', ldots: '…', cdots: '⋯',
  int: '∫', oint: '∮', sum: '∑', prod: '∏',
};
const BIG = new Set(['∫', '∮', '∑', '∏']);
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lim', 'exp', 'max', 'min']);

const isDigit = (c) => /[0-9\u09E6-\u09EF]/.test(c);

function nextGrapheme(s, i) {
  const rest = s.slice(i, i + 16);
  if (!rest) return '';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const it = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(rest)[Symbol.iterator]().next();
    if (!it.done) return it.value.segment;
  }
  return Array.from(rest)[0];
}

function lastGrapheme(s) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segs = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s));
    return segs.length ? segs[segs.length - 1].segment : '';
  }
  return Array.from(s).slice(-1)[0] || '';
}

const txt = (s) => ({ t: 'txt', s });
function pushText(out, s) {
  const last = out[out.length - 1];
  if (last && last.t === 'txt') last.s += s;
  else out.push(txt(s));
}

// ^ and _ belong to the thing just before them (the last letter when it is plain text)
function attach(out, which, arg) {
  let base = out.pop();
  if (base && base.t === 'txt') {
    const g = lastGrapheme(base.s);
    const rest = base.s.slice(0, base.s.length - g.length);
    if (rest) out.push(txt(rest));
    if (g.trim() === '') {
      if (g) out.push(txt(g));
      base = null;
    } else {
      base = txt(g);
    }
  }
  if (base && base.t === 'script' && !base[which]) {
    base[which] = arg;
    out.push(base);
    return;
  }
  out.push({ t: 'script', base: base || null, sup: which === 'sup' ? arg : null, sub: which === 'sub' ? arg : null });
}

function readArg(p) {
  while (p.s[p.i] === ' ') p.i += 1;
  const ch = p.s[p.i];
  if (ch === undefined) return [];
  if (ch === '{') {
    p.i += 1;
    const a = seq(p, '}');
    if (p.s[p.i] === '}') p.i += 1;
    return a;
  }
  if (ch === '\\') {
    p.i += 1;
    const out = [];
    command(p, out);
    return out;
  }
  if (ch === '-' || ch === '+' || isDigit(ch)) {
    // a power such as x^10 or x^-1 takes the whole number
    let j = p.i + (ch === '-' || ch === '+' ? 1 : 0);
    while (j < p.s.length && isDigit(p.s[j])) j += 1;
    const t = p.s.slice(p.i, j);
    p.i = j;
    return [txt(t)];
  }
  const g = nextGrapheme(p.s, p.i);
  p.i += g.length;
  return [txt(g)];
}

function command(p, out) {
  const m = /^[A-Za-z]+/.exec(p.s.slice(p.i, p.i + 24));
  if (!m) {
    const g = nextGrapheme(p.s, p.i);
    if (g) {
      pushText(out, g === '\\' ? ' ' : g);
      p.i += g.length;
    }
    return;
  }
  const name = m[0];
  p.i += name.length;
  switch (name) {
    case 'frac':
    case 'dfrac':
    case 'tfrac': {
      const n = readArg(p);
      const d = readArg(p);
      out.push({ t: 'frac', n, d });
      return;
    }
    case 'sqrt': {
      let idx = null;
      while (p.s[p.i] === ' ') p.i += 1;
      if (p.s[p.i] === '[') {
        p.i += 1;
        idx = seq(p, ']');
        if (p.s[p.i] === ']') p.i += 1;
      }
      out.push({ t: 'sqrt', idx, a: readArg(p) });
      return;
    }
    case 'left':
    case 'right':
      if (p.s[p.i] === '.') p.i += 1;
      return;
    case 'overline':
    case 'bar':
      out.push({ t: 'over', k: 'bar', a: readArg(p) });
      return;
    case 'underline':
      out.push({ t: 'over', k: 'under', a: readArg(p) });
      return;
    case 'vec':
      out.push({ t: 'over', k: 'vec', a: readArg(p) });
      return;
    case 'text':
    case 'mathrm':
    case 'mathbf':
    case 'textbf':
      out.push({ t: 'blk', a: readArg(p) });
      return;
    default:
  }
  if (FUNCS.has(name)) {
    out.push({ t: 'fn', s: name });
    return;
  }
  if (SYM[name]) {
    if (BIG.has(SYM[name])) out.push({ t: 'big', s: SYM[name] });
    else pushText(out, SYM[name]);
    return;
  }
  pushText(out, name); // an unknown word is shown as it is
}

function seq(p, stop) {
  const out = [];
  p.depth += 1;
  if (p.depth > MAX_DEPTH) {
    p.i = p.s.length;
    p.depth -= 1;
    return out;
  }
  while (p.i < p.s.length) {
    const ch = p.s[p.i];
    if (stop && ch === stop) break;
    if (ch === '\\') {
      p.i += 1;
      command(p, out);
    } else if (ch === '{') {
      p.i += 1;
      const a = seq(p, '}');
      if (p.s[p.i] === '}') p.i += 1;
      if (p.s[p.i] === '/' && p.s[p.i + 1] === '{') {
        // {top}/{bottom} is a fraction: the box above and the box below
        p.i += 1;
        out.push({ t: 'frac', n: a, d: readArg(p) });
      } else {
        out.push({ t: 'blk', a });
      }
    } else if (ch === '(' || ch === '[') {
      const close = ch === '(' ? ')' : ']';
      p.i += 1;
      const a = seq(p, close);
      let closed = false;
      if (p.s[p.i] === close) {
        p.i += 1;
        closed = true;
      }
      out.push({ t: 'grp', o: ch, c: close, a, closed });
    } else if (ch === '√') {
      // √{x} is a root; √[3]{x} is a root with the index 3 (the [ ] part)
      p.i += 1;
      let idx = null;
      if (p.s[p.i] === '[') {
        p.i += 1;
        idx = seq(p, ']');
        if (p.s[p.i] === ']') p.i += 1;
      }
      out.push({ t: 'sqrt', idx, a: readArg(p, true) });
    } else if (ch === '‾' || (ch === '→' && p.s[p.i + 1] === '{')) {
      // ‾{x} is a line above x, →{x} is an arrow above x
      p.i += 1;
      out.push({ t: 'over', k: ch === '‾' ? 'bar' : 'vec', a: readArg(p) });
    } else if (BIG.has(ch)) {
      // ∑ ∫ and the others are big signs; their limits come from _{ } and ^{ } after them
      p.i += 1;
      out.push({ t: 'big', s: ch });
    } else if (ch === '^' || ch === '_') {
      p.i += 1;
      attach(out, ch === '^' ? 'sup' : 'sub', readArg(p));
    } else if (ch === '\n' || ch === '\r') {
      pushText(out, ' ');
      p.i += 1;
    } else if (/[A-Za-z]/.test(ch)) {
      // a word such as lim or sin is a function name; any other word is shown as it is
      const w = /^[A-Za-z]+/.exec(p.s.slice(p.i, p.i + 24))[0];
      if (FUNCS.has(w)) {
        out.push({ t: 'fn', s: w });
        p.i += w.length;
      } else {
        pushText(out, ch);
        p.i += 1;
      }
    } else {
      pushText(out, ch);
      p.i += 1;
    }
  }
  p.depth -= 1;
  return out;
}

export function parseExpr(src) {
  const s = String(src || '').slice(0, MAX_LEN);
  return seq({ s, i: 0, depth: 0 }, null);
}

// a part that is taller than a line (so its brackets / root sign must stretch)
function tall(nodes) {
  return (nodes || []).some((n) => {
    if (n.t === 'frac' || n.t === 'sqrt' || n.t === 'big') return true;
    if (n.t === 'grp' || n.t === 'blk' || n.t === 'over') return tall(n.a);
    if (n.t === 'script') return (n.base ? tall([n.base]) : false);
    return false;
  });
}

// an empty slot: nothing in it, or only spaces
function isBlank(nodes) {
  return !nodes || nodes.every((n) => n.t === 'txt' && n.s.trim() === '');
}

// The preview shows a short hint under each empty box (what goes there). The paper keeps plain boxes.
let HINTS = false;
const hasSlot = (a) => !!a && (a.length > 0 || HINTS); // an empty ^{} or () is shown only in the preview

function blankBox(hint) {
  const tag = HINTS && hint ? `<span class="mx-hint">${hint}</span>` : '';
  return `<span class="mx-bx"><span class="mx-t mx-empty">□</span>${tag}</span>`;
}

function row(nodes, hint) {
  if (isBlank(nodes)) return `<span class="mx-row">${blankBox(hint)}</span>`;
  return `<span class="mx-row">${nodes.map(rn).join('')}</span>`;
}

function rn(n) {
  switch (n.t) {
    case 'txt':
      return `<span class="mx-t">${esc(n.s)}</span>`;
    case 'fn':
      return `<span class="mx-t mx-fn">${n.s}</span>`;
    case 'big':
      return `<span class="mx-t mx-big">${n.s}</span>`;
    case 'blk':
      return n.a.length ? row(n.a, 'লেখা') : '';
    case 'frac':
      return `<span class="mx-fr"><span class="mx-n">${row(n.n, 'লব')}</span><span class="mx-d">${row(n.d, 'হর')}</span></span>`;
    case 'sqrt': {
      const tl = tall(n.a);
      const idx = hasSlot(n.idx) ? `<span class="mx-ix">${row(n.idx, 'মূলের সংখ্যা')}</span>` : '';
      return `<span class="mx-sq${tl ? ' tall' : ''}">${idx}<span class="mx-rd">${tl ? '' : '√'}</span><span class="mx-rad">${row(n.a, 'মূলের ভেতরে')}</span></span>`;
    }
    case 'grp': {
      const tl = tall(n.a);
      const inner = hasSlot(n.a) ? `<span class="mx-in">${row(n.a, 'বন্ধনীর ভেতরে')}</span>` : '';
      return (
        `<span class="mx-g${tl ? ' tall' : ''}${n.o === '[' ? ' sqb' : ''}"><span class="mx-p mx-lp">${n.o}</span>${inner}` +
        `${n.closed ? `<span class="mx-p mx-rp">${n.c}</span>` : ''}</span>`
      );
    }
    case 'over': {
      const vec = n.k === 'vec';
      return `<span class="mx-ov ${n.k}">${vec ? '<span class="mx-va">→</span>' : ''}${row(n.a, vec ? 'তীরের ভেতরে' : 'দাগের ভেতরে')}</span>`;
    }
    case 'script': {
      const b = n.base;
      const limit = !!b && (b.t === 'big' || (b.t === 'fn' && b.s === 'lim')); // ∑ ∏ ∫ and lim take limits
      const stacked = !!b && ((b.t === 'big' && (b.s === '∑' || b.s === '∏')) || (b.t === 'fn' && b.s === 'lim'));
      const sup = hasSlot(n.sup) ? row(n.sup, limit ? 'উপরের সীমা' : 'ঘাত') : '';
      const sub = hasSlot(n.sub) ? row(n.sub, limit ? 'নিচের সীমা' : 'নিচের সংখ্যা') : '';
      if (stacked) {
        // the limits stand above and below
        return (
          `<span class="mx-lim">${sup ? `<span class="mx-lt">${sup}</span>` : ''}<span class="mx-lb">${rn(b)}</span>` +
          `${sub ? `<span class="mx-lt">${sub}</span>` : ''}</span>`
        );
      }
      if (!sup && !sub) return b ? rn(b) : '';
      const cls = sup && sub ? '' : sup ? ' only-sup' : ' only-sub';
      return (
        `<span class="mx-sc"><span class="mx-bs">${b ? rn(b) : ''}</span>` +
        `<span class="mx-ss${cls}">${sup ? `<span class="mx-su">${sup}</span>` : ''}${sub ? `<span class="mx-sb">${sub}</span>` : ''}</span></span>`
      );
    }
    default:
      return '';
  }
}

// the inside of the equation as HTML; hints = true only for the preview
export function exprHTML(src, hints = false) {
  HINTS = !!hints;
  try {
    return row(parseExpr(src));
  } finally {
    HINTS = false;
  }
}

// is there anything to put in the paper? (empty boxes alone do not count)
export function exprHasContent(src) {
  return exprHTML(src).replace(/<[^>]*>/g, '').replace(/[□\s]/g, '').length > 0;
}

// A guide for the preview: one line for each kind of box that this equation uses, saying what goes in it.
export function exprGuide(src) {
  const items = [];
  const add = (key, sym, text) => {
    if (!items.some((i) => i.key === key)) items.push({ key, sym, text });
  };
  const walk = (nodes) => (nodes || []).forEach(visit);
  function visit(n) {
    switch (n.t) {
      case 'frac':
        add('frac', '{ } / { }', 'উপরের { } এ লব (ভাজ্য) এবং নিচের { } এ হর লিখুন।');
        walk(n.n);
        walk(n.d);
        return;
      case 'sqrt':
        add('sqrt', '√ { }', '√ এর পরের { } এর ভেতরে যার মূল নিতে হবে তা লিখুন।');
        if (n.idx) {
          add('idx', '√ [ ]', '[ ] এর ভেতরে মূলের সংখ্যা লিখুন, যেমন ৩ (ঘনমূল)।');
          walk(n.idx);
        }
        walk(n.a);
        return;
      case 'grp':
        if (n.o === '(') {
          add('par', '( )', '( ) এর ভেতরে যা লিখবেন (যেমন a+b) তা বন্ধনীর ভেতরেই থাকবে। বন্ধনীর ঘাত লাগলে বাইরে ^ { } এ লিখুন।');
        } else {
          add('sqb', '[ ]', '[ ] এর ভেতরে যা লিখবেন তা বন্ধনীর ভেতরেই থাকবে।');
        }
        walk(n.a);
        return;
      case 'over':
        if (n.k === 'vec') add('vec', '→ { }', '→ { } এর ভেতরে যে অক্ষরের ওপর তীর যাবে তা লিখুন।');
        else add('bar', '‾ { }', '‾ { } এর ভেতরে যে অংশের ওপর দাগ যাবে তা লিখুন।');
        walk(n.a);
        return;
      case 'script': {
        const b = n.base;
        const limit = !!b && (b.t === 'big' || (b.t === 'fn' && b.s === 'lim'));
        if (limit) {
          add('lim', '_ { }  ^ { }', 'নিচের { } এ শুরুর সীমা, উপরের { } এ শেষের সীমা লিখুন। যে সীমা লাগবে না সেটা ফাঁকা রাখুন।');
        } else {
          if (n.sup) add('sup', '^ { }', 'ঘাত লিখতে ^ { } এর ভেতরে লিখুন। শুধু একটি অঙ্ক হলে সরাসরি ^10 লিখলেও চলে।');
          if (n.sub) add('sub', '_ { }', 'নিচের ছোট সংখ্যা লিখতে _ { } এর ভেতরে লিখুন।');
        }
        walk(n.sup);
        walk(n.sub);
        if (b) visit(b);
        return;
      }
      case 'blk':
        walk(n.a);
        return;
      default:
    }
  }
  walk(parseExpr(src));
  return items;
}