// pdfExport.js
// Makes the question paper's PDF inside the app, at a fixed A4 size, the same on every device.
//
// Why not window.print(): the browser chooses the paper size, the margins and the zoom of the printout on each device
// (a phone also fits the page to its own screen width), so the same paper came out differently on a phone and a PC.
// Here every page is drawn at one fixed size: 1 mm of paper is always the same number of pixels (96 px per inch),
// whatever the screen, the zoom or the device. The screen zoom (sheet-wrap zoom) is never used for the PDF.
//
// Needs two libraries:  npm install html2canvas jspdf

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const PX_PER_MM = 96 / 25.4;
const PX_PER_CM = 96 / 2.54;
const SHARPNESS = 2; // image resolution: 2 is sharp on a phone and on a printer
const JPEG_QUALITY = 0.92;
const STAGE = 'pdf-stage'; // class of the copy of the paper that is drawn for the PDF
const PAPER_MM = {
  portrait: { w: 210, h: 297 },
  landscape: { w: 297, h: 210 },
};

// The @media print rules of App.css are copied under the STAGE class, so the PDF looks like the printed paper
// (answer boxes, hidden toolbar parts, and so on). Only rules that are about print are copied.
function addPrintCss() {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try {
      rules = Array.from(sheet.cssRules);
    } catch (e) {
      continue; // a stylesheet that cannot be read is skipped
    }
    for (const rule of rules) {
      if (rule.type !== CSSRule.MEDIA_RULE || !/print/i.test(rule.media.mediaText)) continue;
      for (const inner of Array.from(rule.cssRules)) {
        if (inner.type !== CSSRule.STYLE_RULE) continue;
        const selector = inner.selectorText.split(',').map((s) => `.${STAGE} ${s.trim()}`).join(', ');
        css += `${selector} { ${inner.style.cssText} }\n`;
      }
    }
  }
  const style = document.createElement('style');
  style.setAttribute('data-pdf-export', '');
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

// a style that must win over the screen and print rules
function setImportant(el, styles) {
  for (const [prop, value] of Object.entries(styles)) el.style.setProperty(prop, value, 'important');
}

// A copy of the paper (the sheet inside its wrapper) with the same classes, variables and inline styles, drawn at a
// fixed width. The screen zoom is cancelled, and what was typed into the boxes is copied (a clone does not carry it).
function makeStage(sheet, host, widthPx) {
  const wrap = sheet.parentElement; // the .sheet-wrap that holds the paper and its zoom
  const stage = wrap.cloneNode(true);
  stage.classList.add(STAGE);
  const cs = stage.querySelector('.sheet');

  const from = sheet.querySelectorAll('input, textarea, select');
  const to = cs.querySelectorAll('input, textarea, select');
  from.forEach((el, i) => {
    const c = to[i];
    if (!c) return;
    if (el.tagName === 'INPUT') {
      c.value = el.value;
      c.setAttribute('value', el.value);
      c.checked = el.checked;
      if (el.checked) c.setAttribute('checked', '');
      else c.removeAttribute('checked');
    } else if (el.tagName === 'TEXTAREA') {
      c.value = el.value;
      c.textContent = el.value;
    } else {
      c.value = el.value;
    }
  });
  // The marks boxes (<input class="qmark">) become plain text in the PDF copy. html2canvas cuts text that is taller
  // than its box, and a Bangla vowel sign (ু, ূ) hangs below the line box, so the bottom of the digits was lost.
  // The copy gets no fixed height, a taller line and room under the text; the margin takes that room back,
  // so the question layout does not move.
  cs.querySelectorAll('input.qmark').forEach((inp) => {
    const span = document.createElement('span');
    span.className = inp.className;
    span.textContent = inp.value;
    setImportant(span, {
      display: 'block',
      height: 'auto',
      'min-height': '0px',
      'line-height': '1.9',
      padding: '0px 0px 0.45em 0px',
      'margin-top': 'var(--qm-extra)',
      'margin-bottom': '-0.45em',
      overflow: 'visible',
      'white-space': 'nowrap',
      border: '0px',
    });
    if (!inp.value) span.style.setProperty('visibility', 'hidden', 'important'); // an empty box prints nothing
    inp.replaceWith(span);
  });
  cs.querySelectorAll('.tbgrip, .tbrot, .tbsz, .dropmark, .pinch-badge').forEach((el) => el.remove());
  cs.querySelectorAll('.imgsel, .mathsel, .csel, .focus').forEach((el) => el.classList.remove('imgsel', 'mathsel', 'csel', 'focus'));
  cs.querySelectorAll('[contenteditable]').forEach((el) => el.setAttribute('contenteditable', 'false'));

  Object.assign(stage.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    zoom: '1',
    transform: 'none',
    display: 'block',
    margin: '0px',
    width: `${widthPx}px`,
    visibility: 'visible',
    zIndex: '-1',
    pointerEvents: 'none',
  });
  host.appendChild(stage);
  return { stage, cs };
}

