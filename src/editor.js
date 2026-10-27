// Tiny block editor on top of contentEditable.
//
// Layout idea: the page itself is NOT editable. Every place a teacher can type
// ("host": school name, a question body, a note ...) is its own small
// contentEditable region. Because hosts are separate, Enter/Backspace can never
// break the structure of the paper. Question numbers come from CSS counters.

import { BLOCKS, esc } from './templates.js';
import { exprHTML } from './mathExpr.js';

const HOST = '[contenteditable="true"]';

// English hint text for the English / Math paper (keys are the Bangla hints in templates.js)
const PH_EN = {
  'বিদ্যালয়ের নাম লিখুন': 'School name',
  'সেকশন / শাখা (ঐচ্ছিক)': 'Section (optional)',
  'পরীক্ষার নাম, যেমন: অর্ধবার্ষিক পরীক্ষা, ২০২৬': 'Exam name, e.g. Half-Yearly Exam 2026',
  'বিষয়': 'Subject',
  'শ্রেণি': 'Class',
  'সময়': 'Time',
  'মোট': 'Marks',
  'এখানে প্রশ্ন লিখুন...': 'Type the question here...',
  'বিভাগের নাম, যেমন: ক বিভাগ': 'Section name, e.g. Section A',
  'এখানে নির্দেশনা বা যেকোনো লেখা লিখুন...': 'Type instructions or any text here...',
};
const STORE_KEY = 'qgen-doc-v3';

// ---------- number helpers ----------
// ---------- basic shapes and drawn arrows ----------
// Each shape is drawn in a 100 x 100 box. The box is stretched to the size the teacher picks,
// and the outline stays the same thickness (see .shape CSS), so a shape can be made bigger or smaller.
export const SHAPES = [
  { key: 'line', label: 'লাইন', w: 90, h: 12, svg: '<line x1="0" y1="50" x2="100" y2="50"/>' },
  { key: 'rect', label: 'আয়তক্ষেত্র', w: 40, h: 26, svg: '<rect x="2" y="2" width="96" height="96"/>' },
  { key: 'square', label: 'বর্গ', w: 26, h: 26, svg: '<rect x="2" y="2" width="96" height="96"/>' },
  { key: 'circle', label: 'বৃত্ত', w: 26, h: 26, svg: '<ellipse cx="50" cy="50" rx="48" ry="48"/>' },
  { key: 'ellipse', label: 'উপবৃত্ত', w: 40, h: 26, svg: '<ellipse cx="50" cy="50" rx="48" ry="46"/>' },
  { key: 'triangle', label: 'ত্রিভুজ', w: 26, h: 26, svg: '<polygon points="50,4 96,96 4,96"/>' },
  { key: 'diamond', label: 'হীরক', w: 26, h: 26, svg: '<polygon points="50,3 97,50 50,97 3,50"/>' },
  { key: 'pentagon', label: 'পঞ্চভুজ', w: 26, h: 26, svg: '<polygon points="50,6 91.8,36.4 75.9,85.6 24.1,85.6 8.2,36.4"/>' },
  { key: 'hexagon', label: 'ষড়ভুজ', w: 26, h: 26, svg: '<polygon points="25,5 75,5 97,50 75,95 25,95 3,50"/>' },
  { key: 'star', label: 'তারা', w: 28, h: 28, svg: '<polygon points="50,4 61.2,34.6 93.7,35.8 68.1,55.9 77,87.2 50,69 23,87.2 31.9,55.9 6.3,35.8 38.8,34.6"/>' },
  { key: 'arrowR', label: 'ডান অ্যারো', w: 44, h: 24, svg: '<polygon points="2,35 60,35 60,15 98,50 60,85 60,65 2,65"/>' },
  { key: 'arrowL', label: 'বাম অ্যারো', w: 44, h: 24, svg: '<polygon points="98,35 40,35 40,15 2,50 40,85 40,65 98,65"/>' },
  { key: 'arrowU', label: 'উপর অ্যারো', w: 20, h: 34, svg: '<polygon points="35,98 35,40 15,40 50,2 85,40 65,40 65,98"/>' },
  { key: 'arrowD', label: 'নিচ অ্যারো', w: 20, h: 34, svg: '<polygon points="35,2 35,60 15,60 50,98 85,60 65,60 65,2"/>' },
  { key: 'arrowDouble', label: 'দুই মুখী অ্যারো', w: 44, h: 24, svg: '<polygon points="2,50 30,20 30,38 70,38 70,20 98,50 70,80 70,62 30,62 30,80"/>' },
  { key: 'arrowLine', label: 'রেখা অ্যারো', w: 44, h: 22, svg: '<path d="M2 50 H94 M76 30 L96 50 L76 70"/>' },
  { key: 'arrowCurve', label: 'বাঁকা অ্যারো', w: 30, h: 30, svg: '<path d="M10 88 Q8 20 72 22"/><path d="M56 6 L76 22 L56 38"/>' },
];