// the paper's own look for the PDF: a fixed width, no screen height, no shadow, no grey page lines
function paperBase(cs, widthPx) {
  setImportant(cs, {
    width: `${widthPx}px`,
    height: 'auto',
    'min-height': '0px',
    margin: '0px',
    'box-shadow': 'none',
    'background-image': 'none',
    'background-color': '#ffffff',
  });
}

// one column of text, the page margins are kept on the left and right; the top and bottom ones are placed on the PDF page
function flatStyles(cs, widthPx, m) {
  paperBase(cs, widthPx);
  setImportant(cs, { padding: `0px ${m.r}px 0px ${m.l}px` });
}

// two-column pages (the screen's page boxes): every page box is one PDF page, as high as the paper
function pagedStyles(cs, widthPx, pageH, m) {
  paperBase(cs, widthPx);
  setImportant(cs, { padding: '0px' });
  const pm = cs.querySelector('.pm');
  const headcols = !!pm && pm.classList.contains('headcols');
  cs.querySelectorAll('.pg').forEach((pg, k) => {
    const h = pg.style.height || `${pageH}px`;
    const top = k === 0 && !headcols ? 0 : m.t; // the first page starts under the heading, which holds the top margin
    setImportant(pg, {
      height: h,
      padding: `${top}px ${m.r}px ${m.b}px ${m.l}px`,
      margin: '0px',
      'min-height': '0px',
      'box-shadow': 'none',
    });
  });
  cs.querySelectorAll('.hdr').forEach((hd) => {
    if (!hd.closest('.pg')) setImportant(hd, { padding: `${m.t}px ${m.r}px 0px ${m.l}px` });
  });
}

// a copy in a multi-copy page: the whole paper as one piece, with the paper's own margins (top, right, bottom, left),
// so the text sits inside them, as in a word processor
function copyStyles(cs, widthPx, m) {
  paperBase(cs, widthPx);
  setImportant(cs, { padding: `${m.t}px ${m.r}px ${m.b}px ${m.l}px` });
}

// the rendering of a part of the stage as an image (CSS pixels cut out of the stage, at SHARPNESS)
function capture(stage, y, height, width, totalH) {
  return html2canvas(stage, {
    scale: SHARPNESS,
    x: 0,
    y,
    width,
    height,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: 1280,
    windowHeight: Math.max(900, Math.ceil(totalH) + 200),
  });
}

// cut a flowing paper into pages without cutting a question, a heading or a table row through its middle:
// each page ends at the last block top that still fits; a block taller than a page is cut where the page ends
function blockSlices(stage, H, contentH) {
  const top0 = stage.getBoundingClientRect().top;
  const tops = Array.from(stage.querySelectorAll('.hdr, .blk, tr'))
    .map((el) => el.getBoundingClientRect().top - top0)
    .filter((t) => t > 0.5 && t < H)
    .sort((a, b) => a - b);
  const out = [];
  let start = 0;
  while (H - start > contentH) {
    const limit = start + contentH;
    let cut = limit;
    for (const t of tops) {
      if (t > start + 1 && t <= limit) cut = t;
    }
    out.push({ y0: start, y1: cut });
    start = cut;
  }
  out.push({ y0: start, y1: H });
  return out;
}

// one copy of the paper per page
async function drawSingle(pdf, sheet, host, { paper, pageW, pageH, m }) {
  const { stage, cs } = makeStage(sheet, host, pageW);
  const paged = sheet.hasAttribute('data-paged');
  if (paged) pagedStyles(cs, pageW, pageH, m);
  else flatStyles(cs, pageW, m);
  const H = stage.getBoundingClientRect().height;

  let slices;
  if (paged) {
    // every page box is one page of the paper: the screen's page lines are at these same heights
    slices = [];
    for (let y = 0; y < H; y += pageH) slices.push({ y0: y, y1: Math.min(H, y + pageH), top: 0 });
  } else {
    slices = blockSlices(stage, H, pageH - m.t - m.b).map((s) => ({ ...s, top: m.t }));
  }

  for (let i = 0; i < slices.length; i += 1) {
    const { y0, y1, top } = slices[i];
    if (i > 0) pdf.addPage('a4', paper);
    const canvas = await capture(stage, y0, y1 - y0, pageW, H);
    pdf.addImage(
      canvas.toDataURL('image/jpeg', JPEG_QUALITY),
      'JPEG',
      0,
      top / PX_PER_MM,
      PAPER_MM[paper].w,
      (y1 - y0) / PX_PER_MM,
    );
  }
}

// 2 or 4 copies on one paper:
//   2 copies side by side: landscape A4, two upright copies
//   2 copies one above the other: portrait A4, copies laid out wide and short
//   4 copies: landscape A4, 2 x 2 grid
function copiesPaper(copies, stacked) {
  return copies === 2 && stacked ? 'portrait' : 'landscape';
}

// the margins (cm) in pixels
function marginsPx(margins) {
  return {
    t: margins.t * PX_PER_CM,
    r: margins.r * PX_PER_CM,
    b: margins.b * PX_PER_CM,
    l: margins.l * PX_PER_CM,
  };
}

// Lays one copy out in its cell and measures it. Returns s: the share of the copy's real A4 size that fits its cell
// (1 = the real size, 0.5 = half size). The copy stays in the host until the caller clears the host.
async function layoutCopies(sheet, host, { paper, copies, stacked, m }) {
  const P = PAPER_MM[paper];
  const cw = stacked ? P.w : P.w / 2; // width of one cell
  const cellHeight = copies === 4 || stacked ? P.h / 2 : P.h; // height of one cell
  const cells =
    copies === 4
      ? [[0, 0], [cw, 0], [0, cellHeight], [cw, cellHeight]]
      : stacked
        ? [[0, 0], [0, cellHeight]]
        : [[0, 0], [cw, 0]];
  const startW = copies === 4 ? Math.round(297 * PX_PER_MM) : Math.round(210 * PX_PER_MM);

  const { stage, cs } = makeStage(sheet, host, startW);
  copyStyles(cs, startW, m);
  const measure = (w) => {
    stage.style.width = `${w}px`;
    cs.style.setProperty('width', `${w}px`, 'important');
    return stage.getBoundingClientRect().height;
  };

  let w = startW;
  if (stacked) {
    // the copy is laid out at the width whose shape fits its cell best (a wider copy is a shorter copy)
    let best = null;
    for (let mm = 150; mm <= 520; mm += 10) {
      const px = mm * PX_PER_MM;
      const h = measure(px);
      const f = Math.min(cw / mm, cellHeight / (h / PX_PER_MM));
      if (!best || f > best.f) best = { px, f };
    }
    w = best.px;
  }

  const H = measure(w);
  const wMm = w / PX_PER_MM;
  const hMm = H / PX_PER_MM;
  const fit = Math.min(cw / wMm, cellHeight / hMm);
  // each copy fills its cell as far as the cell allows (the paper's size and margins decide it), never above the real A4 size
  const s = Math.min(1, fit);
  return { stage, cells, cw, cellHeight, P, w, H, wMm, hMm, s };
}