export const shapeSvg = (key) => {
  const s = SHAPES.find((x) => x.key === key);
  return s ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${s.svg}</svg>` : '';
};

export const toAscii = (s) => String(s).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));
export const toBn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

// "১×১০ = ১০" -> 10,   "৫×৩" -> 15,   "৫" -> 5
export function evalMarks(expr) {
  const e = toAscii(expr || '').replace(/[xX*]/g, '×');
  if (e.includes('=')) return parseFloat(e.split('=').pop()) || 0;
  if (e.includes('×')) return e.split('×').reduce((a, b) => a * (parseFloat(b) || 0), 1);
  return parseFloat(e) || 0;
}

const htmlToEl = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const elOf = (n) => (n && n.nodeType === 1 ? n : n && n.parentElement);
const indexOf = (n) => Array.prototype.indexOf.call(n.parentNode.childNodes, n);

// last caret position inside an element
function endPoint(host) {
  let n = host;
  while (n.lastChild) {
    n = n.lastChild;
    if (n.nodeType === 3) return [n, n.nodeValue.length];
    if (n.nodeName === 'BR') return [n.parentNode, indexOf(n)];
    if (n.getAttribute && n.getAttribute('contenteditable') === 'false') return [n.parentNode, indexOf(n) + 1];
  }
  return [n, 0];
}

// Keep only plain text, superscript (sup), subscript (sub), bold, italic and line breaks.
// Used for the parts of a fraction / root, which may hold x² or H₂O style text.
export function cleanMathHTML(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html || '');
  const walk = (node) => {
    let out = '';
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) {
        out += esc(c.nodeValue);
      } else if (c.nodeType === 1) {
        const t = c.nodeName.toLowerCase();
        if (t === 'br') out += '<br>';
        else if (['sup', 'sub', 'b', 'i'].includes(t)) out += `<${t}>${walk(c)}</${t}>`;
        else out += walk(c); // any other tag: keep its text only
      }
    });
    return out;
  };
  return walk(tmp);
}

// the visible text of a part (used to check that it is not empty)
export function plainMath(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html || '');
  return tmp.textContent.replace(/[\u200b\u00a0\s]/g, '');
}

// accent marks (above the text) and the underbar (line under the text), as in Word's equation Accent / Bar
export const ACC_MARKS = ['hat', 'bar', 'dot', 'ddot', 'tilde', 'arrow', 'ubar'];

export function mathHTML(a) {
  // equation: fractions, roots, brackets and powers one inside another (see mathExpr.js)
  if (a.kind === 'expr') {
    const src = String(a.src || '').replace(/\s*[\r\n]+\s*/g, ' ');
    return `<span class="mi mi-ex" contenteditable="false" data-kind="expr" data-src="${esc(src)}">${exprHTML(src)}</span>`;
  }
  // underbar (like Word's Underbar): lines stacked one under another, the bar under the last line
  if (a.kind === 'ubar') {
    const rows = String(a.val || '').split('\n').filter((r) => r.trim() !== '');
    return (
      `<span class="mi mi-ubar" contenteditable="false" data-kind="ubar" data-val="${esc(rows.join('\n'))}">` +
      `<span class="ub-base">${rows.map((r) => `<span class="ub-row">${esc(r)}</span>`).join('')}</span></span>`
    );
  }
  if (a.kind === 'acc') {
    const m = ACC_MARKS.includes(a.mark) ? a.mark : 'hat';
    const under = m === 'ubar';
    const n = ['1', '2', '3'].includes(String(a.lines)) ? String(a.lines) : '1'; // how many lines in a bar
    const mk = under ? '' : `<span class="acc-mk" data-m="${m}"></span>`;
    return (
      `<span class="mi mi-acc${under ? ' ubar' : ''}" contenteditable="false" data-kind="acc" data-mark="${m}" data-n="${n}" data-val="${esc(a.val)}">` +
      `${mk}<span class="acc-base">${cleanMathHTML(a.val)}</span></span>`
    );
  }
  if (a.kind === 'sqrt') {
    return `<span class="mi mi-sqrt" contenteditable="false" data-kind="sqrt" data-val="${esc(a.val)}">√<span class="rad">${cleanMathHTML(a.val)}</span></span>`;
  }
  // ঘাত (power, raised) and নিচের সংখ্যা (subscript) of the numerator / denominator
  const pow = (t) => (t ? `<sup class="pw">${cleanMathHTML(t)}</sup>` : '');
  const sub = (t) => (t ? `<sub class="ps">${cleanMathHTML(t)}</sub>` : '');
  return (
    `<span class="mi mi-frac" contenteditable="false" data-kind="frac" data-whole="${esc(a.whole || '')}" data-num="${esc(a.num)}" data-den="${esc(a.den)}" data-npow="${esc(a.npow || '')}" data-dpow="${esc(a.dpow || '')}" data-nsub="${esc(a.nsub || '')}" data-dsub="${esc(a.dsub || '')}">` +
    (a.whole ? `<span class="whole">${cleanMathHTML(a.whole)}</span>` : '') +
    `<span class="fr"><span class="n">${cleanMathHTML(a.num)}${pow(a.npow)}${sub(a.nsub)}</span><span class="d">${cleanMathHTML(a.den)}${pow(a.dpow)}${sub(a.dsub)}</span></span></span>`
  );
}

// ---------- table grid helpers ----------
// which cell sits in each grid slot (a merged cell covers several slots)
function gridMap(table) {
  const grid = [];
  const pos = new Map();
  Array.from(table.rows).forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    Array.from(tr.cells).forEach((cell) => {
      while (grid[r][c]) c++;
      const rs = cell.rowSpan || 1;
      const cs = cell.colSpan || 1;
      for (let i = 0; i < rs; i++) {
        grid[r + i] = grid[r + i] || [];
        for (let j = 0; j < cs; j++) grid[r + i][c + j] = cell;
      }
      pos.set(cell, { r, c });
      c += cs;
    });
  });
  let cols = 0;
  grid.forEach((row) => (cols = Math.max(cols, row.length)));
  return { grid, pos, cols };
}

// width of every grid column, in CSS px
function colWidths(map) {
  const out = [];
  for (let j = 0; j < map.cols; j++) {
    let w = 0;
    for (let r = 0; r < map.grid.length && !w; r++) {
      const cell = map.grid[r] && map.grid[r][j];
      if (cell && (cell.colSpan || 1) === 1) w = cell.offsetWidth;
    }
    out.push(Math.max(20, w || 60));
  }
  return out;
}

// set every column width at once and make the table exactly that wide
function applyColWidths(table, map, widths) {
  let total = 0;
  widths.forEach((w) => (total += w));
  map.pos.forEach((p, cell) => {
    let w = 0;
    for (let j = p.c; j < p.c + (cell.colSpan || 1); j++) w += widths[j] || 0;
    cell.style.width = `${w}px`;
    cell.dataset.wnat = String(w); // the width the teacher chose, kept for when the column gets narrower
  });
  table.style.tableLayout = 'fixed';
  table.style.width = `${total}px`;
  table.dataset.wfull = String(total);
}

// the on-screen zoom of the sheet (phones shrink it), so mouse moves can be converted
// the turn of a text box in degrees (0 when straight)
function boxRot(el) {
  return parseFloat(el.dataset.rot) || 0;
}

// the outline thickness of a new arrow / shape (px): thin at first, the user makes it thicker
const SHAPE_SW = 1.5;

function zoomOf(el) {
  const wrap = el && el.closest('.sheet-wrap');
  const z = wrap ? parseFloat(wrap.style.zoom) : 1;
  return z > 0 ? z : 1;
}

const hasContent = (cell) =>
  cell.textContent.replace(/[​ \s]/g, '') !== '' || !!cell.querySelector('img,.mi');

// take the page boxes (and their columns) made by reflow() away. The blocks go back in the paper's own order:
// while the columns are on, each block carries its order number (data-ord), since a short question may sit
// in a column before a longer one that came earlier in the paper. A block added since has none and goes after the one before it.
export function unwrapPages(root) {
  const pages = Array.from(root.querySelectorAll('.pg'));
  if (!pages.length) return;
  let last = -1;
  const keyed = Array.from(root.querySelectorAll('.pcol > *')).map((u) => {
    const k = u.dataset.ord !== undefined ? Number(u.dataset.ord) : last + 0.5;
    last = k;
    return { u, k };
  });
  keyed.sort((a, b) => a.k - b.k);
  const anchor = pages[0];
  const kept = [];
  keyed.forEach(({ u }) => {
    // the rest of a block that was split over two columns / pages goes back into the block it came from
    if (u.classList.contains('cont') && kept.length) mergeRest(kept[kept.length - 1], u);
    else kept.push(u);
  });
  kept.forEach((u) => {
    delete u.dataset.ord;
    anchor.parentNode.insertBefore(u, anchor);
  });
  pages.forEach((pg) => pg.remove());
  // the heading of the "শিরোনামসহ ২ কলাম" mode went into the columns: it goes back above the paper
  const blocks = root.querySelector('.blocks');
  const h = blocks && blocks.querySelector(':scope > .hdr');
  if (h) root.insertBefore(h, blocks);
  root.classList.remove('headcols');
}

// ---------- a question / note split over two columns or pages ----------
// The rest of a split block is a "cont" block (no number, no marks box). Its parts are the children of the
// block's text box; a list is split item by item and the rest carries on the numbering (start=).
const isList = (n) => !!n && n.nodeType === 1 && n.nodeName === 'OL';
const pieceHost = (u) => (u && u.matches && u.matches('.blk.q, .blk.note') ? u.querySelector(':scope > .host') : null);
const atomCount = (host) => Array.from(host.childNodes).reduce((n, c) => n + (isList(c) ? c.children.length : 1), 0);

// move the last part of the text box to the front of the rest
const moveAtom = (host, rest, conts) => {
  const last = host.lastChild;
  if (isList(last) && last.children.length) {
    const li = last.lastElementChild;
    let cont = conts.get(last);
    if (!cont) {
      cont = last.cloneNode(false);
      cont.dataset.cont = '1';
      cont.dataset.src = String(Array.prototype.indexOf.call(host.childNodes, last));
      conts.set(last, cont);
      rest.insertBefore(cont, rest.firstChild);
    }
    cont.insertBefore(li, cont.firstChild);
    cont.setAttribute('start', String((Number(last.getAttribute('start')) || 1) + last.children.length));
    if (!last.children.length) last.remove();
  } else {
    rest.insertBefore(last, rest.firstChild);
  }
};

const snapHost = (host) => {
  const kids = Array.from(host.childNodes);
  return { kids, lists: kids.filter(isList).map((o) => [o, Array.from(o.childNodes)]) };
};
const restoreHost = (host, snap) => {
  host.replaceChildren(...snap.kids);
  snap.lists.forEach(([o, c]) => o.replaceChildren(...c));
};

// the piece fits when its bottom (with its margin) is above the page's bottom margin
const fitsIn = (col, u) => {
  const pg = col.parentNode;
  const cs = getComputedStyle(pg);
  const inner = pg.offsetHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  const gap = parseFloat(getComputedStyle(u).marginBottom) || 0;
  return u.offsetTop + u.offsetHeight + gap <= inner + 1;
};

const makeRest = (u, host, restHost) => {
  const r = document.createElement('div');
  r.className = `${u.className.replace(/\bnewpage\b/g, '').trim()} cont`;
  r.dataset.blk = u.dataset.blk || '';
  r.dataset.ord = String(Number(u.dataset.ord) + 0.01);
  const h = host.cloneNode(false);
  h.append(...Array.from(restHost.childNodes));
  r.appendChild(h);
  return r;
};

// put a piece in a column. { ok, rest }: rest is the part that did not fit (only when split is on)
const putPiece = (col, u, split) => {
  col.appendChild(u);
  if (fitsIn(col, u)) return { ok: true, rest: null };
  const empty = col.children.length === 1;
  const host = split ? pieceHost(u) : null;
  if (!host) {
    if (empty) return { ok: true, rest: null };
    col.removeChild(u);
    return { ok: false, rest: null };
  }
  const snap = snapHost(host);
  const restHost = document.createElement('div');
  const conts = new Map();
  while (!fitsIn(col, u) && atomCount(host) > 1) moveAtom(host, restHost, conts);
  if (!fitsIn(col, u) && !empty) {
    restoreHost(host, snap);
    col.removeChild(u);
    return { ok: false, rest: null };
  }
  if (!restHost.childNodes.length) return { ok: true, rest: null };
  return { ok: true, rest: makeRest(u, host, restHost) };
};

// give the rest of a split block back to its first part
const mergeRest = (origin, rest) => {
  const oh = pieceHost(origin);
  const rh = pieceHost(rest);
  if (!oh || !rh) return;
  while (rh.firstChild) {
    const c = rh.firstChild;
    const src = isList(c) && c.dataset.cont ? oh.childNodes[Number(c.dataset.src)] : null;
    if (isList(src)) {
      src.append(...Array.from(c.childNodes));
      c.remove();
    } else {
      if (isList(c) && c.dataset.cont) {
        c.removeAttribute('start');
        delete c.dataset.cont;
        delete c.dataset.src;
      }
      oh.appendChild(c);
    }
  }
};

// where the page and the paper's scrolling boxes are scrolled to
function scrollSnap(el) {
  const out = [[window, window.scrollX, window.scrollY]];
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) out.push([e, e.scrollLeft, e.scrollTop]);
  }
  return out;
}
function restoreScroll(snap) {
  snap.forEach(([e, x, y]) => {
    if (e === window) {
      if (Math.abs(window.scrollX - x) > 0.5 || Math.abs(window.scrollY - y) > 0.5) window.scrollTo(x, y);
    } else {
      if (e.scrollLeft !== x) e.scrollLeft = x;
      if (e.scrollTop !== y) e.scrollTop = y;
    }
  });
}

export class Core {
  constructor(root, cb = {}) {
    this.root = root;
    this.cb = cb; // { onState, onStats, onMathEdit, onNotice }
    this.lang = 'bn'; // 'bn' blocks English letters; 'en' and 'math' do not
    this.hist = [];
    this.idx = -1;
    this.timers = {};
    this.lastSel = null;
    this.stateStr = '';

    this._input = this.onInput.bind(this);
    this._focusin = this.onFocusIn.bind(this);
    this._key = this.onKeyDown.bind(this);
    this._paste = this.onPaste.bind(this);
    this._drop = this.onDrop.bind(this);
    this._dragover = (e) => e.preventDefault();
    this._dragstart = this.onDragStart.bind(this);
    this._dragend = () => {
      this.dragEl = null;
    };
    this._down = this.onMouseDown.bind(this);
    this._hover = this.onHover.bind(this);
    this._move = this.onMouseMove.bind(this);
    this._placeDown = this.onPlacePress.bind(this);
    this._up = this.onMouseUp.bind(this);
    this._click = this.onClick.bind(this);
    this.selImg = null; // picture the teacher clicked
    this.selMath = null; // fraction / root the teacher clicked
    this.dragEl = null; // picture being dragged inside the paper
    this.resize = null; // table row / column being resized with the mouse
    this.cellAnchor = null; // first cell of a mouse selection between cells
    this.cellDrag = false;
    this.grip = '';
    this.imgPress = null; // picture under a mouse press (not yet moved)
    this.shResize = null; // shape corner being dragged
    this.dropAt = null; // where a dragged picture would land
    this.dropMark = null; // the blue drop line element
    this.tbDrag = null; // text box moved by its grip
    this.boxPress = null; // a picture, or the frame of a text box, pressed: it moves once the pointer moves
    this.tbRot = null; // text box turned by its rotate handle
    this.tbSize = null; // text box or picture box resized by its right-edge handle
    this.lastPt = null; // last press or typing point on the paper
    this.tbNew = null; // a text box being drawn: dragging to the right sets its width
    this.pickRange = null; // caret remembered before the picture dialog opens
    this._dbl = this.onDblClick.bind(this);
    this._before = this.onBeforeInput.bind(this);
    this._sel = this.onSelChange.bind(this);
  }

  // ---------- lifecycle ----------
  init(html) {
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
    } catch (e) {
      /* ignore */
    }
    const r = this.root;
    // the grey margin of the sheet is outside the paper: a press there beside a line sets the caret on that line
    this._sheetDown = this.onSheetPress.bind(this);
    const sh = r.closest('.sheet');
    if (sh) sh.addEventListener('pointerdown', this._sheetDown);
    r.addEventListener('input', this._input);
    r.addEventListener('focusin', this._focusin);
    r.addEventListener('keydown', this._key);
    r.addEventListener('paste', this._paste);
    r.addEventListener('drop', this._drop);
    r.addEventListener('dragover', this._dragover);
    r.addEventListener('dragstart', this._dragstart);
    r.addEventListener('dragend', this._dragend);
    r.addEventListener('pointerdown', this._down);
    r.addEventListener('pointermove', this._hover);
    r.addEventListener('click', this._click);
    r.addEventListener('dblclick', this._dbl);
    r.addEventListener('beforeinput', this._before);
    document.addEventListener('selectionchange', this._sel);
    document.addEventListener('pointermove', this._move);
    document.addEventListener('mousedown', this._placeDown);
    document.addEventListener('pointerup', this._up);
    document.addEventListener('pointercancel', this._up);
    this.load(html);
  }

  destroy() {
    if (this._ro) this._ro.disconnect();
    const r = this.root;
    const sh = r.closest('.sheet');
    if (sh && this._sheetDown) sh.removeEventListener('pointerdown', this._sheetDown);
    r.removeEventListener('input', this._input);
    r.removeEventListener('keydown', this._key);
    r.removeEventListener('paste', this._paste);
    r.removeEventListener('drop', this._drop);
    r.removeEventListener('dragover', this._dragover);
    r.removeEventListener('dragstart', this._dragstart);
    r.removeEventListener('dragend', this._dragend);
    r.removeEventListener('pointerdown', this._down);
    r.removeEventListener('pointermove', this._hover);
    r.removeEventListener('click', this._click);
    r.removeEventListener('dblclick', this._dbl);
    r.removeEventListener('beforeinput', this._before);
    document.removeEventListener('selectionchange', this._sel);
    document.removeEventListener('pointermove', this._move);
    document.removeEventListener('mousedown', this._placeDown);
    document.removeEventListener('pointerup', this._up);
    document.removeEventListener('pointercancel', this._up);
    Object.values(this.timers).forEach(clearTimeout);
  }

  load(html) {
    this.root.innerHTML = html;
    this.ensureSlots();
    this.ensureAnchors();
    this.paginate();
    if (this.flow) this.reflow();
    this.refreshEmpty();
    this.hist = [this.snap()];
    this.idx = 0;
    this.lastSel = null;
    this.save();
    this.stats();
  }

  // ---------- selection helpers ----------
  hosts() {
    return Array.from(this.root.querySelectorAll(HOST));
  }

  hostOf(node) {
    const el = elOf(node);
    const h = el && el.closest(HOST);
    return h && this.root.contains(h) ? h : null;
  }

  // leaf blocks (paragraphs, list items, table cells) of a host, in document order
  leafBlocks(host) {
    return Array.from(host.querySelectorAll('p,li,td,th')).filter((b) => !b.querySelector('p,li,td,th'));
  }

  // a caret point as {b: block index (-1 = host itself), o: text offset inside that block}
  pointOf(host, node, offset) {
    const el = elOf(node);
    const blk = el.closest('p,li,td,th');
    const blocks = this.leafBlocks(host);
    let b = blk && host.contains(blk) ? blocks.indexOf(blk) : -1;
    const base = b >= 0 ? blocks[b] : host;
    if (b < 0 && blk) b = -1;
    const r = document.createRange();
    r.selectNodeContents(base);
    r.setEnd(node, offset);
    return { b, o: r.toString().length };
  }

  saveSel() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const host = this.hostOf(sel.anchorNode);
    if (!host) return null;
    const a = this.pointOf(host, sel.anchorNode, sel.anchorOffset);
    const f = this.hostOf(sel.focusNode) === host ? this.pointOf(host, sel.focusNode, sel.focusOffset) : a;
    return { h: this.hosts().indexOf(host), a, f };
  }

  restoreSel(s) {
    if (!s) return;
    const host = this.hosts()[s.h];
    if (!host) return;
    const blocks = this.leafBlocks(host);
    const point = (p) => {
      const base = p.b >= 0 && blocks[p.b] ? blocks[p.b] : host;
      const w = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
      let n;
      let acc = 0;
      while ((n = w.nextNode())) {
        const len = n.nodeValue.length;
        if (p.o <= acc + len && (p.o > 0 || acc === 0)) return [n, p.o - acc];
        acc += len;
      }
      return endPoint(base);
    };
    const [an, ao] = point(s.a);
    const [fn, fo] = point(s.f);
    host.focus({ preventScroll: true });
    window.getSelection().setBaseAndExtent(an, ao, fn, fo);
  }

  // Chrome can leave a list or table inside a <p>; move it out so saved HTML stays valid
  fixNesting() {
    this.root.querySelectorAll('p > ol, p > ul, p > table').forEach((el) => {
      const p = el.parentElement;
      p.after(el);
      if (p.textContent.trim() === '' && !p.querySelector('.mi,img')) p.remove();
    });
    this.ensureSlots();
  }

  // A fraction, root, arrow or picture with nothing before/after it in its line has no text
  // to click beside it, so the pointer could not be put there. A zero-width space gives it one.
  // An invisible character after an object at the end of a line, and between two objects,
  // so the caret can always be put beside them. (The two spaces in front of an arrow, shape or
  // fraction at a line start are made by lineStartSpaces, when a new line is started.)
  ensureSlots() {
    const isObj = (n) => n && n.nodeType === 1 && n.matches && n.matches('.mi,.shape,.pimg');
    this.root.querySelectorAll('.mi, .shape, .pimg').forEach((el) => {
      if (el.closest('.pbox') || (el.parentElement && el.parentElement.closest('.mi'))) return;
      const prev = el.previousSibling;
      if (!prev || prev.nodeType !== 3) {
        el.before(document.createTextNode('\u200B'));
      }
      const next = el.nextSibling;
      if (!next || next.nodeType !== 3) {
        el.after(document.createTextNode('\u200B'));
      }
    });
  }

  // A new line that starts with an arrow, shape or fraction gets two blank spaces in front of it.
  // The teacher can delete them; they are not added again until a new line is started.


  // make sure the caret is back inside the paper (after a dialog / dropdown)
  ensureSel() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && this.hostOf(sel.anchorNode)) return;
    this.restoreSel(this.lastSel);
  }

  curNode() {
    this.ensureSel();
    const sel = window.getSelection();
    return sel && sel.rangeCount && this.hostOf(sel.anchorNode) ? sel.anchorNode : null;
  }

  caretIn(el) {
    const [n, o] = endPoint(el);
    const host = this.hostOf(el) || el;
    host.focus({ preventScroll: true });
    window.getSelection().setBaseAndExtent(n, o, n, o);
  }

  // ---------- history ----------
  snap() {
    return { html: this.cleanHTML(), sel: this.saveSel() };
  }

  // the saved HTML without the temporary highlight classes (picked questions, picked picture, picked cells)
  cleanHTML() {
    const tmp = this.root.cloneNode(true);
    tmp.querySelectorAll('[data-caret]').forEach((el) => el.remove());
    tmp.querySelectorAll('.picked,.imgsel,.imgdrag,.csel').forEach((el) =>
      el.classList.remove('picked', 'imgsel', 'imgdrag', 'csel')
    );
    // the page boxes made by reflow() are not part of the paper: their blocks stay
    unwrapPages(tmp);
    // the page-break space added by paginate() is not part of the paper
    tmp.querySelectorAll('[data-pgpad]').forEach((el) => {
      el.style.paddingTop = '';
      el.removeAttribute('data-pgpad');
    });
    // the invisible anchors (see ensureAnchors) are not saved
    tmp.querySelectorAll('*').forEach((el) => {
      Array.from(el.childNodes).forEach((n) => {
        if (n.nodeType === 3 && n.nodeValue === '\u200b') n.remove();
      });
    });
    return tmp.innerHTML;
  }

  flush() {
    clearTimeout(this.timers.snap);
    this.ensureSlots();
    const s = this.snap();
    const cur = this.hist[this.idx];
    if (!cur || cur.html !== s.html) {
      this.hist.splice(this.idx + 1);
      this.hist.push(s);
      if (this.hist.length > 150) this.hist.shift();
      this.idx = this.hist.length - 1;
    }
  }

  undo() {
    this.flush();
    if (this.idx > 0) this.apply(this.hist[--this.idx]);
  }

  redo() {
    this.flush();
    if (this.idx < this.hist.length - 1) this.apply(this.hist[++this.idx]);
  }

  apply(s) {
    this.root.innerHTML = s.html;
    this.paginate();
    if (this.flow) this.reflow();
    this.refreshEmpty();
    this.restoreSel(s.sel);
    this.save();
    this.stats();
  }

  // run a structural change so it can be undone
  mutate(fn) {
    this.flush();
    fn();
    this.commit();
  }

  // every line that starts with an object (picture, fraction, root, shape) gets a zero-width anchor before
  // it. A tap at the start of such a line then has a place to put the caret. The anchor is not saved.
  ensureAnchors() {
    // a picture that fills a cell is a direct child of the cell, so check the cells and boxes as well
    this.root.querySelectorAll('.host p, .host li, .host td, .host th, .qbody p, .tbox .host').forEach((b) => {
      const first = b.firstChild;
      if (!first || first.nodeType !== 1) return;
      if (!first.matches('.mi, .shape, .pimg, .tbgrip')) return;
      if (first.previousSibling && first.previousSibling.nodeType === 3 && first.previousSibling.nodeValue === '\u200b') return;
      b.insertBefore(document.createTextNode('\u200b'), first);
    });
  }

  commit() {
    this.fixNesting();
    this.ensureAnchors();
    this.paginate();
    if (this.flow) this.reflow();
    this.refreshEmpty();
    this.flush();
    this.save();
    this.stats();
    this.emitState();
  }

  touch() {
    clearTimeout(this.timers.snap);
    this.timers.snap = setTimeout(() => this.flush(), 500);
    clearTimeout(this.timers.save);
    this.timers.save = setTimeout(() => {
      this.paginate();
      this.save();
      this.stats();
    }, 300);
    if (this.flow) {
      clearTimeout(this.timers.flow);
      this.timers.flow = setTimeout(() => this.reflow(), 350);
    }
  }

  // ---------- two columns that flow over the pages ----------
  // flow = null (off) | 'lr' (left column fills first, then the right) | 'rl' (right column fills first)
  // cfg = { pageH, mt, mb } in CSS px: page height, top and bottom margin.
  setFlow(flow, cfg) {
    this.flow = flow || null;
    this.flowCfg = cfg;
    this.reflow();
    // the page breaks depend on the text width: when the paper gets wider or narrower (rotate, zoom, window) they are made again
    const sheet = this.root.closest('.sheet');
    if (sheet && !this._ro && window.ResizeObserver) {
      let w = sheet.getBoundingClientRect().width;
      this._ro = new ResizeObserver(() => {
        const nw = sheet.getBoundingClientRect().width;
        if (Math.abs(nw - w) < 1 || !this.flow) return;
        w = nw;
        clearTimeout(this.timers.flow);
        this.timers.flow = setTimeout(() => this.reflow(), 150);
      });
      this._ro.observe(sheet);
    }
  }

  // Every page is a box with two columns, as high as one page. The blocks run in paper order: the left column
  // fills first, then the right, then the next page. When a question does not fit in the rest of a column it is
  // split (if cfg.split is on): the parts that fit stay, the rest starts the next column or page, so no room is lost.
  // A list is split item by item. A block with the "newpage" mark always starts a new page.
  // the page boxes are rebuilt: the screen must stay where it was (no jump while typing)
  reflow() {
    const snap = scrollSnap(this.root);
    // moving a question to another page takes the focus away from its marks box: remember it and give it back
    const ae = document.activeElement;
    const boxes = Array.from(this.root.querySelectorAll('.qmark'));
    const keep = ae && ae.classList && ae.classList.contains('qmark') && boxes.includes(ae)
      ? { idx: boxes.indexOf(ae), pos: ae.selectionStart ?? ae.value.length }
      : null;
    this.reflowPages();
    this.fitTables();
    restoreScroll(snap);
    if (keep) {
      const again = this.root.querySelectorAll('.qmark')[keep.idx];
      if (again && document.activeElement !== again) {
        again.focus({ preventScroll: true });
        try { again.setSelectionRange(keep.pos, keep.pos); } catch (e) { /* not a text box */ }
      }
    }
    requestAnimationFrame(() => restoreScroll(snap));
  }

  // A table with its own column widths keeps them, but in a narrower column (2 columns, or a smaller page)
  // it shrinks to fit the column, the way the table follows the caret's column; it grows back when there is room.
  fitTables() {
    this.root.querySelectorAll('table.t').forEach((t) => {
      if (!t.style.width || /%$/.test(t.style.width)) return; // a percentage table already fits its column
      if (!t.dataset.wfull) {
        // a table made before this rule: its current size is its own size
        t.dataset.wfull = String(Math.round(t.offsetWidth));
        t.querySelectorAll('td,th').forEach((c) => (c.dataset.wnat = String(Math.round(c.offsetWidth))));
      }
      const host = t.closest('.host');
      if (!host) return;
      const cs = getComputedStyle(host);
      const avail = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const full = parseFloat(t.dataset.wfull);
      if (!avail || !full) return;
      const k = Math.min(1, avail / full);
      t.style.width = `${Math.round(full * k)}px`;
      t.querySelectorAll('td,th').forEach((c) => {
        const w = parseFloat(c.dataset.wnat);
        if (w) c.style.width = `${Math.round(w * k)}px`;
      });
    });
  }

  reflowPages() {
    const root = this.root;
    const blocks = root.querySelector('.blocks');
    const sheet = root.closest('.sheet');
    if (!blocks || !sheet) return;
    clearTimeout(this.timers.flow);
    // the caret is kept as a marker node: it follows its place through page breaks (a table row or a question
    // split over two pages), where a saved index of hosts and blocks could point to another question
    const mark = this.placeMarker();
    // take the blocks back out of the old page boxes, keeping their order
    unwrapPages(root);
    if (!this.flow) {
      delete root.dataset.flow;
      sheet.removeAttribute('data-paged');
      this.restoreMarker(mark);
      return;
    }
    root.dataset.flow = this.flow;
    root.dataset.cols = String(this.flowCfg.cols === 1 ? 1 : 2);
    sheet.setAttribute('data-paged', '1');
    const { pageH, mt, mb } = this.flowCfg;
    const cols = this.flowCfg.cols === 1 ? 1 : 2; // 1 column: one wide column per page
    const split = this.flowCfg.split !== false;
    // "শিরোনামসহ ২ কলাম": the heading is the first piece of the columns (it does not go on the paper's top line)
    const hdr = this.flowCfg.headInCols ? root.querySelector(':scope > .hdr') : null;
    root.classList.toggle('headcols', !!hdr);
    if (hdr) blocks.insertBefore(hdr, blocks.firstChild);
    const z = zoomOf(sheet);
    const base = sheet.getBoundingClientRect().top;
    // the first page starts under the heading; the later pages start after the top margin
    const top0 = (blocks.getBoundingClientRect().top - base) / z;
    // every page is its own white box, as high as the page (the margins are its padding, see App.css).
    // The first page starts under the heading, which already holds the top margin.
    const newPage = () => {
      const pg = document.createElement('div');
      pg.className = 'pg';
      pg.style.height = `${pages === 0 && !hdr ? pageH - top0 : pageH}px`;
      pg.dataset.flow = this.flow;
      for (let i = 0; i < cols; i++) {
        const col = document.createElement('div');
        col.className = 'pcol';
        pg.appendChild(col);
      }
      blocks.appendChild(pg);
      pages++;
      return pg;
    };
    // the floating text boxes (position absolute) keep their place
    const units = Array.from(blocks.children).filter((k) => !k.classList.contains('tbox'));
    units.forEach((u, i) => (u.dataset.ord = String(i)));
    let pages = 0;
    let pg = null;
    let ci = 0; // the column being filled
    units.forEach((u) => {
      let cur = u;
      while (cur) {
        if (!pg || (cur === u && u.classList.contains('newpage'))) {
          pg = newPage();
          ci = 0;
        }
        let next = null;
        let placed = false;
        for (let k = ci; k < cols && !placed; k++) {
          const r = putPiece(pg.children[k], cur, split);
          if (r.ok) {
            placed = true;
            ci = k;
            next = r.rest;
          }
        }
        if (!placed) {
          pg = newPage();
          ci = 0;
          next = putPiece(pg.children[0], cur, split).rest;
        }
        cur = next;
      }
    });
    this.restoreMarker(mark);
  }

  // a zero-size marker at the caret (only while the pages are made; it is removed again)
  placeMarker() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !this.hostOf(sel.anchorNode)) return null;
    const r = document.createRange();
    r.setStart(sel.anchorNode, sel.anchorOffset);
    r.collapse(true);
    const m = document.createElement('span');
    m.setAttribute('data-caret', '1');
    try {
      r.insertNode(m);
    } catch (e) {
      return null;
    }
    return m;
  }

  // put the caret where the marker was, then remove the marker
  restoreMarker(m) {
    if (!m) return;
    if (!m.isConnected) return;
    const r = document.createRange();
    r.setStartBefore(m);
    r.collapse(true);
    m.remove();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // the column boxes of the old selection-based columns are taken away (for papers saved earlier)
  unwrapCols() {
    if (!this.root.querySelector('.cols')) return;
    this.mutate(() => {
      this.root.querySelectorAll('.cols').forEach((w) => w.replaceWith(...w.childNodes));
    });
  }

  // ---------- "first page full, the rest on the next page" ----------
  // paging = { pageH, mt, mb } in CSS px (page height, top and bottom margin), or null when off.
  setPaging(paging) {
    this.paging = paging;
    this.paginate();
  }

  // Push a question / heading / note down to the next page when it would be cut by the grey page line.
  // The extra space is a padding-top that is stripped from the saved paper (see cleanHTML).
  paginate() {
    const root = this.root;
    const sheet = root.closest('.sheet');
    root.querySelectorAll('[data-pgpad]').forEach((k) => {
      k.style.paddingTop = '';
      delete k.dataset.pgpad;
    });
    if (!this.paging || !sheet) return;
    // every heading and question on its own (not the wrapper, and not the text inside a column block)
    const kids = Array.from(root.querySelectorAll('.hdr, .blk')).filter((k) => !k.closest('.cols'));
    const { pageH, mt, mb } = this.paging;
    const z = zoomOf(sheet);
    const base = sheet.getBoundingClientRect().top;
    kids.forEach((k) => {
      const r = k.getBoundingClientRect();
      if (!r.height) return;
      const top = (r.top - base) / z;
      const bottom = (r.bottom - base) / z;
      const page = Math.floor(top / pageH);
      const lineY = (page + 1) * pageH - mb; // where the grey line is
      const pageTop = page * pageH + mt;
      const fitsOnePage = r.height / z < pageH - mt - mb;
      if (fitsOnePage && bottom > lineY && top < lineY && top > pageTop + 2) {
        const pad = Math.round((page + 1) * pageH + mt - top);
        k.style.paddingTop = `${pad}px`;
        k.dataset.pgpad = '1';
      }
    });
  }

  save() {
    try {
      localStorage.setItem(STORE_KEY, this.cleanHTML());
    } catch (e) {
      /* storage can be blocked */
    }
  }

  static saved() {
    try {
      return localStorage.getItem(STORE_KEY);
    } catch (e) {
      return null;
    }
  }

  // ---------- empty placeholders ----------
  refreshEmpty() {
    // only the English paper uses English hints; the Math paper keeps the Bangla labels
    const en = this.lang === 'en';
    this.hosts().forEach((h) => {
      const empty =
        h.textContent.replace(/[\u200b\u00a0]/g, '').trim() === '' &&
        !h.querySelector('.mi,table,img,ol,ul,.shape');
      h.classList.toggle('empty', empty);
      // hint text follows the paper language (format text), not what the teacher typed
      const ph = h.dataset.ph || '';
      h.dataset.phShow = en && PH_EN[ph] ? PH_EN[ph] : ph;
    });
    this.root.querySelectorAll('.qmark').forEach((i) => {
      i.placeholder = en ? 'Marks' : 'নম্বর';
    });
  }

  // ---------- stats ----------
  stats() {
    const inputs = Array.from(this.root.querySelectorAll('.qmark'));
    const sum = inputs.reduce((s, i) => s + evalMarks(i.value), 0);
    const totalEl = this.root.querySelector('[data-total]');
    const txt = totalEl ? toAscii(totalEl.textContent).match(/\d+(\.\d+)?/) : null;
    this.cb.onStats && this.cb.onStats({ q: inputs.length, sum, declared: txt ? parseFloat(txt[0]) : null });
  }

  setTotal(text) {
    const el = this.root.querySelector('[data-total]');
    if (!el) return;
    this.mutate(() => {
      el.textContent = text;
    });
  }

  // ---------- toolbar state ----------
  state() {
    const sel = window.getSelection();
    const anchor = sel && sel.rangeCount ? sel.anchorNode : null;
    const host = anchor ? this.hostOf(anchor) : null;
    const pic = this.pictureNow();
    const math = this.selMath && this.selMath.isConnected ? this.selMath : null;
    // a picture or fraction that was clicked keeps its settings, even if the caret is somewhere else
    if (!host && !pic && !math) return null;
    const el = host ? elOf(anchor) : null;
    const q = (c) => {
      if (!host) return false;
      try {
        return document.queryCommandState(c);
      } catch (e) {
        return false;
      }
    };
    const blk = el ? el.closest('.blk') : null;
    const box = el ? el.closest('.tbox') : null;
    const info = this.selStyleInfo();
    return {
      bold: q('bold'),
      italic: q('italic'),
      underline: blk && blk.matches('.sec') ? !blk.hasAttribute('data-nounder') : q('underline'),
      sup: q('superscript'),
      sub: q('subscript'),
      blk: blk ? blk.dataset.blk : '',
      inTable: !!(el && el.closest('table')),
      tbox: !!box,
      boxStyle: box ? box.dataset.style : '',
      boxRot: box ? boxRot(box) : 0,
      line: !!(host && host.classList.contains('line')),
      img: !!(this.selImg && this.selImg.isConnected),
      picBox: !!(this.selImg && this.selImg.closest && this.selImg.closest('.pbox')),
      picRot: this.selImg && this.selImg.closest && this.selImg.closest('.pbox') ? boxRot(this.selImg.closest('.pbox')) : 0,
      shape: this.selImg && this.selImg.dataset ? this.selImg.dataset.shape || '' : '',
      math: math ? math.dataset.kind || 'frac' : '',
      cell: !!this.root.querySelector('.csel'),
      selFonts: info.fonts,
      selSizes: info.sizes,
    };
  }

  // the font and size used by the selected text (or by the caret's text when nothing is selected).
  // Each list holds every distinct value found: one value = all the same, more = mixed.
  selStyleInfo() {
    const fonts = new Set();
    const sizes = new Set();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !this.hostOf(sel.anchorNode)) return { fonts: [], sizes: [] };
    const add = (el) => {
      if (!el || el.nodeType !== 1) return;
      const cs = getComputedStyle(el);
      fonts.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
      sizes.add(Math.round(parseFloat(cs.fontSize)));
    };
    if (sel.isCollapsed) {
      add(elOf(sel.anchorNode));
    } else {
      const range = sel.getRangeAt(0);
      const w = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (/^[\s\u200B]*$/.test(n.nodeValue) || !range.intersectsNode(n)) continue;
        add(n.parentElement);
      }
      if (!fonts.size) add(elOf(sel.anchorNode));
    }
    return { fonts: [...fonts], sizes: [...sizes] };
  }

  emitState() {
    const s = this.state();
    if (!s) return;
    const str = JSON.stringify(s);
    if (str !== this.stateStr) {
      this.stateStr = str;
      this.cb.onState && this.cb.onState(s);
    }
  }

  notice(msg) {
    this.cb.onNotice && this.cb.onNotice(msg);
  }

  // ---------- events ----------
  onSelChange() {
    const sel = window.getSelection();
    // a selection that starts in one table cell and ends in another (a long-press drag on a phone)
    // picks every cell in the block between them, the same as a mouse drag
    if (sel && sel.rangeCount && sel.anchorNode && sel.focusNode && !sel.isCollapsed) {
      const ca = elOf(sel.anchorNode) && elOf(sel.anchorNode).closest('td,th');
      const cf = elOf(sel.focusNode) && elOf(sel.focusNode).closest('td,th');
      if (ca && cf && ca !== cf && this.root.contains(ca) && this.root.contains(cf) && ca.closest('table') === cf.closest('table')) {
        this.clearCells();
        this.cellAnchor = ca;
        this.selectRect(ca, cf);
      }
    }
    // the caret never sits inside an arrow, shape or fraction: it is moved in front of it
    const inObj = sel && sel.rangeCount && elOf(sel.anchorNode) && elOf(sel.anchorNode).closest('.mi, .shape');
    if (inObj && this.root.contains(inObj) && !inObj.closest('.pbox')) {
      const rg = document.createRange();
      rg.setStartBefore(inObj);
      rg.collapse(true);
      sel.removeAllRanges();
      sel.addRange(rg);
      return;
    }
    if (sel && sel.rangeCount && this.hostOf(sel.anchorNode)) {
      this.lastSel = this.saveSel();
      this.emitState();
    }
  }

  // the marks box that has the focus (null when a line of text has it): a font or size change applies to that box
  onFocusIn(e) {
    const t = e.target;
    if (t && t.classList && t.classList.contains('qmark')) this.qmarkNow = t;
    else if (this.hostOf(t)) this.qmarkNow = null;
  }

  activeQmark() {
    const q = this.qmarkNow;
    return q && q.isConnected && this.root.contains(q) ? q : null;
  }

  onInput(e) {
    const cp = this.caretPoint();
    if (cp) this.lastPt = cp;
    
    // lineStartSpaces() কল করার লাইনটি এখান থেকে সম্পূর্ণ মুছে দিন

    const t = e.target;
    if (t.classList && t.classList.contains('qmark')) {
      t.setAttribute('value', t.value);
    } else {
      const h = this.hostOf(t);
      if (h) {
        this.trimLead(h);
        this.refreshEmpty();
      }
    }
    this.touch();
  }

  // A space typed at the start of a line is stored as &nbsp;, which shows as a gap
  // after the question number. Remove it from the start of the first line of a host.
  trimLead(host) {
    const first = host.querySelector('p,li') || host;
    const w = document.createTreeWalker(first, NodeFilter.SHOW_TEXT);
    let n = null;
    while ((n = w.nextNode())) if (n.nodeValue.length) break;
    if (!n) return;
    const m = n.nodeValue.match(/^[\u00a0 \t]+/);
    // only spaces so far: leave them until the teacher types something after them
    if (!m || m[0].length >= n.nodeValue.length) return;
    const sel = window.getSelection();
    const onNode = sel.rangeCount && sel.anchorNode === n;
    const off = onNode ? sel.anchorOffset : 0;
    n.nodeValue = n.nodeValue.slice(m[0].length);
    if (onNode) {
      const at = Math.max(0, off - m[0].length);
      sel.setBaseAndExtent(n, at, n, at);
    }
  }

  onKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      return;
    }
    // a selected picture in the paper is removed with Delete / Backspace
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selImg && this.selImg.tagName === 'IMG' && this.hostOf(this.selImg)) {
      e.preventDefault();
      const img = this.selImg;
      const box = img.closest('.pbox');
      this.selImg = null;
      this.mutate(() => (box || img).remove());
      this.emitState();
      return;
    }
    if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.redo();
      return;
    }
    // only the single-value fields (in the meta row) stay on one line;
    // school name, section and exam title may use several lines
    const host = this.hostOf(e.target);
    if (host && host.classList.contains('val') && e.key === 'Enter') e.preventDefault();
  }

  // The paper language only changes the format text (labels, hints, numbering).
  // Anything the teacher types can be in any language.
  setLang(lang) {
    this.lang = lang;
    this.refreshEmpty();
  }

  onBeforeInput(e) {
    if (e.inputType === 'historyUndo') {
      e.preventDefault();
      this.undo();
    } else if (e.inputType === 'historyRedo') {
      e.preventDefault();
      this.redo();
    }
  }

  onPaste(e) {
    const host = this.hostOf(e.target);
    if (!host) return; // e.g. the marks input: default paste is fine
    e.preventDefault();
    let t = ((e.clipboardData || window.clipboardData).getData('text/plain') || '').replace(/\r/g, '');
    if (host.classList.contains('val')) t = t.replace(/\n+/g, ' ');
    document.execCommand('insertText', false, t);
  }

  onDblClick(e) {
    const mi = e.target.closest && e.target.closest('.mi');
    if (mi && this.root.contains(mi)) {
      this.lastSel = this.saveSel() || this.lastSel;
      this.cb.onMathEdit && this.cb.onMathEdit(mi);
    }
  }

  // ---------- text formatting ----------
  exec(cmd) {
    this.ensureSel();
    if (!this.curNode()) return this.notice('আগে যে লেখাটি বদলাতে চান সেখানে ক্লিক করে সিলেক্ট করুন।');
    // A section heading (বিভাগ) is underlined by the paper's own style (CSS), and a style on the whole heading cannot be
    // taken away from a part of its text. So the U button switches the underline of the whole heading on and off.
    const blk = cmd === 'underline' ? this.currentBlock() : null;
    if (blk && blk.matches('.sec')) {
      this.flush();
      if (blk.hasAttribute('data-nounder')) blk.removeAttribute('data-nounder');
      else blk.setAttribute('data-nounder', '1');
      this.commit();
      return;
    }
    document.execCommand(cmd, false, null);
    this.commit();
  }

  fontSize(px) {
    const q = this.activeQmark();
    if (q) {
      this.flush();
      q.style.fontSize = px;
      this.commit();
      return;
    }
    const node = this.curNode();
    const host = this.hostOf(node);
    if (!host) return this.notice('আগে যে লেখার মাপ বদলাতে চান সেখানে ক্লিক করুন।');
    this.flush();
    const sel = window.getSelection();
    if (sel.isCollapsed) {
      // no selection: apply to the current paragraph / line
      const el = elOf(sel.anchorNode);
      const blk = el.closest('p,li,td,th') && host.contains(el.closest('p,li,td,th')) ? el.closest('p,li,td,th') : host;
      sel.selectAllChildren(blk);
    }
    const saved = this.saveSel();
    document.execCommand('fontSize', false, '7');
    this.root.querySelectorAll('font[size="7"]').forEach((f) => {
      const sp = document.createElement('span');
      sp.style.fontSize = px;
      while (f.firstChild) sp.appendChild(f.firstChild);
      f.replaceWith(sp);
    });
    this.restoreSel(saved);
    this.commit();
  }

  // font of the selected text only (Bangla and English parts can use different fonts).
  // css = a font-family value, or 'inherit' to go back to the paper's own font.
  fontFace(css) {
    const q = this.activeQmark();
    if (q) {
      this.flush();
      q.style.fontFamily = css;
      this.commit();
      return;
    }
    const node = this.curNode();
    const host = this.hostOf(node);
    if (!host) return this.notice('আগে যে লেখার ফন্ট বদলাতে চান সেখানে ক্লিক করুন।');
    this.flush();
    const sel = window.getSelection();
    if (sel.isCollapsed) {
      // no selection: apply to the current paragraph / line
      const el = elOf(sel.anchorNode);
      const blk = el.closest('p,li,td,th') && host.contains(el.closest('p,li,td,th')) ? el.closest('p,li,td,th') : host;
      sel.selectAllChildren(blk);
    }
    const saved = this.saveSel();
    document.execCommand('fontName', false, 'qgenmark');
    this.root.querySelectorAll('font[face="qgenmark"]').forEach((f) => {
      const sp = document.createElement('span');
      sp.style.fontFamily = css;
      while (f.firstChild) sp.appendChild(f.firstChild);
      f.replaceWith(sp);
    });
    this.restoreSel(saved);
    this.commit();
  }

  // ---------- blocks ----------
  currentBlock() {
    const n = this.curNode();
    const el = elOf(n);
    const b = el && el.closest('.blk');
    return b && this.root.contains(b) ? b : null;
  }

  addBlock(kind) {
    const blocks = this.root.querySelector('.blocks');
    const el = htmlToEl(BLOCKS[kind]());
    const cur = this.currentBlock();
    this.mutate(() => {
      if (cur) cur.after(el);
      else blocks.append(el);
    });
    const host = el.querySelector(HOST);
    if (host) this.caretIn(host);
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  moveBlock(dir) {
    const b = this.currentBlock();
    if (!b) return this.notice('আগে যে প্রশ্ন/ঘরটি সরাতে চান তার ভেতরে ক্লিক করুন।');
    // While the page columns are on, the blocks sit in page boxes and come back in their order number (data-ord)
    // whenever the pages are made again, so a move done among the column neighbours was undone at once.
    // The move is done on the paper's own order: the page boxes are taken away first, the block is moved among its
    // neighbours, and the commit makes the pages again.
    let origin = b;
    if (b.classList.contains('cont') && b.dataset.ord !== undefined) {
      // the rest of a split question: the question itself is the piece that carries the number and the marks
      const k = Math.floor(Number(b.dataset.ord));
      origin = Array.from(this.root.querySelectorAll('.pcol > *')).find(
        (u) => !u.classList.contains('cont') && Number(u.dataset.ord) === k
      ) || b;
    }
    const saved = this.saveSel();
    let moved = null;
    this.mutate(() => {
      origin.setAttribute('data-mv', '1'); // set here, so the undo history never holds it
      unwrapPages(this.root);
      moved = this.root.querySelector('[data-mv]');
      if (!moved) return;
      moved.removeAttribute('data-mv');
      const step = (el) => {
        let s = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
        while (s && !s.classList.contains('blk')) s = dir < 0 ? s.previousElementSibling : s.nextElementSibling;
        return s;
      };
      const sib = step(moved);
      if (sib) {
        if (dir < 0) sib.before(moved);
        else sib.after(moved);
      }
    });
    this.root.querySelectorAll('[data-mv]').forEach((el) => el.removeAttribute('data-mv'));
    // host indices changed after the move; re-place the caret inside the moved block
    const h = moved && moved.querySelector(HOST);
    if (h && saved) this.caretIn(h);
    if (moved) moved.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  deleteBlock() {
    const b = this.currentBlock();
    if (!b) return this.notice('আগে যে প্রশ্ন/ঘরটি মুছতে চান তার ভেতরে ক্লিক করুন।');
    this.mutate(() => b.remove());
  }

  duplicateBlock() {
    const b = this.currentBlock();
    if (!b) return this.notice('আগে যে প্রশ্নটি কপি করতে চান তার ভেতরে ক্লিক করুন।');
    this.mutate(() => b.after(b.cloneNode(true)));
  }

  // ---------- sub-questions (ক. খ. গ. / (ক) (খ) ...) ----------
  subList(kind) {
    const node = this.curNode();
    const host = this.hostOf(node);
    if (!host || host.classList.contains('line')) {
      return this.notice('আগে কোনো প্রশ্ন বা লেখার ঘরের ভেতরে ক্লিক করুন।');
    }
    this.flush();
    const saved = this.saveSel();
    let list = elOf(node).closest('ol');
    if (list && list.dataset.kind === kind) {
      document.execCommand('insertOrderedList'); // same style again = remove list
    } else if (list) {
      list.className = `ol-${kind}`;
      list.dataset.kind = kind;
    } else {
      document.execCommand('insertOrderedList');
      const s = window.getSelection();
      list = s.rangeCount ? elOf(s.anchorNode).closest('ol') : null;
      if (list) {
        list.className = `ol-${kind}`;
        list.dataset.kind = kind;
      }
    }
    this.fixNesting();
    this.restoreSel(saved); // keep the caret where it was
    this.commit();
  }

  // ---------- two columns for the selected text (inside one question) ----------
  // n = 2: the paragraphs / list items the selection touches go into a 2-column box (.cols)
  // n = 1: the box that holds the selection is taken away again
  selCols(n) {
    const sel = window.getSelection();
    if (n === 1) {
      const el = sel && sel.rangeCount ? elOf(sel.anchorNode) : null;
      const box = el && el.closest ? el.closest('.cols') : null;
      if (!box) return this.notice('আগে ২ কলামে থাকা লেখার ভেতরে ক্লিক করুন।');
      this.mutate(() => box.replaceWith(...box.childNodes));
      return;
    }
    if (!sel || !sel.rangeCount || sel.isCollapsed) return this.notice('আগে যে লেখা ২ কলামে যাবে তা সিলেক্ট করুন।');
    const host = this.hostOf(sel.anchorNode);
    if (!host || host !== this.hostOf(sel.focusNode) || host.classList.contains('line')) {
      return this.notice('লেখাটি একটি প্রশ্নের ভেতরে সিলেক্ট করুন।');
    }
    if (elOf(sel.anchorNode).closest('.cols')) return this.notice('এই লেখা আগে থেকেই ২ কলামে আছে।');
    const range = sel.getRangeAt(0);
    // the top-level pieces of the question's text the selection touches (a whole paragraph / list at a time)
    const pieces = Array.from(host.childNodes).filter((c) => range.intersectsNode(c));
    if (!pieces.length) return this.notice('লেখাটি সিলেক্ট করুন।');
    this.flush();
    const saved = this.saveSel();
    const box = document.createElement('div');
    box.className = 'cols';
    box.style.setProperty('--n', '2');
    pieces[0].parentNode.insertBefore(box, pieces[0]);
    pieces.forEach((p) => box.appendChild(p));
    this.restoreSel(saved);
    this.commit();
  }

  // ---------- text snippets ----------
  insertText(t) {
    const node = this.curNode();
    if (!node) return this.notice('আগে যেখানে লিখতে চান সেখানে ক্লিক করুন।');
    document.execCommand('insertText', false, t);
    this.commit();
  }

  // ---------- math (fraction / root) ----------
  insertMath(a) {
    this.ensureSel();
    const node = this.curNode();
    if (!node) return this.notice('Aage jehane bosate chan sekhane click korun.');
    const sel = window.getSelection();
    const at = sel.getRangeAt(0).cloneRange();
    const el = htmlToEl(mathHTML(a));
    this.mutate(() => {
      at.deleteContents();
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode('\u200B'));
      frag.appendChild(el);
      const space = document.createTextNode('\u200B');
      frag.appendChild(space);
      at.insertNode(frag);

      const caret = document.createRange();
      caret.setStartAfter(space);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
    });
  }

  replaceMath(el, a) {
    this.mutate(() => {
      el.replaceWith(htmlToEl(mathHTML(a)));
    });
  }

  // ---------- header lines (school name, section, exam, and the centred lines) ----------
  // the picked header lines, or every header line when none is picked
  headerTargets() {
    const picked = Array.from(this.root.querySelectorAll('.hdr > .line.picked'));
    return picked.length ? picked : Array.from(this.root.querySelectorAll('.hdr > .line'));
  }

  // set one style on the picked header lines (or all of them)
  styleHeader(prop, value) {
    const targets = this.headerTargets();
    if (!targets.length) return this.notice('শিরোনামের লাইন পাওয়া যায়নি।');
    this.mutate(() => targets.forEach((t) => (t.style[prop] = value)));
  }

  // pick / unpick all header lines
  selectHeader(on) {
    this.root.querySelectorAll('.hdr > .line').forEach((t) => t.classList.toggle('picked', on));
  }

  // bold on -> normal, normal -> bold (based on the first target)
  headerBold() {
    const targets = this.headerTargets();
    if (!targets.length) return this.notice('শিরোনামের লাইন পাওয়া যায়নি।');
    const isBold = parseInt(getComputedStyle(targets[0]).fontWeight, 10) >= 600;
    this.mutate(() => targets.forEach((t) => (t.style.fontWeight = isBold ? '400' : '700')));
  }

  // ---------- pictures ----------
  // remember the caret before the file dialog opens (the dialog takes the focus away)
  rememberCaret() {
    this.ensureSel();
    const sel = window.getSelection();
    this.pickRange =
      sel && sel.rangeCount && this.hostOf(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    if (!this.pickRange) this.notice('আগে যেখানে ছবি বসাতে চান সেখানে ক্লিক করুন।');
    return !!this.pickRange;
  }

  // read a picture file and shrink it, so the saved paper stays small
  readImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('not an image'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const png = file.type === 'image/png';
        const src = cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85);
        URL.revokeObjectURL(url);
        resolve({ src, w, h });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('load'));
      };
      img.src = url;
    });
  }

  // a picture: inside a table cell it sits in the cell and fits it; anywhere else it becomes a
  // picture box at the last click (or where a file was dropped), that can be dragged and resized.
  async addImage(file, at = null) {
    let pt = null;
    if (at && at.getBoundingClientRect) {
      const r = at.getBoundingClientRect();
      if (r && (r.width || r.height)) pt = this.sheetPoint(r.left, r.top);
    }
    // no place given (the toolbar button): the picture goes where the table would go (the caret)
    if (!pt) pt = this.placePoint();
    if (!pt) return this.notice('আগে যেখানে ছবি বসাতে চান সেখানে ক্লিক করুন।');
    return this.placePicAt(pt, file);
  }

  // place a chosen picture file as a picture box at the sheet point pt
  async placePicAt(pt, file) {
    let pic;
    try {
      pic = await this.readImage(file);
    } catch (e) {
      return this.notice('এই ফাইলটি ছবি নয় বা খোলা যাচ্ছে না।');
    }
    const img = document.createElement('img');
    img.className = 'pimg';
    img.draggable = false;
    img.alt = '';
    img.src = pic.src;
    // the picture is a floating box at the place the teacher chose (never inside a table or a text box),
    // small to start with; it can be dragged, resized and rotated like a text box
    img.style.width = `${Math.min(pic.w, 120)}px`;
    img.style.height = 'auto';
    this.placeNewBoxAt(pt, img);
    if (this.selImg) this.selImg.classList.remove('imgsel');
    this.selImg = img.isConnected ? img : null;
    if (this.selImg) this.selImg.classList.add('imgsel');
    this.pickRange = null;
    this.emitState();
  }

  // the picture the teacher clicked, if it is still in the paper
  pictureNow() {
    return this.selImg && this.selImg.isConnected ? this.selImg : null;
  }

  imgResize(delta) {
    const img = this.pictureNow();
    if (!img) return this.notice('আগে একটি ছবিতে ক্লিক করুন।');
    if (img.classList.contains('shape')) {
      // shapes change in small steps (6 px), so a small arrow does not jump in size
      const step = Math.sign(delta) * 6;
      return this.resizeShape(img, Math.max(16, Math.round(img.offsetWidth + step)));
    }
    this.mutate(() => {
      img.style.width = `${Math.max(20, Math.round(img.offsetWidth + delta))}px`;
      img.style.height = 'auto';
    });
  }

  // a shape keeps its proportions: the height follows the new width
  resizeShape(el, width) {
    // a line only gets longer or shorter; its thickness is set with the thick / thin buttons
    if (el.dataset.shape === 'line') {
      el.style.width = `${Math.max(16, Math.round(width))}px`;
      return;
    }
    const w0 = el.offsetWidth || 1;
    const h0 = el.offsetHeight || 1;
    const w = Math.max(16, Math.round(width));
    const h = Math.max(4, Math.round((h0 * w) / w0));
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }

  // a line runs the full width of the box it sits in
  lineFull() {
    const img = this.pictureNow();
    if (!img || img.dataset.shape !== 'line') return this.notice('আগে একটি লাইনে ক্লিক করুন।');
    this.mutate(() => {
      img.style.width = '100%';
    });
  }

  // every shape: thicker (delta > 0) or thinner (delta < 0) outline
  shapeThick(delta) {
    const img = this.pictureNow();
    if (!img || !img.classList.contains('shape')) return this.notice('আগে একটি আকার বা অ্যারোতে ক্লিক করুন।');
    const cur = parseFloat(img.style.getPropertyValue('--sw')) || SHAPE_SW;
    this.mutate(() => this.setShapeThick(img, cur + delta));
  }

  // outline thickness in px (1 - 20). A line also gets a taller box so a thick line is never cut off.
  setShapeThick(el, value) {
    const next = Math.min(20, Math.max(1, Math.round(value * 2) / 2));
    el.style.setProperty('--sw', String(next));
    if (el.dataset.shape === 'line') el.style.height = `${Math.max(12, Math.round(next * 2 + 4))}px`;
  }

  // put a basic shape or a drawn arrow at the caret, inside the same line of text.
  // (execCommand('insertHTML') would split the paragraph in two, so a Range is used instead.)
  insertShape(key) {
    const def = SHAPES.find((x) => x.key === key);
    if (!def) return;
    this.ensureSel();
    const node = this.curNode();
    if (!node) return this.notice('Aage jehane bosate chan sekhane click korun.');
    const sel = window.getSelection();
    const at = sel.getRangeAt(0).cloneRange();
    const span = htmlToEl(
      `<span class="shape" data-shape="${def.key}" contenteditable="false" style="width:${def.w}px;height:${def.h}px">${shapeSvg(def.key)}</span>`
    );
    this.mutate(() => {
      at.deleteContents();
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode('\u200B'));
      frag.appendChild(span);
      const space = document.createTextNode('\u200B');
      frag.appendChild(space);
      at.insertNode(frag);

      const caret = document.createRange();
      caret.setStartAfter(space);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
    });
    if (this.selImg) this.selImg.classList.remove('imgsel');
    this.selImg = span.isConnected ? span : null;
    if (this.selImg) {
      this.selImg.classList.add('imgsel');
      this.setShapeThick(this.selImg, SHAPE_SW);
    }
    this.emitState();
  }

  imgAlign(a) {
    const img = this.pictureNow();
    if (!img) return this.notice('আগে একটি ছবিতে ক্লিক করুন।');
    const block = img.closest('p,li,td,th') || this.hostOf(img);
    this.mutate(() => {
      block.style.textAlign = a;
    });
  }

  // put the cursor just before or after the selected fraction / root (works with a finger too)
  mathMove(side) {
    const el = this.selMath;
    if (!el || !el.isConnected) return this.notice('আগে ভগ্নাংশে ক্লিক করুন।');
    const host = this.hostOf(el);
    this.mutate(() => {
      // a text node next to the formula gives the cursor a place to stand
      let node = side === 'before' ? el.previousSibling : el.nextSibling;
      if (!node || node.nodeType !== 3) {
        node = document.createTextNode('\u200b');
        if (side === 'before') el.before(node);
        else el.after(node);
      }
      host.focus({ preventScroll: true });
      const r = document.createRange();
      const at = side === 'before' ? node.nodeValue.length : 0;
      r.setStart(node, at);
      r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    });
    this.clearMathSel();
  }

  clearMathSel() {
    if (this.selMath) this.selMath.classList.remove('mathsel');
    this.selMath = null;
    this.emitState();
  }

  // delete the selected fraction / root
  mathDelete() {
    const el = this.selMath;
    if (!el || !el.isConnected) return this.notice('আগে ভগ্নাংশে ক্লিক করুন।');
    this.mutate(() => el.remove());
    this.clearMathSel();
  }

  // open the selected fraction / root in its dialog (same as double click)
  mathEdit() {
    const el = this.selMath;
    if (!el || !el.isConnected) return this.notice('আগে ভগ্নাংশে ক্লিক করুন।');
    this.lastSel = this.saveSel() || this.lastSel;
    this.cb.onMathEdit && this.cb.onMathEdit(el);
  }

  imgDelete() {
    const img = this.pictureNow();
    if (!img) return this.notice('আগে একটি ছবিতে ক্লিক করুন।');
    this.selImg = null;
    const box = img.closest('.pbox');
    this.mutate(() => (box || img).remove());
    this.emitState();
  }

  // a caret point under the mouse (used when dropping a picture)
  pointRange(x, y) {
    let r = null;
    if (document.caretRangeFromPoint) {
      r = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) {
        r = document.createRange();
        r.setStart(p.offsetNode, p.offset);
        r.collapse(true);
      }
    }
    return r && this.hostOf(r.startContainer) ? r : null;
  }

  // ---------- mouse: pictures, table cells, table edges ----------
  onClick(e) {
    if (this.edgeClick) {
      this.edgeClick = false;
      return;
    }
    const t = e.target;

    // টেবিল সেলে যেখানে ক্লিক করবেন পয়েন্টার ঠিক সেখানেই বসবে:
    const cell = t.closest && t.closest('td,th');
    if (cell && this.root.contains(cell)) {
      if (!cell.textContent.trim()) {
        cell.innerHTML = '<br>';
        this.caretIn(cell);
      } else {
        let r = null;
        if (document.caretRangeFromPoint) {
          r = document.caretRangeFromPoint(e.clientX, e.clientY);
        } else if (document.caretPositionFromPoint) {
          const p = document.caretPositionFromPoint(e.clientX, e.clientY);
          if (p) {
            r = document.createRange();
            r.setStart(p.offsetNode, p.offset);
            r.collapse(true);
          }
        }
        if (r && cell.contains(r.startContainer)) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }
      return;
    }

    const formula = t.closest && t.closest('.mi');
    if (this.selMath) this.selMath.classList.remove('mathsel');
    this.selMath = formula && this.root.contains(formula) ? formula : null;
    if (this.selMath) this.selMath.classList.add('mathsel');
    if (this.selImg) this.selImg.classList.remove('imgsel');
    const shape = t.closest && t.closest('.shape');
    const pic = t.tagName === 'IMG' ? t : shape;
    this.selImg = pic && this.root.contains(pic) ? pic : null;
    if (this.selImg) this.selImg.classList.add('imgsel');
    this.emitState();
  }

  // the browser's own image drag makes a copy, so it is switched off:
  // pictures in the paper are moved by our own mouse drag (see onMouseMove / onMouseUp)
  onDragStart(e) {
    if (e.target && (e.target.tagName === 'IMG' || (e.target.closest && e.target.closest('.shape')))) e.preventDefault();
  }

  // a picture dragged in from the computer
  onDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const at = this.pointRange(e.clientX, e.clientY);
    if (at) this.addImage(files[0], at);
  }

  // thin blue line that shows where the picture will land
  showDropMark(x, y) {
    if (!this.dropMark) {
      this.dropMark = document.createElement('div');
      this.dropMark.className = 'dropmark';
      document.body.appendChild(this.dropMark);
    }
    const at = this.pointRange(x, y);
    if (!at) {
      this.dropMark.style.display = 'none';
      return null;
    }
    let r = at.getBoundingClientRect();
    if (!r.height) r = this.hostOf(at.startContainer).getBoundingClientRect();
    this.dropMark.style.display = 'block';
    this.dropMark.style.left = `${r.left}px`;
    this.dropMark.style.top = `${r.top}px`;
    this.dropMark.style.height = `${Math.max(16, r.height)}px`;
    return at;
  }

  hideDropMark() {
    if (this.dropMark) this.dropMark.remove();
    this.dropMark = null;
  }

  // the picture was let go: put it at the marked place
  finishImgDrag(x) {
    const img = this.dragEl;
    const at = this.dropAt;
    this.dragEl = null;
    this.dropAt = null;
    this.imgPress = null;
    this.hideDropMark();
    if (!img) return;
    img.classList.remove('imgdrag');
    if (!img.isConnected || !at || img.contains(at.startContainer)) return;
    // the caret that was found is the nearest text position. When the mouse is further right
    // (empty space after the text), the shape is pushed right by the gap, so it can sit anywhere on a line.
    const caretX = at.getBoundingClientRect().left;
    const gap = Number.isFinite(x) ? (x - caretX) / zoomOf(img) : 0;
    this.mutate(() => {
      img.style.marginLeft = '';
      img.remove();
      at.insertNode(img);
      if (gap > 6) img.style.marginLeft = `${Math.round(gap)}px`;
    });
  }

  // shows a resize cursor when the mouse is on the right or bottom edge of a cell
  onHover(e) {
    if (this.resize) return;
    const cell = e.target.closest && e.target.closest('td,th');
    let g = '';
    if (cell && this.root.contains(cell)) {
      const r = cell.getBoundingClientRect();
      if (r.right - e.clientX < 6) g = 'col';
      else if (r.bottom - e.clientY < 6) g = 'row';
    }
    if (g !== this.grip) {
      this.grip = g;
      this.root.dataset.grip = g;
    }
  }

  // a press in the margin beside a line (outside the text) puts the caret at that line's start or end
  onSheetPress(e) {
    if (e.button !== 0 || this.root.contains(e.target)) return;
    // a text box, field or button that sits over the paper (the equation dialog, for example) keeps its own focus:
    // a press there is not a press on the paper, or the phone keyboard does not open
    if (e.target.closest && e.target.closest('textarea, input, select, button, [contenteditable="true"], [role="dialog"]')) return;
    const hit = Array.from(this.root.querySelectorAll('.host')).find((h) => {
      const r = h.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY <= r.bottom && !h.closest('.pbox');
    });
    if (!hit) return;
    // the line (paragraph / list item / cell) at that height; its start or its end, by the side pressed
    const lines = Array.from(hit.querySelectorAll('p, li, td, th')).filter((b) => {
      if (b.querySelector('p, li, td, th')) return false;
      const br = b.getBoundingClientRect();
      return e.clientY >= br.top && e.clientY <= br.bottom;
    });
    const line = lines[0] || hit;
    const r = hit.getBoundingClientRect();
    const rg = document.createRange();
    if (e.clientX < r.left) rg.setStart(line, 0);
    else {
      rg.selectNodeContents(line);
      rg.collapse(false);
    }
    e.preventDefault();
    hit.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(rg);
  }

  // editor.js-er table section ebong onMouseDown function-gulo nicher moto update kore nin:

  onMouseDown(e) {
    if (e.button !== 0) return;
    if (this.root.contains(e.target)) this.lastPt = this.sheetPoint(e.clientX, e.clientY);
    this.edgeClick = false;
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const edgeCell = e.target.closest && e.target.closest('td,th');
    let inCellEdge = false;
    if (edgeCell && this.root.contains(edgeCell)) {
      const cr = edgeCell.getBoundingClientRect();
      const zone = touch ? 0 : 6; // no table drag on a touch screen
      inCellEdge = cr.right - e.clientX < zone || cr.bottom - e.clientY < zone;
    }
    const obj = e.target.closest && e.target.closest('.shape, .mi, .pimg');
    const sr = obj && obj.classList.contains('shape') && obj.classList.contains('imgsel') ? obj.getBoundingClientRect() : null;
    const onCorner = sr && sr.right - e.clientX > -12 && sr.right - e.clientX < 16 && sr.bottom - e.clientY > -12 && sr.bottom - e.clientY < 16;
    if (obj && !inCellEdge && !onCorner && this.root.contains(obj) && !obj.closest('.pbox')) {
      const r = obj.getBoundingClientRect();
      const edge = touch ? 18 : 8;
      const nearLeft = e.clientX - r.left < edge;
      const nearRight = r.right - e.clientX < edge;
      if (nearLeft || nearRight) {
        e.preventDefault();
        const range = document.createRange();
        if (nearLeft) range.setStartBefore(obj);
        else range.setStartAfter(obj);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        this.edgeClick = true;
        return;
      }
    }
    const formula = e.target.closest && e.target.closest('.mi');
    if (formula && this.root.contains(formula) && !touch && !inCellEdge) {
      e.preventDefault();
      this.imgPress = { img: formula, x: e.clientX, y: e.clientY };
      return;
    }
    const grip = e.target.closest && e.target.closest('.tbgrip');
    if (grip && this.root.contains(grip)) {
      e.preventDefault();
      this.flush();
      const box = grip.parentElement;
      this.tbDrag = {
        box,
        x: e.clientX,
        y: e.clientY,
        left: parseFloat(box.style.left) || 0,
        top: parseFloat(box.style.top) || 0,
        z: zoomOf(box),
      };
      return;
    }
    const sz = e.target.closest && e.target.closest('.tbsz');
    if (sz && this.root.contains(sz)) {
      e.preventDefault();
      this.flush();
      const box = sz.parentElement;
      const img = box.classList.contains('pbox') ? box.querySelector('img.pimg') : null;
      this.tbSize = {
        box,
        img,
        x: e.clientX,
        w: img ? img.offsetWidth : box.offsetWidth,
        z: zoomOf(box),
      };
      return;
    }
    const rot = e.target.closest && e.target.closest('.tbrot');
    if (rot && this.root.contains(rot)) {
      e.preventDefault();
      this.flush();
      const box = rot.parentElement;
      const r = box.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      this.tbRot = {
        box,
        cx,
        cy,
        ang: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI,
        rot: boxRot(box),
      };
      return;
    }
    const shape = e.target.closest && e.target.closest('.shape');
    if (shape && shape.classList.contains('imgsel') && this.root.contains(shape)) {
      const r = shape.getBoundingClientRect();
      if (r.right - e.clientX > -12 && r.right - e.clientX < 16 && r.bottom - e.clientY > -12 && r.bottom - e.clientY < 16) {
        e.preventDefault();
        this.flush();
        this.shResize = {
          el: shape,
          x: e.clientX,
          y: e.clientY,
          w: shape.offsetWidth,
          sw: parseFloat(shape.style.getPropertyValue('--sw')) || SHAPE_SW,
          z: zoomOf(shape),
        };
        return;
      }
    }
    const boxHit = e.target.closest && e.target.closest('.tbox');
    if (boxHit && this.root.contains(boxHit) && (boxHit.classList.contains('pbox') ? !!e.target.closest('.pbody') : e.target === boxHit)) {
      e.preventDefault();
      this.flush();
      this.boxPress = {
        box: boxHit,
        x: e.clientX,
        y: e.clientY,
        left: parseFloat(boxHit.style.left) || 0,
        top: parseFloat(boxHit.style.top) || 0,
        z: zoomOf(boxHit),
      };
      return;
    }
    if (!touch && !inCellEdge && (e.target.tagName === 'IMG' || shape) && this.root.contains(e.target) && !(e.target.closest && e.target.closest('.pbox'))) {
      e.preventDefault();
      this.imgPress = { img: shape || e.target, x: e.clientX, y: e.clientY };
      return;
    }
    
    const cell = e.target.closest && e.target.closest('td,th');
    if (cell && this.root.contains(cell)) {
      const r = cell.getBoundingClientRect();
      const zone = touch ? 0 : 6; // no table drag on a touch screen
      const isCol = r.right - e.clientX < zone;
      const isRow = !isCol && r.bottom - e.clientY < zone;
      if (isCol || isRow) {
        e.preventDefault();
        this.flush();
        const table = cell.closest('table');
        const map = gridMap(table);
        const p = map.pos.get(cell);
        const rowIdx = p.r + (cell.rowSpan || 1) - 1;
        const colIdx = p.c + (cell.colSpan || 1) - 1;
        this.resize = {
          table,
          map,
          col: isCol,
          row: isRow,
          colIdx,
          tr: table.rows[rowIdx],
          x: e.clientX,
          y: e.clientY,
          z: zoomOf(table),
          widths: colWidths(map),
          h: table.rows[rowIdx].offsetHeight,
        };
        return;
      }
      // a press in a cell starts a cell selection: dragging over other cells picks the block between them
      this.clearCells();
      this.cellAnchor = cell;
      this.cellDrag = true;
    }
  }

  // 4-Way Directional Merge Functions:

  tableMergeRight() {
    const cell = this.currentCell();
    if (!cell) return this.notice('Aage table-er kono ghore click korun.');
    const table = cell.closest('table');
    const map = gridMap(table);
    const p = map.pos.get(cell);
    if (!p) return;
    const targetR = p.r;
    const targetC = p.c + (cell.colSpan || 1);
    const rightCell = map.grid[targetR] && map.grid[targetR][targetC];
    if (!rightCell || rightCell === cell) return this.notice('Dane kono ghor nei.');
    
    this.mutate(() => {
      if (hasContent(rightCell)) {
        if (!hasContent(cell)) cell.innerHTML = '';
        while (rightCell.firstChild) cell.appendChild(rightCell.firstChild);
      }
      cell.colSpan = (cell.colSpan || 1) + (rightCell.colSpan || 1);
      rightCell.remove();
      if (!hasContent(cell)) cell.innerHTML = '<br>';
    });
    this.caretIn(cell);
  }

  tableMergeLeft() {
    const cell = this.currentCell();
    if (!cell) return this.notice('Aage table-er kono ghore click korun.');
    const table = cell.closest('table');
    const map = gridMap(table);
    const p = map.pos.get(cell);
    if (!p || p.c === 0) return this.notice('Bame kono ghor nei.');
    const targetR = p.r;
    const targetC = p.c - 1;
    const leftCell = map.grid[targetR] && map.grid[targetR][targetC];
    if (!leftCell || leftCell === cell) return this.notice('Bame kono ghor nei.');

    this.mutate(() => {
      if (hasContent(cell)) {
        if (!hasContent(leftCell)) leftCell.innerHTML = '';
        while (cell.firstChild) leftCell.appendChild(cell.firstChild);
      }
      leftCell.colSpan = (leftCell.colSpan || 1) + (cell.colSpan || 1);
      cell.remove();
      if (!hasContent(leftCell)) leftCell.innerHTML = '<br>';
    });
    this.caretIn(leftCell);
  }

  tableMergeDown() {
    const cell = this.currentCell();
    if (!cell) return this.notice('Aage table-er kono ghore click korun.');
    const table = cell.closest('table');
    const map = gridMap(table);
    const p = map.pos.get(cell);
    if (!p) return;
    const targetR = p.r + (cell.rowSpan || 1);
    const targetC = p.c;
    const downCell = map.grid[targetR] && map.grid[targetR][targetC];
    if (!downCell || downCell === cell) return this.notice('Niche kono ghor nei.');

    this.mutate(() => {
      if (hasContent(downCell)) {
        if (!hasContent(cell)) cell.innerHTML = '';
        while (downCell.firstChild) cell.appendChild(downCell.firstChild);
      }
      cell.rowSpan = (cell.rowSpan || 1) + (downCell.rowSpan || 1);
      downCell.remove();
      if (!hasContent(cell)) cell.innerHTML = '<br>';
    });
    this.caretIn(cell);
  }

  tableMergeUp() {
    const cell = this.currentCell();
    if (!cell) return this.notice('Aage table-er kono ghore click korun.');
    const table = cell.closest('table');
    const map = gridMap(table);
    const p = map.pos.get(cell);
    if (!p || p.r === 0) return this.notice('Upor e kono ghor nei.');
    const targetR = p.r - 1;
    const targetC = p.c;
    const upCell = map.grid[targetR] && map.grid[targetR][targetC];
    if (!upCell || upCell === cell) return this.notice('Upor e kono ghor nei.');

    this.mutate(() => {
      if (hasContent(cell)) {
        if (!hasContent(upCell)) upCell.innerHTML = '';
        while (cell.firstChild) upCell.appendChild(cell.firstChild);
      }
      upCell.rowSpan = (upCell.rowSpan || 1) + (cell.rowSpan || 1);
      cell.remove();
      if (!hasContent(upCell)) upCell.innerHTML = '<br>';
    });
    this.caretIn(upCell);
  }

  onMouseMove(e) {
    if (this.tbNew) {
      const d = this.tbNew;
      if (Math.abs(e.clientX - d.x) > 4) {
        d.el.style.width = `${Math.max(80, Math.round((e.clientX - d.x) / d.z))}px`;
      }
      return;
    }
    // two fingers are zooming the paper: nothing is picked or moved meanwhile
    if (window.qgenPinch) {
      this.imgPress = null;
      if (this.dragEl) {
        this.dragEl.classList.remove('imgdrag');
        this.dragEl = null;
        this.hideDropMark();
      }
      return;
    }
    if (this.tbSize) {
      const d = this.tbSize;
      const w = Math.max(d.img ? 20 : 80, Math.round(d.w + (e.clientX - d.x) / d.z));
      if (d.img) d.img.style.width = `${w}px`; // the picture keeps its shape, the box follows it
      else d.box.style.width = `${w}px`;
      return;
    }
    if (this.tbRot) {
      const d = this.tbRot;
      const ang = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180 / Math.PI;
      let deg = Math.round(d.rot + (ang - d.ang));
      if (e.shiftKey) deg = Math.round(deg / 15) * 15; // hold Shift to snap to 15°
      this.setBoxRot(d.box, deg);
      return;
    }
    if (this.shResize) {
      const d = this.shResize;
      // sideways = size, up/down = outline thickness
      this.resizeShape(d.el, d.w + (e.clientX - d.x) / d.z);
      this.setShapeThick(d.el, d.sw + (e.clientY - d.y) / d.z);
      return;
    }
    // a pressed picture or text box frame starts moving after 4 px of movement
    if (this.boxPress && e.buttons & 1 && !this.tbDrag) {
      if (Math.hypot(e.clientX - this.boxPress.x, e.clientY - this.boxPress.y) > 4) {
        this.tbDrag = this.boxPress;
        this.boxPress = null;
      }
    }
    if (this.tbDrag) {
      const d = this.tbDrag;
      d.box.style.left = `${Math.max(0, Math.round(d.left + (e.clientX - d.x) / d.z))}px`;
      d.box.style.top = `${Math.max(0, Math.round(d.top + (e.clientY - d.y) / d.z))}px`;
      return;
    }
    // moving a picture: after 5 px of movement the picture follows the drop line
    if (this.imgPress && e.buttons & 1 && !this.dragEl) {
      const dx = e.clientX - this.imgPress.x;
      const dy = e.clientY - this.imgPress.y;
      if (Math.hypot(dx, dy) > 5) {
        this.dragEl = this.imgPress.img;
        this.dragEl.classList.add('imgdrag');
        this.flush();
      }
    }
    if (this.dragEl) {
      this.dropAt = this.showDropMark(e.clientX, e.clientY);
      return;
    }
    if (this.cellDrag && this.cellAnchor && e.buttons & 1) {
      const cell = e.target.closest && e.target.closest('td,th');
      if (cell && cell.closest('table') === this.cellAnchor.closest('table')) this.selectRect(this.cellAnchor, cell);
    }
    const rs = this.resize;
    if (!rs) return;
    if (rs.col) {
      const widths = rs.widths.slice();
      widths[rs.colIdx] = Math.max(20, Math.round(rs.widths[rs.colIdx] + (e.clientX - rs.x) / rs.z));
      applyColWidths(rs.table, rs.map, widths);
    } else if (rs.row) {
      rs.tr.style.height = `${Math.max(16, Math.round(rs.h + (e.clientY - rs.y) / rs.z))}px`;
    }
  }

  onMouseUp(e) {
    this.boxPress = null;
    const press = this.imgPress;
    this.cellDrag = false;
    this.imgPress = null;
    // a plain tap (no drag) on a fraction, arrow / shape or picture puts the pointer just before it
    // (left half) or just after it (right half), so the next text or object goes beside it
    if (press && !this.dragEl && e && press.img && press.img.isConnected && this.root.contains(press.img) &&
        !press.img.closest('.pbox') && !this.shResize && !this.tbRot && !this.tbSize && !this.tbDrag) {
      const img = press.img;
      const host = this.hostOf(img);
      if (host) {
        const r = img.getBoundingClientRect();
        const rg = document.createRange();
        if (e.clientX < r.left + r.width / 2) rg.setStartBefore(img);
        else rg.setStartAfter(img);
        rg.collapse(true);
        host.focus({ preventScroll: true });
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(rg);
      }
    }
    if (this.tbNew) {
      this.tbNew = null;
      this.commit();
      return;
    }
    if (this.shResize) {
      this.shResize = null;
      this.commit();
      return;
    }
    if (this.tbDrag) {
      this.tbDrag = null;
      this.commit();
      return;
    }
    if (this.tbRot) {
      this.tbRot = null;
      this.commit();
      return;
    }
    if (this.tbSize) {
      this.tbSize = null;
      this.commit();
      return;
    }
    if (this.dragEl) {
      this.finishImgDrag(e && e.clientX);
      return;
    }
    if (!this.resize) return;
    this.resize = null;
    this.commit();
  }

  clearCells() {
    this.root.querySelectorAll('.csel').forEach((c) => c.classList.remove('csel'));
  }

  // select the block of cells between two cells (a merged cell is never cut in half)
  selectRect(a, b) {
    const map = gridMap(a.closest('table'));
    const pa = map.pos.get(a);
    const pb = map.pos.get(b);
    if (!pa || !pb) return;
    let r1 = Math.min(pa.r, pb.r);
    let r2 = Math.max(pa.r + (a.rowSpan || 1) - 1, pb.r + (b.rowSpan || 1) - 1);
    let c1 = Math.min(pa.c, pb.c);
    let c2 = Math.max(pa.c + (a.colSpan || 1) - 1, pb.c + (b.colSpan || 1) - 1);
    // grow the box until no merged cell sticks out of it
    let grown = true;
    while (grown) {
      grown = false;
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const cell = map.grid[r] && map.grid[r][c];
          if (!cell) continue;
          const p = map.pos.get(cell);
          const bottom = p.r + (cell.rowSpan || 1) - 1;
          const right = p.c + (cell.colSpan || 1) - 1;
          if (p.r < r1 || p.c < c1 || bottom > r2 || right > c2) {
            r1 = Math.min(r1, p.r);
            c1 = Math.min(c1, p.c);
            r2 = Math.max(r2, bottom);
            c2 = Math.max(c2, right);
            grown = true;
          }
        }
      }
    }
    this.clearCells();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = map.grid[r] && map.grid[r][c];
        if (cell) cell.classList.add('csel');
      }
    }
  }

  // the whole table (for merge, width, alignment)
  selectTable() {
    const cell = this.currentCell();
    if (!cell) return this.notice('আগে টেবিলের কোনো ঘরে ক্লিক করুন।');
    this.clearCells();
    cell.closest('table').querySelectorAll('td,th').forEach((c) => c.classList.add('csel'));
  }

  // ---------- line height, space around a block, text boxes ----------
  // line height of the selected lines (or the current line), in steps of 0.1
  lineHeight(delta) {
    const node = this.curNode();
    const host = this.hostOf(node);
    if (!host) return this.notice('আগে যে লেখার লাইন ফাঁক বদলাতে চান সেখানে ক্লিক করুন।');
    const range = window.getSelection().getRangeAt(0);
    let blocks = Array.from(host.querySelectorAll('p,li,td,th')).filter(
      (b) => range.intersectsNode(b) && !b.querySelector('p,li,td,th')
    );
    if (!blocks.length) blocks = [elOf(node).closest('p,li,td,th') || host];
    this.mutate(() =>
      blocks.forEach((b) => {
        const cs = getComputedStyle(b);
        const ratio = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) || 1.7;
        b.style.lineHeight = String(Math.min(3, Math.max(1, Math.round((ratio + delta) * 10) / 10)));
      })
    );
  }

  // space above ('top') or below ('bottom') the current question / heading / text box, in px
  spaceBlock(side, delta) {
    const b = this.currentBlock();
    if (!b) return this.notice('আগে যে প্রশ্ন বা ঘরের আগে/পরে ফাঁক দিতে চান তার ভেতরে ক্লিক করুন।');
    const prop = side === 'top' ? 'marginTop' : 'marginBottom';
    const cur = parseFloat(getComputedStyle(b)[prop]) || 0;
    this.mutate(() => {
      b.style[prop] = `${Math.max(0, Math.round(cur + delta))}px`;
    });
  }

  // the text box the caret is in
  currentBox() {
    const el = elOf(this.curNode());
    const box = el && el.closest('.tbox');
    return box && this.root.contains(box) ? box : null;
  }

  // turn a text box to an angle (degrees), kept on the box as data-rot
  setBoxRot(box, deg) {
    const d = ((Math.round(deg) % 360) + 360) % 360;
    box.dataset.rot = String(d);
    box.style.transform = d ? `rotate(${d}deg)` : '';
  }

  // the place on the sheet where the caret is (where the teacher last typed)
  caretPoint() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !this.root.contains(sel.anchorNode)) return null;
    let r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r || (!r.width && !r.height)) {
      const el = elOf(this.curNode());
      r = el ? el.getBoundingClientRect() : null;
    }
    return r ? this.sheetPoint(r.left, r.top) : null;
  }

  // a screen point -> a place on the sheet itself (it stays right when the page is scrolled)
  sheetPoint(x, y) {
    const sheet = this.root.closest('.sheet') || this.root;
    const r = sheet.getBoundingClientRect();
    const z = zoomOf(sheet);
    return { x: (x - r.left) / z, y: (y - r.top) / z };
  }

  // and back: where that place on the sheet is on the screen now
  screenPoint(pt) {
    const sheet = this.root.closest('.sheet') || this.root;
    const r = sheet.getBoundingClientRect();
    const z = zoomOf(sheet);
    return { x: r.left + pt.x * z, y: r.top + pt.y * z };
  }

  // a press anywhere on the sheet (margins and blank space too) is the place a new box or picture starts
  onPlacePress(e) {
    const sheet = this.root.closest('.sheet');
    if (!sheet || e.button !== 0 || !sheet.contains(e.target)) return;
    this.lastPt = this.sheetPoint(e.clientX, e.clientY);
  }

  // a new text box (or a picture box, when pic is given) whose top-left corner is at a place on the
  // sheet (pt, from sheetPoint). With no place it starts near the top of the paper.
  placeNewBoxAt(pt, pic = null) {
    const el = this.placeTextBox(pt || { x: 30, y: 90 }, pic);
    if (!pic) this.caretIn(el.querySelector('.host'));
    return el;
  }

  // the toolbar button: the box starts at the last click (or typing) place on the paper, like a table
  armTextBox() {
    const pt = this.placePoint();
    if (!pt) return this.notice('আগে যেখানে বক্স বসাতে চান সেখানে ক্লিক করুন।');
    this.placeNewBoxAt(pt);
  }

  // the place a box or picture goes: the same caret the table uses (the last click or typing inside the paper,
  // restored by text position, so scrolling does not move it). Falls back to the last press on the sheet.
  placePoint() {
    this.ensureSel();
    return this.caretPoint() || (this.lastPt ? { ...this.lastPt } : null);
  }

  // pic: an <img> that goes inside a picture box (no text inside). Without it, a text box.
  placeTextBox(pt, pic = null) {
    const blocks = this.root.querySelector('.blocks');
    const left = Math.max(0, Math.round(pt.x));
    const top = Math.max(0, Math.round(pt.y) - 8);
    const el = htmlToEl(
      `<div class="blk tbox${pic ? ' pbox' : ''}" data-blk="tbox" data-style="${pic ? 'none' : 'box'}" style="left:${left}px;top:${top}px;${pic ? '' : 'width:260px'}">` +
        '<span class="tbgrip" contenteditable="false" title="টেনে যেকোনো জায়গায় সরান"></span>' +
        ['tl', 'tr', 'bl', 'br'].map((c) => `<span class="tbrot ${c}" contenteditable="false" title="কোণ ধরে টেনে যেকোনো কোণে ঘোরান (Shift = ১৫° ধাপে)"></span>`).join('') +
        '<span class="tbsz" contenteditable="false" title="ডান পাশ টেনে চওড়া-সরু করুন"></span>' +
        '</div>'
    );
    if (pic) {
      const body = document.createElement('div');
      body.className = 'pbody';
      body.contentEditable = 'false';
      body.append(pic);
      el.append(body);
    } else {
      el.append(htmlToEl('<div class="host" contenteditable="true" data-ph="এখানে লিখুন..."><p><br></p></div>'));
    }
    this.mutate(() => blocks.append(el));
    return el;
  }

  // delete the text box the caret is in
  tboxDelete() {
    const box = this.currentBox();
    if (!box) return this.notice('আগে টেক্সট বক্সের ভেতরে ক্লিক করুন।');
    this.mutate(() => box.remove());
    this.emitState();
  }

  // turn the text box the caret is in to an exact angle (degrees, any value)
  tboxSetRot(deg) {
    const box = this.currentBox();
    if (!box) return this.notice('আগে টেক্সট বক্সের ভেতরে ক্লিক করুন।');
    if (!Number.isFinite(deg)) return;
    this.mutate(() => this.setBoxRot(box, deg));
  }

  // turn the text box the caret is in by a step (degrees), or back to straight (null)
  // make the selected picture box straight again
  picStraight() {
    const img = this.pictureNow();
    const box = img && img.closest('.pbox');
    if (!box) return;
    this.mutate(() => this.setBoxRot(box, 0));
    this.emitState();
  }

  tboxRotate(delta) {
    const box = this.currentBox();
    if (!box) return this.notice('আগে টেক্সট বক্সের ভেতরে ক্লিক করুন।');
    this.mutate(() => this.setBoxRot(box, delta === null ? 0 : boxRot(box) + delta));
  }

  // border / underline line / no line
  tboxStyle(kind) {
    const box = this.currentBox();
    if (!box) return this.notice('আগে টেক্সট বক্সের ভেতরে ক্লিক করুন।');
    this.mutate(() => {
      box.dataset.style = kind;
    });
  }

  // box width in px (+/-)
  tboxWidth(delta) {
    const box = this.currentBox();
    if (!box) return this.notice('আগে টেক্সট বক্সের ভেতরে ক্লিক করুন।');
    this.mutate(() => {
      box.style.width = `${Math.max(80, Math.round(box.offsetWidth + delta))}px`;
    });
  }

  // ---------- tables ----------
  insertTable(rows, cols, header) {
    const node = this.curNode();
    const host = this.hostOf(node);
    if (!host || host.classList.contains('line')) {
      this.notice('আগে কোনো প্রশ্নের ঘরের ভেতরে ক্লিক করুন, তারপর টেবিল যোগ করুন।');
      return false;
    }
    const t = document.createElement('table');
    t.className = 't';
    const body = document.createElement('tbody');
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement(header && r === 0 ? 'th' : 'td');
        cell.innerHTML = '<br>';
        tr.appendChild(cell);
      }
      body.appendChild(tr);
    }
    t.appendChild(body);

    let anchor = elOf(node);
    while (anchor && anchor !== host && anchor.parentElement !== host) anchor = anchor.parentElement;
    this.mutate(() => {
      if (anchor && anchor !== host) anchor.after(t);
      else host.appendChild(t);
      if (!t.nextElementSibling) t.after(htmlToEl('<p><br></p>'));
    });
    this.caretIn(t.querySelector('td,th'));
    return true;
  }

  // the table cell under the caret
  currentCell() {
    const el = elOf(this.curNode());
    const cell = el && el.closest('td,th');
    return cell && this.root.contains(cell) ? cell : null;
  }

  // merge the selected cells (the block selected with the mouse) into one cell
  tableMerge() {
    const cells = Array.from(this.root.querySelectorAll('td.csel,th.csel'));
    if (cells.length < 2) return this.notice('মার্জ করতে মাউস দিয়ে কয়েকটি ঘর টেনে সিলেক্ট করুন।');
    const map = gridMap(cells[0].closest('table'));
    let r1 = Infinity;
    let c1 = Infinity;
    let r2 = -1;
    let c2 = -1;
    cells.forEach((cell) => {
      const p = map.pos.get(cell);
      if (!p) return;
      r1 = Math.min(r1, p.r);
      c1 = Math.min(c1, p.c);
      r2 = Math.max(r2, p.r + (cell.rowSpan || 1) - 1);
      c2 = Math.max(c2, p.c + (cell.colSpan || 1) - 1);
    });
    const keep = map.grid[r1] && map.grid[r1][c1];
    if (!keep) return;
    const inside = new Set();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) if (map.grid[r] && map.grid[r][c]) inside.add(map.grid[r][c]);
    }
    this.clearCells();
    this.mutate(() => {
      inside.forEach((cell) => {
        if (cell === keep) return;
        if (hasContent(cell)) {
          if (!hasContent(keep)) keep.innerHTML = '';
          while (cell.firstChild) keep.appendChild(cell.firstChild);
        }
        cell.remove();
      });
      if (!hasContent(keep)) keep.innerHTML = '<br>';
      keep.colSpan = c2 - c1 + 1;
      keep.rowSpan = r2 - r1 + 1;
    });
    this.caretIn(keep);
  }

  // split a merged cell back into single cells
  tableSplit() {
    const cell = this.currentCell();
    if (!cell) return this.notice('আগে যে ঘরটি ভাগ করতে চান সেখানে ক্লিক করুন।');
    const cs = cell.colSpan || 1;
    const rs = cell.rowSpan || 1;
    if (cs === 1 && rs === 1) return this.notice('এই ঘরটি মার্জ করা নয়।');
    const table = cell.closest('table');
    const map = gridMap(table);
    const p = map.pos.get(cell);
    const tag = cell.tagName.toLowerCase();
    const mk = () => {
      const el = document.createElement(tag);
      el.innerHTML = '<br>';
      return el;
    };
    this.clearCells();
    this.mutate(() => {
      // rows under a tall cell need new cells so the grid stays square
      for (let r = p.r + 1; r < p.r + rs; r++) {
        const tr = table.rows[r];
        if (!tr) continue;
        const after = Array.from(tr.cells).find((x) => map.pos.get(x) && map.pos.get(x).c > p.c + cs - 1);
        for (let j = 0; j < cs; j++) {
          if (after) tr.insertBefore(mk(), after);
          else tr.appendChild(mk());
        }
      }
      let ref = cell;
      for (let j = 1; j < cs; j++) {
        const el = mk();
        ref.after(el);
        ref = el;
      }
      cell.colSpan = 1;
      cell.rowSpan = 1;
    });
    this.caretIn(cell);
  }

  // make the column of the caret wider (+) or narrower (-), in px
  // make the selected cells the same size: the columns they span get one width (their average),
  // and the rows they span get one height (their average). Select the cells by dragging first.
  tableCellMatch() {
    const cells = Array.from(this.root.querySelectorAll('td.csel,th.csel'));
    if (cells.length < 2) return this.notice('আগে কয়েকটি ঘর টেনে সিলেক্ট করুন, তারপর ঘর মিলান চাপুন।');
    const table = cells[0].closest('table');
    const map = gridMap(table);
    const cols = new Set();
    const rows = new Set();
    cells.forEach((cell) => {
      const p = map.pos.get(cell);
      if (!p) return;
      for (let c = p.c; c < p.c + (cell.colSpan || 1); c++) cols.add(c);
      for (let r = p.r; r < p.r + (cell.rowSpan || 1); r++) rows.add(r);
    });
    this.mutate(() => {
      const widths = colWidths(map);
      const colList = [...cols];
      const wAvg = colList.reduce((s, c) => s + widths[c], 0) / colList.length;
      colList.forEach((c) => {
        widths[c] = Math.round(wAvg);
      });
      applyColWidths(table, map, widths);
      const rowList = [...rows];
      const hAvg = rowList.reduce((s, r) => s + table.rows[r].offsetHeight, 0) / rowList.length;
      rowList.forEach((r) => {
        table.rows[r].style.height = `${Math.round(hAvg)}px`;
      });
    });
  }

  tableCol(delta) {
    const cell = this.currentCell();
    if (!cell) return this.notice('আগে টেবিলের কোনো ঘরে ক্লিক করুন।');
    const table = cell.closest('table');
    const map = gridMap(table);
    const c = map.pos.get(cell).c;
    const widths = colWidths(map);
    this.mutate(() => {
      widths[c] = Math.max(20, widths[c] + delta);
      applyColWidths(table, map, widths);
    });
  }

  // make the row of the caret taller (+) or shorter (-), in px
  tableRow(delta) {
    const cell = this.currentCell();
    if (!cell) return this.notice('আগে টেবিলের কোনো ঘরে ক্লিক করুন।');
    const tr = cell.parentElement;
    this.mutate(() => {
      tr.style.height = `${Math.max(16, tr.offsetHeight + delta)}px`;
    });
  }

  // table width in % of the paper (+10 / -10)
  tableWidth(delta) {
    const cell = this.currentCell();
    if (!cell) return this.notice('আগে টেবিলের কোনো ঘরে ক্লিক করুন।');
    const table = cell.closest('table');
    const cur = /%$/.test(table.style.width) ? parseFloat(table.style.width) : 100;
    const next = Math.min(100, Math.max(20, cur + delta));
    this.mutate(() => {
      table.style.width = `${next}%`;
      table.style.tableLayout = 'fixed';
      table.querySelectorAll('td,th').forEach((c) => (c.style.width = ''));
    });
  }

  // table to the left, centre or right of the paper (works when the table is narrower than the paper)
  tableAlign(a) {
    const cell = this.currentCell();
    if (!cell) return this.notice('আগে টেবিলের কোনো ঘরে ক্লিক করুন।');
    const table = cell.closest('table');
    this.mutate(() => {
      if (!table.style.width || (/%$/.test(table.style.width) && parseFloat(table.style.width) >= 100)) {
        table.style.width = '80%';
        table.style.tableLayout = 'fixed';
        table.querySelectorAll('td,th').forEach((c) => (c.style.width = ''));
      }
      table.style.marginLeft = a === 'left' ? '0' : 'auto';
      table.style.marginRight = a === 'right' ? '0' : 'auto';
    });
  }

  // the table buttons: a row or column is added beside the caret's cell, or removed; the whole table can be removed
  tableRowInsert() {
    this.tableOp('rowBelow');
  }

  tableRowDelete() {
    this.tableOp('delRow');
  }

  tableColInsert() {
    this.tableOp('colRight');
  }

  tableColDelete() {
    this.tableOp('delCol');
  }

  tableDelete() {
    this.tableOp('delTable');
  }

  tableOp(op) {
    const node = this.curNode();
    const cell = elOf(node) && elOf(node).closest('td,th');
    if (!cell) return this.notice('আগে টেবিলের কোনো ঘরে ক্লিক করুন।');
    const table = cell.closest('table');
    const row = cell.parentElement;
    const rows = Array.from(table.rows);
    const c = cell.cellIndex;
    const mk = (tag) => {
      const el = document.createElement(tag);
      el.innerHTML = '<br>';
      return el;
    };
    let focusEl = cell;

    this.mutate(() => {
      switch (op) {
        case 'rowAbove':
        case 'rowBelow': {
          const nr = document.createElement('tr');
          for (let i = 0; i < row.cells.length; i++) nr.appendChild(mk('td'));
          if (op === 'rowAbove') row.before(nr);
          else row.after(nr);
          focusEl = nr.cells[Math.min(c, nr.cells.length - 1)];
          break;
        }
        case 'colLeft':
        case 'colRight':
          rows.forEach((r) => {
            const ref = r.cells[c];
            if (!ref) return;
            const nc = mk(ref.tagName.toLowerCase());
            if (op === 'colLeft') ref.before(nc);
            else ref.after(nc);
          });
          focusEl = row.cells[op === 'colLeft' ? c : c + 1] || cell;
          break;
        case 'delRow':
          if (rows.length === 1) {
            table.remove();
            focusEl = null;
          } else {
            const next = rows[rows.indexOf(row) + 1] || rows[rows.indexOf(row) - 1];
            row.remove();
            focusEl = next.cells[Math.min(c, next.cells.length - 1)];
          }
          break;
        case 'delCol':
          if (row.cells.length === 1) {
            table.remove();
            focusEl = null;
          } else {
            rows.forEach((r) => r.cells[c] && r.cells[c].remove());
            focusEl = row.cells[Math.min(c, row.cells.length - 1)];
          }
          break;
        case 'delTable':
          table.remove();
          focusEl = null;
          break;
        case 'header': {
          const first = rows[0];
          const toTh = first.cells[0].tagName === 'TD';
          Array.from(first.cells).forEach((cl) => {
            const nc = document.createElement(toTh ? 'th' : 'td');
            nc.innerHTML = cl.innerHTML;
            if (cl.getAttribute('style')) nc.setAttribute('style', cl.getAttribute('style'));
            cl.replaceWith(nc);
          });
          focusEl = cell.isConnected ? cell : first.cells[0];
          break;
        }
        default:
      }
    });
    // a host must never be left without a paragraph
    this.hosts().forEach((h) => {
      if (!h.classList.contains('line') && h.children.length === 0 && h.textContent === '') h.innerHTML = '<p><br></p>';
    });
    if (focusEl && focusEl.isConnected) this.caretIn(focusEl);
  }
  
}