async function drawCopies(pdf, sheet, host, opts) {
  const { stage, cells, cw, cellHeight, P, w, H, wMm, hMm, s } = await layoutCopies(sheet, host, opts);

  const canvas = await capture(stage, 0, H, w, H);
  const img = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  for (const [cx, cy] of cells) {
    pdf.addImage(img, 'JPEG', cx + (cw - wMm * s) / 2, cy + (cellHeight - hMm * s) / 2, wMm * s, hMm * s);
  }

  // cut guides, dashed, between the copies
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.25);
  pdf.setLineDashPattern([1.5, 1.5], 0);
  if (opts.copies === 4) {
    pdf.line(cw, 0, cw, P.h);
    pdf.line(0, cellHeight, P.w, cellHeight);
  } else if (opts.stacked) {
    pdf.line(0, cellHeight, P.w, cellHeight);
  } else {
    pdf.line(cw, 0, cw, P.h);
  }
}

// Runs fn with the host made ready for drawing, then clears the host and puts its style back.
// One drawing at a time: the size estimate in the print dialog and the PDF itself share the same host, so a second
// job waits until the first has cleared the host.
let drawingQueue = Promise.resolve();
function withDrawingHost(host, fn) {
  const run = drawingQueue.then(() => drawOnHost(host, fn));
  drawingQueue = run.catch(() => {});
  return run;
}

async function drawOnHost(host, fn) {
  const savedHost = host.getAttribute('style');
  const style = addPrintCss();
  Object.assign(host.style, {
    display: 'block',
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: '0px',
    height: '0px',
    overflow: 'visible',
    visibility: 'visible',
  });
  host.replaceChildren();
  try {
    if (document.fonts) await document.fonts.ready; // the Bangla fonts must be loaded before drawing
    return await fn();
  } finally {
    host.replaceChildren();
    if (savedHost === null) host.removeAttribute('style');
    else host.setAttribute('style', savedHost);
    style.remove();
  }
}

// Makes the PDF and returns it (the caller shows or saves it).
//   sheet    the .sheet element of the paper (sheetRef)
//   host     an empty element in the app that is used for drawing (printMultiRef)
//   landscape, margins (cm, { t, r, b, l }) the paper's own settings
//   copies   1, 2 or 4; stacked = 2 copies one above the other
export async function exportPdf({ sheet, host, landscape, margins, copies, stacked }) {
  if (!sheet || !host) throw new Error('paper not found');
  const paper = copies > 1 ? copiesPaper(copies, stacked) : landscape ? 'landscape' : 'portrait';
  const P = PAPER_MM[paper];
  const pageW = Math.round(P.w * PX_PER_MM); // 794 or 1123 px
  const pageH = Math.round(P.h * PX_PER_MM); // 1123 or 794 px
  const m = marginsPx(margins);
  return withDrawingHost(host, async () => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: paper });
    if (copies > 1) await drawCopies(pdf, sheet, host, { paper, copies, stacked: !!stacked, m });
    else await drawSingle(pdf, sheet, host, { paper, pageW, pageH, m });
    return pdf;
  });
}

// How big each copy will print, as a share of its real size (100 = the same size as on the paper).
// Returns null for one copy. Nothing is drawn or saved.
export async function estimateCopyPercent({ sheet, host, copies, stacked, margins }) {
  if (!sheet || !host || !(copies > 1)) return null;
  const paper = copiesPaper(copies, stacked);
  return withDrawingHost(host, async () => {
    const { s } = await layoutCopies(sheet, host, { paper, copies, stacked: !!stacked, m: marginsPx(margins) });
    return Math.round(s * 100);
  });
}