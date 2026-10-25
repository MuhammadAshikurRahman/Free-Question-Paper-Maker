import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { exportPdf } from './pdfExport';
import { Core, toBn, toAscii, SHAPES, plainMath } from './editor.js';
import { blankDoc, sampleDoc } from './templates.js';
import { Btn, Menu, Modal, MathPreview, Group } from './ui.jsx';
import { Icon } from './icons.jsx';

const LS = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      /* ignore */
    }
  },
};

const SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40];
const BASES = [12, 14, 15, 16, 18, 20, 22, 24, 26];

// sheet size in CSS pixels (A4 at 96 dpi): portrait 794 wide, landscape 1123 wide
const PAGE = {
  portrait: { w: '210mm', h: '297mm', px: 794 },
  landscape: { w: '297mm', h: '210mm', px: 1123 },
};

const BN_DEFAULT = '"Noto Sans Bengali", "Hind Siliguri", sans-serif';
const TIMES = '"Times New Roman", Times, serif';
const FONTS = [
  // SutonnyOMJ is a legacy font: it only shows correctly if it is installed on this computer
  // and the text was typed in its own keyboard encoding (Bijoy). Unicode Bangla shows garbled.
  { key: 'suttony', label: 'SutonnyOMJ (সুতন্নী)', css: `"SutonnyOMJ", ${BN_DEFAULT}` },
  { key: 'tiro', label: 'Tiro Bangla (তিরো বাংলা)', css: '"Tiro Bangla", serif' },
  { key: 'noto', label: 'Noto Sans Bengali', css: BN_DEFAULT },
  { key: 'hind', label: 'Hind Siliguri', css: '"Hind Siliguri", sans-serif' },
  { key: 'times', label: 'Times New Roman (English)', css: TIMES },
  { key: 'arial', label: 'Arial (English)', css: 'Arial, Helvetica, sans-serif' },
];

const SYMBOLS = [
  '×', '÷', '±', '=', '≠', '≈', '<', '>', '≤', '≥', '√', '∞', 'π', '%', '°', '′', '″', '∠', '⊥', '∥', '△', '□', '○', '∴', '∵',
  '∈', '∉', '∪', '∩', '⊂', '⊆', '∅', '→', '⇒', '⇔', '½', '¼', '¾', '²', '³', 'ⁿ', '₀', '₁', '₂', 'α', 'β', 'γ', 'θ', 'λ', 'μ', 'Δ', 'Σ',
  '৳', '।', '—', '…', '✓', '☐',
];

const SUBLISTS = [
  ['bn', 'ক.  খ.  গ.  ঘ.', 'উপ-প্রশ্ন (বাংলা)'],
  ['en', 'a.  b.  c.  d.', 'উপ-প্রশ্ন (English)'],
  ['mcq-bn', '(ক)  (খ)  (গ)  (ঘ)', 'বহুনির্বাচনী অপশন, ২ কলামে (বাংলা)'],
  ['mcq-en', '(a)  (b)  (c)  (d)', 'বহুনির্বাচনী অপশন, ২ কলামে (English)'],
];

// arrows of many kinds, inserted as text
const ARROWS = [
  '→', '←', '↑', '↓', '↔', '↕', '↗', '↘', '↖', '↙', '⇒', '⇐', '⇑', '⇓', '⇔', '⇕', '⟶', '⟵', '⟷', '➔',
  '➜', '➝', '➞', '➤', '➥', '↦', '↤', '⤴', '⤵', '↩', '↪', '↺', '↻', '⇢', '⇠', '⇨', '⇦', '➡', '⬅', '⬆', '⬇', '⬈',
];

const BLOCK_LABEL = { q: 'এই প্রশ্নটি', sec: 'এই শিরোনামটি', note: 'এই লেখাটি' };

// English paper: marks such as "১×১০ = ১০" are shown with English digits: "1×10 = 10"
const toEnDigits = (s) => toAscii(s);

// Paper zoom, one model for every device: 100% = the real A4 size (794 px wide), the same on a phone and on a computer.
// The buttons and Ctrl + mouse wheel move along ZOOM_STEPS; two fingers zoom freely inside the same range.
const ZOOM_MIN = 40;
const ZOOM_MAX = 250;
const ZOOM_STEPS = [40, 50, 60, 75, 90, 100, 125, 150, 175, 200, 250];
const clampZoom = (pct) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(pct)));

// the paper of a multi-copy print, the same on every device: 2 copies "one above the other" on portrait A4,
// everything else on landscape A4
const copyPaper = (copies, stack) => (copies === 2 && stack ? 'portrait' : 'landscape');

// save a preference and update its state in one go
const pref = (setter, key, value) => {
  setter(value);
  LS.set(key, String(value));
};

export default function App() {
  const rootRef = useRef(null);
  const sheetRef = useRef(null);
  const printMultiRef = useRef(null);
  const coreRef = useRef(null);
  const [printCopies, setPrintCopies] = useState(1);
  const [printStack, setPrintStack] = useState(false); // 2 copies: false = side by side, true = one above the other
  const [busy, setBusy] = useState(false); // the PDF is being made

  const [lang, setLang] = useState(() => LS.get('qgen-lang') || 'bn');
  const [st, setSt] = useState({});
  const [stats, setStats] = useState({ q: 0, sum: 0, declared: null });
  const [dlg, setDlg] = useState(null);
  const [notice, setNotice] = useState('');
  // the small align bar that appears only while some text is selected (where the selection is)
  const [scale, setScale] = useState(1);
  const [help, setHelp] = useState(() => LS.get('qgen-help') !== 'off');
  // tool panel: open (wide) or slim rail on desktop, drawer on phones. Groups = the open sections.
  const [side, setSide] = useState(() => window.innerWidth >= 1180 && LS.get('qgen-side') !== 'rail');
  const [groups, setGroups] = useState(() => {
    try {
      const v = JSON.parse(LS.get('qgen-groups') || 'null');
      if (Array.isArray(v)) return v;
    } catch (e) {
      /* ignore */
    }
    return window.innerWidth >= 1180 ? ['insert', 'text'] : ['insert'];
  });
  const [font, setFont] = useState(() => LS.get('qgen-font') || 'suttony');
  const [base, setBase] = useState(() => Number(LS.get('qgen-base')) || 16);
  const [orient, setOrient] = useState(() => (LS.get('qgen-orient') === 'landscape' ? 'landscape' : 'portrait'));
  
  // whole paper: 'one' column | 'two' (two equal columns, heading included) | 'twoNoHead' (heading full width, questions in 2 equal columns)
  const [pageMode, setPageMode] = useState(() => {
    let v = LS.get('qgen-pagemode');
    if (v === 'balance') v = 'two';
    if (['seq', 'seqRev', 'strict', 'strictRev', 'flow'].includes(v)) v = 'one'; // fallback for old saved flow mode
    return ['one', 'two', 'twoNoHead'].includes(v) ? v : 'one';
  });

  const [qgap, setQgap] = useState(() => (LS.get('qgen-qgap') !== null ? Number(LS.get('qgen-qgap')) : 4));
  const [lh, setLh] = useState(() => (LS.get('qgen-lh') !== null ? Number(LS.get('qgen-lh')) : 1));
  // page margins in cm, one value for each side (default 0.2 cm on every side)
  const [margins, setMargins] = useState(() => {
    try {
      const v = JSON.parse(LS.get('qgen-margins2') || 'null');
      if (v && ['t', 'r', 'b', 'l'].every((k) => typeof v[k] === 'number')) return v;
    } catch (e) {
      /* ignore */
    }
    return { t: 0.5, r: 1, b: 0.3, l: 1 };
  });
  const setMargin = (k, delta) => {
    const next = { ...margins, [k]: Math.min(5, Math.max(0, Math.round((margins[k] + delta) * 10) / 10)) };
    setMargins(next);
    LS.set('qgen-margins2', JSON.stringify(next));
  };
  const mCss = (v) => `${v}cm`;

  const fileRef = useRef(null);
  const core = () => coreRef.current;
  const D = (n) => (lang === 'en' ? String(n) : toBn(n));
  const page = PAGE[orient];

  // font: the chosen one, or the default for the paper language
  const fontCss =
    (FONTS.find((f) => f.key === font) || {}).css || (lang === 'bn' ? BN_DEFAULT : TIMES);

  // the marks boxes follow the paper's digits: English digits on the English paper, Bangla digits on the Bangla and Math papers
  const convertMarks = useCallback((to) => {
    if (!sheetRef.current) return;
    const conv = to === 'en' ? toEnDigits : toBn;
    sheetRef.current.querySelectorAll('.qmark').forEach((i) => {
      const v = conv(i.value);
      if (v !== i.value) {
        i.value = v;
        i.setAttribute('value', v);
      }
    });
  }, []);

  

  // ---------- start the editor ----------
  useLayoutEffect(() => {
    const c = new Core(rootRef.current, {
      onState: setSt,
      onStats: setStats,
      onNotice: setNotice,
      onMathEdit: (el) =>
        setDlg({
          type: 'math',
          el,
          init: {
            kind: el.dataset.kind || 'frac',
            whole: el.dataset.whole || '',
            num: el.dataset.num || '',
            den: el.dataset.den || '',
            val: el.dataset.val || '',
            npow: el.dataset.npow || '',
            dpow: el.dataset.dpow || '',
            nsub: el.dataset.nsub || '',
            dsub: el.dataset.dsub || '',
            mark: el.dataset.mark || 'hat',
            lines: el.dataset.n || '1',
          },
        }),
    });
    c.init(Core.saved() || blankDoc());
    coreRef.current = c;
    return () => {
      c.destroy();
      coreRef.current = null;
    };
  }, []);

  useEffect(() => {
    LS.set('qgen-lang', lang);
    if (coreRef.current) coreRef.current.setLang(lang);
    convertMarks(lang);
  }, [lang, convertMarks]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  // fit the A4 sheet to the width of the work area (never above 100%, never below the minimum zoom)
  useEffect(() => {
    const fit = () => {
      const ap = document.querySelector('.app');
      let avail = window.innerWidth - 16;
      if (ap) {
        const cs = window.getComputedStyle(ap);
        // on a phone the layout width can grow to fit the wide sheet, so the real screen width caps it
        const full = Math.min(ap.clientWidth, window.screen.width || ap.clientWidth);
        avail = full - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      }
      setScale(Math.max(ZOOM_MIN / 100, Math.min(1, avail / page.px)));
    };
    fit();
    window.addEventListener('resize', fit);
    const ap = document.querySelector('.app');
    const ro = typeof ResizeObserver !== 'undefined' && ap ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(ap);
    return () => { window.removeEventListener('resize', fit); if (ro) ro.disconnect(); };
  }, [page.px]);
  

  // paper zoom: 0 = fit the screen width (the default); otherwise a percentage the teacher chose
  const [zoomPct, setZoomPct] = useState(() => {
    try {
      return Number(localStorage.getItem('qgen-zoom')) || 0;
    } catch (e) {
      return 0;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('qgen-zoom', String(zoomPct));
    } catch (e) {
      /* private mode: the zoom just is not remembered */
    }
  }, [zoomPct]);
  const zoomNow = zoomPct ? zoomPct / 100 : scale;

  // every page is a sheet of its own: the text runs on to the next page when the page is full,
  // 1 column = one wide column per page, the two-column modes = left column, then right, then the next page
  useEffect(() => {
    if (!coreRef.current) return;
    const cmPx = 37.795;
    coreRef.current.setFlow('lr', {
      cols: pageMode === 'one' ? 1 : 2,
      pageH: orient === 'landscape' ? 794 : 1123,
      mt: margins.t * cmPx,
      mb: margins.b * cmPx,
      split: true,
      headInCols: pageMode === 'two',
    });
  }, [pageMode, orient, margins, base, lh, qgap, font, lang]);
  // dir > 0: the next bigger step, dir < 0: the next smaller step (from any zoom, even the fitted one)
  const zoomStep = (dir) => {
    const cur = Math.round(zoomNow * 100);
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > cur) : [...ZOOM_STEPS].reverse().find((z) => z < cur);
    setZoomPct(clampZoom(next === undefined ? cur : next));
  };

  // two fingers on the paper zoom it in / out, centred between the fingers (pinch)
  const zoomRef = useRef(zoomNow);
  zoomRef.current = zoomNow;
  const [pinching, setPinching] = useState(false);
  useEffect(() => {
    const touches = new Map();
    let start = null;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const app = () => document.querySelector('.app');
    const wrap = () => document.querySelector('.sheet-wrap');
    const down = (e) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        start = { d: dist(a, b), z: zoomRef.current };
        window.qgenPinch = true; // the editor leaves the paper alone while the fingers zoom it
        setPinching(true);
      }
    };
    const move = (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2 || !start || !start.d) return;
      const [a, b] = [...touches.values()];
      const m = mid(a, b);
      const zOld = zoomRef.current;
      const zNew = clampZoom(start.z * (dist(a, b) / start.d) * 100) / 100;
      if (Math.abs(zNew - zOld) < 0.005) return;
      // keep the point under the fingers where it is: remember it in paper units first
      const ap = app();
      const w = wrap();
      const ar = ap ? ap.getBoundingClientRect() : null;
      const wr = w ? w.getBoundingClientRect() : null;
      const cx = ar ? (ap.scrollLeft + (m.x - ar.left)) / zOld : 0;
      const cy = wr ? (window.scrollY + m.y - (wr.top + window.scrollY)) / zOld : 0;
      setZoomPct(Math.round(zNew * 100));
      requestAnimationFrame(() => {
        const ap2 = app();
        if (ap2 && ar) ap2.scrollLeft = cx * zNew - (m.x - ar.left);
        if (wr) window.scrollTo(0, wr.top + window.scrollY + cy * zNew - m.y);
      });
    };
    const up = (e) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) {
        start = null;
        window.qgenPinch = false;
        setPinching(false);
      }
    };
    // Ctrl + mouse wheel (or a trackpad pinch) zooms the paper along the same steps as the buttons
    const wheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const cur = Math.round(zoomRef.current * 100);
      const next = e.deltaY < 0 ? ZOOM_STEPS.find((z) => z > cur) : [...ZOOM_STEPS].reverse().find((z) => z < cur);
      if (next !== undefined) setZoomPct(clampZoom(next));
    };
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.qgenPinch = false;
    };
  }, []);

  // ---------- actions ----------
  // The PDF is drawn inside the app at a fixed A4 size (pdfExport.js), so it is the same on a phone and on a computer.
  const layoutRef = useRef(null);
  layoutRef.current = { orient, margins };
  const doPrint = useCallback(async (copies = 1, stack = false) => {
    const stacked = copies === 2 && stack;
    setPrintCopies(copies);
    setPrintStack(stacked);
    setDlg(null);
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 150)); // the dialog closes and the editor settles first
      core() && core().flush();
      const { orient: o, margins: m } = layoutRef.current;
      await exportPdf({
        sheet: sheetRef.current,
        host: printMultiRef.current,
        landscape: o === 'landscape',
        margins: m,
        copies,
        stacked,
        fileName: 'question-paper.pdf',
      });
    } catch (e) {
      console.error(e);
      window.alert('PDF বানাতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setBusy(false);
    }
  }, []);

  const askPrint = () => setDlg({ type: 'print' });

  // back to the default settings: font, sizes, page, margins and gaps. The paper's own text is not changed.
  const resetSettings = () => {
    if (!window.confirm('সব সেটিং ডিফল্টে ফিরবে: ফন্ট, মাপ, পেজ, মার্জিন ও ফাঁক। লেখা বদলাবে না। চালিয়ে যাবেন?')) return;
    pref(setFont, 'qgen-font', 'suttony');
    pref(setBase, 'qgen-base', 16);
    pref(setOrient, 'qgen-orient', 'portrait');
    pref(setPageMode, 'qgen-pagemode', 'one');
    pref(setQgap, 'qgen-qgap', 4);
    pref(setLh, 'qgen-lh', 1);
    setZoomPct(0);
    const d = { t: 0.5, r: 1, b: 0.3, l: 1 };
    setMargins(d);
    LS.set('qgen-margins2', JSON.stringify(d));
    if (core()) core().styleHeader('fontSize', '20px');
  };

  const newPaper = () => {
    if (window.confirm('সব লেখা মুছে নতুন খালি পেপার শুরু করবেন?')) {
      core().load(blankDoc());
      convertMarks(lang);
    }
  };

  const loadSample = () => {
    if (window.confirm('উদাহরণ পেপার লোড করলে এখনকার লেখা বদলে যাবে। চালিয়ে যাবেন?')) {
      core().load(sampleDoc());
      convertMarks(lang);
    }
  };

  const setHelpOn = (on) => {
    setHelp(on);
    LS.set('qgen-help', on ? 'on' : 'off');
  };
  const closeHelp = () => setHelpOn(false);
  const toggleHelp = () => setHelpOn(!help);

  const mismatch = stats.declared != null && stats.sum > 0 && stats.declared !== stats.sum;

  const onSheetInput = (e) => {
    const t = e.target;
    if (!(t.classList && t.classList.contains('qmark'))) return;
    const conv = lang === 'en' ? toEnDigits : toBn;
    const v = conv(t.value);
    if (v !== t.value) {
      const pos = t.selectionStart;
      t.value = v;
      try { t.setSelectionRange(pos, pos); } catch (err) { /* keep the caret at the end */ }
    }
    t.setAttribute('value', v);
  };

  // the small box inside the left edge of a heading line picks it (for the heading style menu)
  const onSheetClick = (e) => {
    const line = e.target.closest && e.target.closest('.hdr > .line');
    if (!line) return;
    const r = line.getBoundingClientRect();
    if (e.clientX >= r.left + 3 && e.clientX <= r.left + 19) line.classList.toggle('picked');
  };

  // small − / + control used for gaps
  const Step = ({ label, text, onDec, onInc }) => (
    <span className="step">
      <span className="tb-label">{label}</span>
      <Btn className="small" title="কমান" onClick={onDec}>−</Btn>
      <span className="step-val">{text}</span>
      <Btn className="small" title="বাড়ান" onClick={onInc}>+</Btn>
    </span>
  );

  // the font and size of the selected text, shown in the two drop-downs.
  // one font / size = that one; several = "মিশ্র" with the list of them
  const fontOf = (name) => FONTS.find((f) => f.css.split(',')[0].replace(/["']/g, '').trim() === name);
  const selFontInfo = (() => {
    const names = st.selFonts || [];
    if (!names.length) return { value: '', note: null };
    if (names.length > 1) return { value: 'mixed', note: { v: 'mixed', t: `মিশ্র: ${names.join(', ')}` } };
    const f = fontOf(names[0]);
    if (f) return { value: f.css, note: null };
    return { value: 'other', note: { v: 'other', t: names[0] } };
  })();
  const selFontValue = selFontInfo.value;
  const selSizeInfo = (() => {
    const list = st.selSizes || [];
    if (!list.length) return { value: '', note: null };
    if (list.length > 1) return { value: 'mixed', note: { v: 'mixed', t: `মিশ্র: ${list.map((n) => D(n)).join(', ')}` } };
    const n = list[0];
    if (SIZES.includes(n)) return { value: String(n), note: null };
    return { value: 'other', note: { v: 'other', t: `${D(n)}` } };
  })();

  // ---------- tool panel (layout only, no editor logic) ----------
  // the panels keep the caret in the paper: a press on a button must not take the focus away
  const keepCaret = (e) => {
    const t = e.target;
    if (t.scrollHeight > t.clientHeight && e.nativeEvent.offsetX >= t.clientWidth) return; // scrollbar
    if (!['INPUT', 'SELECT', 'TEXTAREA', 'OPTION'].includes(t.tagName)) e.preventDefault();
  };
  const changeSide = (v) => {
    setSide(v);
    if (window.innerWidth >= 1180) LS.set('qgen-side', v ? 'open' : 'rail');
  };
  const toggleGroup = (id) => {
    const has = groups.includes(id);
    const phone = window.innerWidth < 1180;
    const next = phone ? (has ? [] : [id]) : !side ? (has ? groups : [...groups, id]) : has ? groups.filter((g) => g !== id) : [...groups, id];
    setGroups(next);
    LS.set('qgen-groups', JSON.stringify(next));
    if (!side) changeSide(true); // from the slim rail: open the panel on that group
  };
  // phones: the panel is a drawer, so it closes after a big action button (not after a drop-down item)
  const autoClose = (e) => {
    if (window.innerWidth < 1180 && e.target.closest('.tile') && !e.target.closest('.menu')) setSide(false);
  };
  const hasCtx = !!(st.blk || st.tbox || st.img || st.math || st.inTable);

  return (
    <div className={`app ${side ? 'side-open' : 'side-rail'}`}>
      {/* the browser print dialog uses this page size */}
      <style>{`@page { size: A4 ${printCopies > 1 ? copyPaper(printCopies, printStack) : orient}; margin: ${printCopies > 1 ? '0' : `${mCss(margins.t)} ${mCss(margins.r)} ${mCss(margins.b)} ${mCss(margins.l)}`}; }`}</style>

      <header className="topbar" onMouseDown={keepCaret}>
        <button
          type="button"
          className="icon-btn"
          title={side ? 'টুলবার ছোট করুন' : 'টুলবার খুলুন'}
          aria-label={side ? 'টুলবার ছোট করুন' : 'টুলবার খুলুন'}
          aria-expanded={side}
          onClick={() => changeSide(!side)}
        >
          <Icon name="panel" size={20} />
        </button>
        <div className="brand">
          <span className="brand-mark">
            <Icon name="doc" size={18} />
          </span>
          <div className="brand-t">
            <h1>প্রশ্নপত্র তৈরি</h1>
            <span className="top-sub">A4 পেপারে সরাসরি লিখুন, শেষে PDF করুন</span>
          </div>
        </div>

        <div className="status" role="status">
          <span className="chip">
            <span className="lg">মোট </span>প্রশ্ন <b>{D(stats.q)}টি</b>
          </span>
          <span className="chip">
            নম্বর <span className="lg">যোগফল </span>
            <b>{D(stats.sum)}</b>
          </span>
          {mismatch && (
            <span className="chip warn-chip">⚠ পূর্ণমান {D(stats.declared)} লেখা আছে, কিন্তু যোগফল {D(stats.sum)}</span>
          )}
          {stats.sum > 0 && (stats.declared == null || mismatch) && (
            <Btn className="small" title="পূর্ণমানের ঘরে যোগফল বসান" onClick={() => core().setTotal(D(stats.sum))}>
              পূর্ণমান {D(stats.sum)} করুন
            </Btn>
          )}
        </div>

        <div className="top-actions">
          <Btn title="আগের অবস্থায় ফিরুন (Ctrl+Z)" onClick={() => core().undo()}>
            <Icon name="undo" />
            <span className="lbl">ফিরুন</span>
          </Btn>
          <Btn title="আবার করুন (Ctrl+Y)" onClick={() => core().redo()}>
            <Icon name="redo" />
            <span className="lbl">আবার</span>
          </Btn>
          <span className="sep" />
          <Btn className="primary" title="PDF বানান বা প্রিন্ট করুন" onClick={askPrint}>
            <Icon name="print" />
            <span className="lbl">PDF / প্রিন্ট</span>
          </Btn>
        </div>
      </header>

      <div className={`scrim ${side ? 'show' : ''}`} onClick={() => changeSide(false)} />

      <aside className={`side ${side ? 'open' : 'rail'}`} aria-label="টুলবার" onMouseDown={keepCaret} onClick={autoClose}>
        <div className="side-head">
          <b>টুলবার</b>
          <button type="button" className="icon-btn" aria-label="বন্ধ করুন" onClick={() => changeSide(false)}>
            <Icon name="x" />
          </button>
        </div>
        <div className="side-scroll">
          <Group title="যোগ করুন" icon="plusSquare" open={groups.includes('insert')} onToggle={() => toggleGroup('insert')}>
            <div className="tiles">
              <Btn className="tile accent big" title="নতুন প্রশ্ন যোগ করুন" onClick={() => core().addBlock('q')}>
                <Icon name="plus" />
                <span>প্রশ্ন যোগ</span>
              </Btn>
              <Btn className="tile" title="বিভাগের শিরোনাম (যেমন: ক বিভাগ)" onClick={() => core().addBlock('sec')}>
                <Icon name="heading" />
                <span>বিভাগ</span>
              </Btn>
              <Btn className="tile" title="নির্দেশনা বা যেকোনো লেখা" onClick={() => core().addBlock('note')}>
                <Icon name="note" />
                <span>লেখা</span>
              </Btn>
              <Menu label={<><Icon name="list" /><span>ক. খ. গ.</span></>} title="উপ-প্রশ্ন বা MCQ অপশন">
                {(close) => (
                  <>
                    <div className="menu-hint">প্রশ্নের ভেতরে ক্লিক করে বাছুন। আবার বাছলে বন্ধ হবে।</div>
                    {SUBLISTS.map(([k, ex, desc]) => (
                      <button
                        key={k}
                        type="button"
                        className="menu-item"
                        onClick={() => {
                          core().subList(k);
                          close();
                        }}
                      >
                        <b>{ex}</b>
                        <small>{desc}</small>
                      </button>
                    ))}
                  </>
                )}
              </Menu>
            </div>
            <div className="sub">গণিত ও চিহ্ন</div>
            <div className="tiles c2">
              <Btn
                className="tile"
                title="ভগ্নাংশ বা বর্গমূল"
                onClick={() => setDlg({ type: 'math', el: null, init: { kind: 'plain', whole: '', num: '', den: '', val: '' } })}
              >
                <Icon name="fraction" />
                <span>ভগ্নাংশ / √</span>
              </Btn>
              <Menu label={<><Icon name="omega" /><span>চিহ্ন</span></>} title="গণিত ও বিশেষ চিহ্ন" wide>
                {() => (
                  <div className="symgrid">
                    {SYMBOLS.map((s) => (
                      <button key={s} type="button" className="sym" onClick={() => core().insertText(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </Menu>
              <Btn className="tile" title="শূন্যস্থান ………" onClick={() => core().insertText('………')}>
                <Icon name="dots" />
                <span>শূন্যস্থান</span>
              </Btn>
              <Menu label={<><Icon name="arrow" /><span>অ্যারো ও আকার</span></>} title="অ্যারো, আকার বা রেখা বসান (বড়-ছোট করা যায়)" wide>
                {() => (
                  <div>
                    <div className="symhead">অক্ষরের অ্যারো (লেখার ভিতরে)</div>
                    <div className="symgrid">
                      {ARROWS.map((a) => (
                        <button key={a} type="button" className="sym" onClick={() => core().insertText(a)}>
                          {a}
                        </button>
                      ))}
                    </div>
                    <div className="symhead">আকার ও আঁকা অ্যারো (বড়-ছোট করা যায়)</div>
                    <div className="shapegrid">
                      {SHAPES.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          className="sym shapebtn"
                          title={s.label}
                          aria-label={s.label}
                          onClick={() => core().insertShape(s.key)}
                        >
                          <span
                            className="shico"
                            style={{
                              width: `${Math.round((26 * s.w) / Math.max(s.w, s.h))}px`,
                              height: `${Math.round((26 * s.h) / Math.max(s.w, s.h))}px`,
                            }}
                            dangerouslySetInnerHTML={{
                              __html: `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${s.svg}</svg>`,
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Menu>
            </div>
            <div className="sub">টেবিল ও ছবি</div>
            <div className="tiles">
              <Btn className="tile" title="টেবিল যোগ করুন" onClick={() => core() && (core().ensureSel(), setDlg({ type: 'table' }))}>
                <Icon name="table" />
                <span>টেবিল</span>
              </Btn>
              <Btn className="tile" title="টেক্সট বক্স: শেষ ক্লিক বা লেখার কার্সার যেখানে ছিল সেখানে বসবে" onClick={() => core().armTextBox()}>
                <Icon name="textbox" />
                <span>টেক্সট বক্স</span>
              </Btn>
              <Btn
                className="tile"
                title="ছবি বসান (প্রশ্ন, লেখা বা টেবিলের ঘরে)"
                onClick={() => {
                  if (core().rememberCaret() && fileRef.current) fileRef.current.click();
                }}
              >
                <Icon name="image" />
                <span>ছবি</span>
              </Btn>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                e.target.value = '';
                if (f) core().addImage(f);
              }}
            />
          </Group>

          <Group title="লেখা" icon="type" open={groups.includes('text')} onToggle={() => toggleGroup('text')}>
            <div className="stack">
              <select
                className="fontsel"
                value={font}
                onChange={(e) => pref(setFont, 'qgen-font', e.target.value)}
                title="পুরো পেপারের ফন্ট"
              >
                <option value="">ফন্ট: ডিফল্ট</option>
                {FONTS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              <select
                className="basesel"
                value={base}
                onChange={(e) => pref(setBase, 'qgen-base', Number(e.target.value))}
                title="পুরো পেপারের মূল লেখার মাপ"
              >
                {BASES.map((s) => (
                  <option key={s} value={s}>মূল মাপ {D(s)}</option>
                ))}
              </select>
              <Menu label={<><Icon name="heading" /><span>হেডার</span></>} title="শিরোনামের লাইনগুলো (স্কুল, সেকশন, পরীক্ষা) একসাথে বদলান">
                {() => (
                  <>
                    <div className="menu-hint">
                      শিরোনামের বাম পাশের ছোট বাক্সে ক্লিক করে লাইন বাছুন। কিছু না বাছালে সব লাইনে বদলাবে।
                    </div>
                    <div className="menu-row">
                      <button type="button" className="tbtn small" onClick={() => core().selectHeader(true)}>সব লাইন বাছুন</button>
                      <button type="button" className="tbtn small" onClick={() => core().selectHeader(false)}>বাছাই তুলুন</button>
                    </div>
                    <div className="menu-row">
                      <Btn title="বামে" onClick={() => core().styleHeader('textAlign', 'left')}>⇤ বাম</Btn>
                      <Btn title="মাঝে" onClick={() => core().styleHeader('textAlign', 'center')}>↔ মাঝ</Btn>
                      <Btn title="ডানে" onClick={() => core().styleHeader('textAlign', 'right')}>⇥ ডান</Btn>
                      <Btn title="বোল্ড বা সাধারণ" onClick={() => core().headerBold()}><b>B</b></Btn>
                    </div>
                    <div className="menu-row">
                      <select
                        className="sizesel"
                        value=""
                        onChange={(e) => e.target.value && core().styleHeader('fontSize', `${e.target.value}px`)}
                        title="শিরোনামের লেখার মাপ"
                      >
                        <option value="">লেখার মাপ বাছুন</option>
                        {SIZES.map((s) => (
                          <option key={s} value={s}>{D(s)}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </Menu>
            </div>
            <div className="sub">নির্বাচিত লেখা</div>
            <div className="seg fill">
                <Btn title="বোল্ড (Ctrl+B)" active={st.bold} onClick={() => core().exec('bold')}><b>B</b></Btn>
                <Btn title="ইটালিক (Ctrl+I)" active={st.italic} onClick={() => core().exec('italic')}><i>I</i></Btn>
                <Btn title="আন্ডারলাইন (Ctrl+U)" active={st.underline} onClick={() => core().exec('underline')}><u>U</u></Btn>
                <Btn title="ঘাত / উপরে ছোট (x²)" active={st.sup} onClick={() => core().exec('superscript')}>x<sup>২</sup></Btn>
                <Btn title="নিচে ছোট (H₂O)" active={st.sub} onClick={() => core().exec('subscript')}>x<sub>২</sub></Btn>
            </div>
            <div className="stack">
              <span className="pick">
                <span className="tb-label" title="সিলেক্ট করা লেখার মাপ">তোমার সিলেক্ট করা লেখার মাপঃ</span>
                <select
                  className="sizesel"
                  value={selSizeInfo.value}
                  onChange={(e) => e.target.value && core().fontSize(`${e.target.value}px`)}
                  title="লেখার মাপ (লেখা সিলেক্ট করে বদলান)"
                >
                  <option value="">সিলেক্ট করা লেখার মাপ</option>
                  {selSizeInfo.note && <option value={selSizeInfo.note.v} disabled>{selSizeInfo.note.t}</option>}
                  {SIZES.map((s) => (
                    <option key={s} value={s}>{D(s)}</option>
                  ))}
                </select>
              </span>
              <span className="pick">
                <span className="tb-label" title="সিলেক্ট করা লেখার ফন্ট">তোমার সিলেক্ট করা লেখার ফন্টঃ</span>
                <select
                  className="fontsel"
                  value={selFontValue}
                  onChange={(e) => e.target.value && core().fontFace(e.target.value)}
                  title="সিলেক্ট করা লেখার ফন্ট (বাংলা বা ইংরেজি অংশ আলাদা ফন্টে লেখা যায়)"
                >
                  <option value="">সিলেক্ট করা লেখার ফন্ট</option>
                  {selFontInfo.note && <option value={selFontInfo.note.v} disabled>{selFontInfo.note.t}</option>}
                  <option value="inherit">পেপারের ডিফল্ট ফন্ট</option>
                  {FONTS.map((f) => (
                    <option key={f.key} value={f.css}>{f.label}</option>
                  ))}
                </select>
              </span>
            </div>
            <div className="fld">
              <span className="fld-l">লাইনের ফাঁক</span>
              <div className="seg fill">
                <Btn title="লাইনের ফাঁক কমান (সিলেক্ট করা লেখা)" onClick={() => core().lineHeight(-0.1)}>↕ কম</Btn>
                <Btn title="লাইনের ফাঁক বাড়ান (সিলেক্ট করা লেখা)" onClick={() => core().lineHeight(0.1)}>↕ বেশি</Btn>
              </div>
            </div>
          </Group>

          <Group title="পেজ" icon="page" open={groups.includes('page')} onToggle={() => toggleGroup('page')}>
            <div className="fld">
              <span className="fld-l">দিক</span>
              <div className="seg fill">
                <Btn
                  active={orient === 'portrait'}
                  title="লম্বা পেজ (পোর্ট্রেট)"
                  onClick={() => pref(setOrient, 'qgen-orient', 'portrait')}
                >
                  লম্বা
                </Btn>
                <Btn
                  active={orient === 'landscape'}
                  title="আড়াআড়ি পেজ (ল্যান্ডস্কেপ)"
                  onClick={() => pref(setOrient, 'qgen-orient', 'landscape')}
                >
                  আড়াআড়ি
                </Btn>
              </div>
            </div>
            <div className="fld">
              <span className="fld-l">জুম</span>
              <div className="ctl-row">
                <div className="seg">
                  <Btn title="কাগজ ছোট করুন" onClick={() => zoomStep(-1)}>−</Btn>
                  <span className="tb-hint">{Math.round(zoomNow * 100)}%</span>
                  <Btn title="কাগজ বড় করুন, মোবাইলে লেখা ও বস্তু বাছাই সহজ হবে" onClick={() => zoomStep(1)}>+</Btn>
                </div>
                <Btn active={!zoomPct} title="পর্দার চওড়া অনুযায়ী কাগজ মানানসই করুন" onClick={() => setZoomPct(0)}>মানানসই</Btn>
              </div>
            </div>
            <div className="ctl-row">
              <Menu label={<><Icon name="columns" /><span>কলাম</span></>} title="পুরো পেপার কত কলামে সাজানো হবে">
                {(close) => {
                  const pick = (mode) => {
                    pref(setPageMode, 'qgen-pagemode', mode);
                    close();
                  };
                  const item = (mode, title) => (
                    <button type="button" className={`menu-item ${pageMode === mode ? 'on' : ''}`} onClick={() => pick(mode)}>
                      <b>{title}</b>
                    </button>
                  );
                  return (
                    <>
                      {item('one', '১ কলাম')}
                      <button type="button" className="menu-item" onClick={() => { core().selCols(2); close(); }}>
                        <b>২ কলাম (সিলেক্টেড লেখা)</b>
                        <small>লেখা সিলেক্ট করে বাছুন, শুধু ওই অংশ ২ কলামে যাবে</small>
                      </button>
                      <button type="button" className="menu-item" onClick={() => { core().selCols(1); close(); }}>
                        <b>সিলেক্টেড লেখা ১ কলামে</b>
                        <small>২ কলামে বসানো লেখাটি আবার সাধারণ হবে</small>
                      </button>
                      {item('two', 'শিরোনামসহ ২ কলাম')}
                      {item('twoNoHead', 'শিরোনাম ছাড়া ২ কলাম')}
                    </>
                  );
                }}
              </Menu>
              <Menu label={<><Icon name="frame" /><span>মার্জিন</span></>} title="পেজের চার দিকের ফাঁক (সেমি)">
                {() => (
                  <>
                    <div className="menu-hint">
                      প্রতি দিকে সেমি। প্রিন্টার অনেক সময় খুব কম ফাঁক (০.২ সেমি) কেটে দেয়। ছাপার আগে প্রিভিউতে দেখে নিন।
                    </div>
                    <div className="margin-grid">
                      {[['t', 'উপর'], ['b', 'নিচ'], ['l', 'বাম'], ['r', 'ডান']].map(([k, lb]) => (
                        <span key={k} className="margin-cell">
                          <span className="tb-label">{lb}</span>
                          <Btn className="small" title="কমান" onClick={() => setMargin(k, -0.1)}>−</Btn>
                          <span className="step-val">{D(margins[k].toFixed(1))}</span>
                          <Btn className="small" title="বাড়ান" onClick={() => setMargin(k, 0.1)}>+</Btn>
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        const d = { t: 0.4, r: 1, b: 0.2, l: 1 };
                        setMargins(d);
                        LS.set('qgen-margins2', JSON.stringify(d));
                      }}
                    >
                      <b>ডিফল্ট: উপর ০.৪ - নিচ ০.২, ডান-বাম ১ সেমি</b>
                      <small>চার দিকে সমান ফাঁক</small>
                    </button>
                  </>
                )}
              </Menu>
            </div>
            <div className="stack">
              <Step
                label="প্রশ্নের ফাঁক"
                text={`${D(qgap)} px`}
                onDec={() => pref(setQgap, 'qgen-qgap', Math.max(0, qgap - 2))}
                onInc={() => pref(setQgap, 'qgen-qgap', Math.min(40, qgap + 2))}
              />
              <Step
                label="লাইনের ফাঁক"
                text={D(lh.toFixed(1))}
                onDec={() => pref(setLh, 'qgen-lh', Math.max(1.2, Number((lh - 0.1).toFixed(1))))}
                onInc={() => pref(setLh, 'qgen-lh', Math.min(2.6, Number((lh + 0.1).toFixed(1))))}
              />
            </div>
          </Group>

          <Group title="ফাইল ও ভাষা" icon="doc" open={groups.includes('file')} onToggle={() => toggleGroup('file')}>
            <div className="tiles c2">
              <Btn className="tile" title="নতুন খালি পেপার" onClick={newPaper}>
                <Icon name="filePlus" />
                <span>নতুন পেপার</span>
              </Btn>
              <Btn className="tile" title="উদাহরণ পেপার দেখুন" onClick={loadSample}>
                <Icon name="doc" />
                <span>উদাহরণ</span>
              </Btn>
            </div>
            <div className="fld">
              <span className="fld-l">পেপারের ভাষা</span>
              <select
                className="langsel"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                title="পেপারের ভাষা: প্রশ্ন নম্বর ও ফন্ট বদলাবে"
              >
                <option value="bn">বাংলা পেপার (১। ২। ৩।)</option>
                <option value="en">English Paper (1. 2. 3.)</option>
                <option value="math">গণিত (বাংলা নম্বর, Times ফন্ট)</option>
              </select>
            </div>
            <div className="stack">
              <Btn className="wide" title="সব সেটিং ডিফল্টে ফিরবে (ফন্ট, মাপ, পেজ, মার্জিন). লেখা বদলাবে না" onClick={resetSettings}>
                <Icon name="reset" />
                <span>ডিফল্ট সেটিং</span>
              </Btn>
              <Btn className="wide" title="কিভাবে ব্যবহার করবেন, দেখান বা লুকান" active={help} onClick={toggleHelp}>
                <Icon name="help" />
                <span>নির্দেশনা</span>
              </Btn>
            </div>
          </Group>
        </div>
      </aside>

      {hasCtx && (
        <div className="dock-wrap">
          <div className="ctxdock" onMouseDown={keepCaret}>
            {st.blk && (
              <div className="ctx-row">
                <span className="tb-label">{BLOCK_LABEL[st.blk] || 'এই অংশটি'}:</span>
                <Btn title="উপরে সরান" onClick={() => core().moveBlock(-1)}>↑ উপরে</Btn>
                <Btn title="নিচে সরান" onClick={() => core().moveBlock(1)}>↓ নিচে</Btn>
                <Btn title="কপি করুন" onClick={() => core().duplicateBlock()}>⧉ কপি</Btn>
                <Btn className="danger" title="মুছে ফেলুন" onClick={() => core().deleteBlock()}>✕ মুছুন</Btn>
              </div>
            )}
            {st.blk && (
              <div className="ctx-row">
                <span className="tb-label">আগে / পরে ফাঁক:</span>
                <Btn title="উপরের ফাঁক কমান" onClick={() => core().spaceBlock('top', -4)}>উপরে −</Btn>
                <Btn title="উপরের ফাঁক বাড়ান" onClick={() => core().spaceBlock('top', 4)}>উপরে +</Btn>
                <Btn title="নিচের ফাঁক কমান" onClick={() => core().spaceBlock('bottom', -4)}>নিচে −</Btn>
                <Btn title="নিচের ফাঁক বাড়ান" onClick={() => core().spaceBlock('bottom', 4)}>নিচে +</Btn>
              </div>
            )}
            {st.tbox && (
              <div className="ctx-row">
                <span className="tb-label">টেক্সট বক্স:</span>
                <Btn active={st.boxStyle === 'box'} title="চারদিকে বর্ডার" onClick={() => core().tboxStyle('box')}>▢ বর্ডার</Btn>
                <Btn active={st.boxStyle === 'line'} title="শুধু নিচে দাগ" onClick={() => core().tboxStyle('line')}>▁ শুধু লাইন</Btn>
                <Btn active={st.boxStyle === 'none'} title="কোনো দাগ নেই" onClick={() => core().tboxStyle('none')}>◻ দাগ নেই</Btn>
                <Btn title="বক্স চওড়া করুন" onClick={() => core().tboxWidth(20)}>↔ +</Btn>
                <Btn title="বক্স সরু করুন" onClick={() => core().tboxWidth(-20)}>↔ −</Btn>
                <Btn className="danger" title="এই টেক্সট বক্সটি মুছুন" onClick={() => core().tboxDelete()}>✕ বক্স মুছুন</Btn>
                <span className={`tb-ok${st.boxRot % 360 === 0 ? '' : ' warn'}`} title="বক্সটি সোজা আছে কি না">
                  {st.boxRot % 360 === 0 ? '✓ সোজা আছে' : `↻ ${st.boxRot}° ঘোরানো (সোজা করতে "সোজা" চাপুন)`}
                </span>
                <label className="tb-deg" title="ঘোরানোর কোণ, যত ডিগ্রি দরকার লিখে Enter চাপুন">
                  কোণ
                  <input
                    key={st.boxRot}
                    type="number"
                    step="1"
                    defaultValue={st.boxRot}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        core().tboxSetRot(Number(e.currentTarget.value));
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={(e) => {
                      if (e.currentTarget.value !== String(st.boxRot)) core().tboxSetRot(Number(e.currentTarget.value));
                    }}
                  />
                  °
                </label>
              </div>
            )}
            {st.img && !st.shape && (
              <div className="ctx-row">
                <span className="tb-label">ছবি:</span>
                <Btn title="ছবি ছোট করুন" onClick={() => core().imgResize(-20)}>− ছোট</Btn>
                <Btn title="ছবি বড় করুন" onClick={() => core().imgResize(20)}>+ বড়</Btn>
                {st.picBox && <Btn title="ছবি আগের মতো সোজা করুন" onClick={() => core().picStraight()}>সোজা</Btn>}
                <span className={`tb-ok${st.picRot % 360 === 0 ? '' : ' warn'}`} title="ছবিটি সোজা আছে কি না">
                  {st.picRot % 360 === 0 ? '✓ সোজা আছে' : `↻ ${st.picRot}° ঘোরানো`}
                </span>
                <span className="tb-hint">উপরের গ্রিপ টেনে সরান, ডান পাশের হাতল টেনে বড়-ছোট করুন</span>
                <Btn className="danger" title="ছবিটি মুছুন" onClick={() => core().imgDelete()}>✕ ছবি মুছুন</Btn>
              </div>
            )}
            {st.img && st.shape && (
              <div className="ctx-row">
                <span className="tb-label">আকার:</span>
                <Btn title="আকার ছোট করুন" onClick={() => core().imgResize(-6)}>− ছোট</Btn>
                <Btn title="আকার বড় করুন" onClick={() => core().imgResize(6)}>+ বড়</Btn>
                <Btn title="দাগ সরু করুন" onClick={() => core().shapeThick(-1)}>সরু −</Btn>
                <Btn title="দাগ মোটা করুন" onClick={() => core().shapeThick(1)}>মোটা +</Btn>
                {st.shape === 'line' && <Btn title="লাইন পুরো চওড়ায় টানুন" onClick={() => core().lineFull()}>↔ পুরো লাইন</Btn>}
                <span className="tb-hint">নীল কোণা টেনে বড়-ছোট ও মোটা-সরু করুন</span>
                <Btn className="danger" title="আকারটি মুছুন" onClick={() => core().imgDelete()}>✕ আকার মুছুন</Btn>
              </div>
            )}
            {st.math && (
              <div className="ctx-row">
                <span className="tb-label">ভগ্নাংশ:</span>
                <Btn title="ভগ্নাংশের আগে কার্সর" onClick={() => core().mathMove('before')}>◀ আগে কার্সর</Btn>
                <Btn title="ভগ্নাংশের পরে কার্সর" onClick={() => core().mathMove('after')}>পরে কার্সর ▶</Btn>
                <Btn title="ভগ্নাংশ বদলান" onClick={() => core().mathEdit()}>✎ বদলান</Btn>
                <Btn className="danger" title="ভগ্নাংশ মুছুন" onClick={() => core().mathDelete()}>✕ মুছুন</Btn>
              </div>
            )}

            {st.inTable && (
              <div className="ctx-row">
                <span className="tb-label">টেবিল ডিজাইন:</span>
                <Btn title="পুরো টেবিল বেছে নিন" onClick={() => core().selectTable()}>▣ পুরো টেবিল</Btn>
                <Btn title="ডানের ঘরের সাথে মার্জ করুন" onClick={() => core().tableMergeRight()}>→ ডানে মেলান</Btn>
                <Btn title="বামের ঘরের সাথে মার্জ করুন" onClick={() => core().tableMergeLeft()}>← বামে মেলান</Btn>
                <Btn title="উপরের ঘরের সাথে মার্জ করুন" onClick={() => core().tableMergeUp()}>↑ উপরে মেলান</Btn>
                <Btn title="নিচের ঘরের সাথে মার্জ করুন" onClick={() => core().tableMergeDown()}>↓ নিচে মেলান</Btn>
                <Btn title="মার্জ করা ঘর আবার ভাগ করুন" onClick={() => core().tableSplit()}>⊟ ঘর ভাগ</Btn>
                <Btn title="মাউস দিয়ে টেনে বাছা ঘরগুলো এক ঘর করুন" onClick={() => core().tableMerge()}>⊞ ঘর মেলান</Btn>
                <span className="sep" />
                <Btn title="কলাম চওড়া করুন" onClick={() => core().tableCol(12)}>↔ কলাম +</Btn>
                <Btn title="কলাম সরু করুন" onClick={() => core().tableCol(-12)}>↔ কলাম −</Btn>
                <Btn title="সারি উঁচু করুন" onClick={() => core().tableRow(10)}>↕ সারি +</Btn>
                <Btn title="সারি নিচু করুন" onClick={() => core().tableRow(-10)}>↕ সারি −</Btn>
                <Btn title="টেবিল বড় করুন" onClick={() => core().tableWidth(10)}>⤢ টেবিল +</Btn>
                <Btn title="টেবিল ছোট করুন" onClick={() => core().tableWidth(-10)}>⤡ টেবিল −</Btn>
                <span className="sep" />
                <Btn title="টেবিল বামে" onClick={() => core().tableAlign('left')}>⇤ বামে</Btn>
                <Btn title="টেবিল মাঝে" onClick={() => core().tableAlign('center')}>↔ মাঝে</Btn>
                <Btn title="টেবিল ডানে" onClick={() => core().tableAlign('right')}>⇥ ডানে</Btn>
                <span className="sep" />
                <Btn title="সারি মুছুন" onClick={() => core().tableRowDelete()}>✕ সারি মুছুন</Btn>
                <Btn title="সারি যোগ করুন" onClick={() => core().tableRowInsert()}>＋ সারি যোগ</Btn>
                <Btn title="কলাম মুছুন" onClick={() => core().tableColDelete()}>✕ কলাম মুছুন</Btn>
                <Btn title="কলাম যোগ করুন" onClick={() => core().tableColInsert()}>＋ কলাম যোগ</Btn>
                <span className="sep" />
                <Btn className="danger" title="টেবিল মুছুন" onClick={() => core().tableDelete()}>✕ টেবিল মুছুন</Btn>
              </div>
            )}
          </div>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      {help && (
        <div className="help">
          <button className="help-x" onClick={closeHelp} aria-label="বন্ধ করুন">✕</button>
          <b>কিভাবে ব্যবহার করবেন</b>
          <ol>
            <li>নিচের A4 পেপারে যেকোনো ঘরে ক্লিক করে সরাসরি লিখুন। শিরোনামে Enter চাপলে নতুন লাইন হবে।</li>
            <li><b>＋ প্রশ্ন</b> চাপুন। প্রশ্ন লিখুন, ডানদিকের ছোট ঘরে নম্বর দিন (যেমন ১০ বা ১ বয়স ১০ = ১০)। English পেপারে নম্বর ইংরেজি সংখ্যায় দেখাবে।</li>
            <li>উপ-প্রশ্ন (ক. খ. গ.), টেবিল, ভগ্নাংশ লাগলে প্রশ্নের ভেতরে ক্লিক করে ওপরের বোতাম চাপুন।</li>
            <li>পেজ ঘরে লম্বা/আড়াআড়ি ও ফাঁক বদলান। “কলাম” মেনু থেকে ১ কলাম, শিরোনামসহ বা শিরোনাম ছাড়া ২ কলাম বাছা যায়। প্রতি পেজ আলাদা পাতা হিসেবে দেখায়।</li>
            <li>পেপারের ভাষা বদলালে লেবেল, নম্বর ও ইঙ্গিত লেখা সেই ভাষায় বদলে যায়। আপনি যা লিখবেন তা যেকোনো ভাষায় হতে পারে।</li>
            <li>প্রশ্নের নম্বরে (১।) ক্লিক করে একাধিক প্রশ্ন বাছা যায়।</li>
            <li><b>🖼️ ছবি</b> চাপলে কম্পিউটার থেকে ছবি বাছা যায়। ছবিটি পেপারে টেনে যেকোনো জায়গায় নেওয়া যায়। ছবিতে ক্লিক করলে বড়-ছোট ও সরানোর বোতাম আসে।</li>
            <li>টেবিলের ঘরগুলো মাউস দিয়ে টেনে বাছলে “ঘর মেলান” কাজ করবে। ঘরের ডান বা নিচের দাগ টেনে কলাম বা সারি বড় করা যায়।</li>
            <li>শেষে <b>🖨️ PDF / প্রিন্ট</b> চেপে PDF হিসেবে সেভ করুন।</li>
          </ol>
          <button className="linkbtn" onClick={loadSample}>📄 উদাহরণ পেপার দেখুন</button>
        </div>
      )}

      {busy && <div className="pdf-busy" role="status">PDF বানানো হচ্ছে…</div>}
      {pinching && <div className="pinch-badge">জুম {Math.round(zoomNow * 100)}%</div>}
      <div
        className="sheet-wrap"
        style={{ zoom: String(zoomNow), '--pw': page.w, '--ph': page.h, '--zi': String(1 / zoomNow) }}
      >
        <div
          ref={sheetRef}
          className={`sheet lang-${lang} ${orient}`}
          style={{
            '--ff': fontCss,
            '--fs': `${base}px`,
            '--lh': String(lh),
            '--qgap': `${qgap}px`,
            '--pc': String(pageMode === 'two' ? 2 : 1),
            '--mt': mCss(margins.t),
            '--mr': mCss(margins.r),
            '--mb': mCss(margins.b),
            '--ml': mCss(margins.l),
          }}
          onInput={onSheetInput}
          onClick={onSheetClick}
        >
          <div ref={rootRef} className={`pm ${pageMode === 'twoNoHead' ? 'nohead' : ''}`} spellCheck={false} />
        </div>
      </div>
      <div ref={printMultiRef} className="print-multi" aria-hidden="true" />
      <p className="seam-note">ধূসর রেখা মোটামুটি পৃষ্ঠার সীমা দেখায়। প্রিন্টের সময় সামান্য ভিন্ন হতে পারে।</p>

      {dlg && dlg.type === 'table' && (
        <TableDialog
          onClose={() => setDlg(null)}
          onApply={(r, c, h) => {
            core().insertTable(r, c, h);
            setDlg(null);
          }}
        />
      )}
      {dlg && dlg.type === 'math' && (
        <MathDialog
          init={dlg.init}
          editing={!!dlg.el}
          onClose={() => setDlg(null)}
          onApply={(a) => {
            // close the dialog first, so its own text box no longer has the focus,
            // then put the formula back in the paper at the saved caret
            const target = dlg.el;
            setDlg(null);
            setTimeout(() => {
              if (target) core().replaceMath(target, a);
              else core().insertMath(a);
            }, 0);
          }}
        />
      )}
      {dlg && dlg.type === 'print' && <PrintDialog onClose={() => setDlg(null)} onPrint={doPrint} />}
    </div>
  );
}

// ---------- dialogs ----------
function TableDialog({ onClose, onApply }) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [header, setHeader] = useState(true);
  const clamp = (v, max) => Math.max(1, Math.min(max, Number(v) || 1));

  return (
    <Modal
      title="টেবিল যোগ করুন"
      onClose={onClose}
      actions={
        <>
          <button className="tbtn" onClick={onClose}>বাতিল</button>
          <button className="tbtn primary" onClick={() => onApply(rows, cols, header)}>টেবিল বসান</button>
        </>
      }
    >
      <p className="muted">টেবিলটি যে প্রশ্নের ভেতরে ক্লিক করেছিলেন সেখানে বসবে।</p>
      <div className="form-row">
        <label>
          সারি (আড়াআড়ি)
          <input type="number" min="1" max="30" value={rows} onChange={(e) => setRows(clamp(e.target.value, 30))} />
        </label>
        <label>
          কলাম (লম্বালম্বি)
          <input type="number" min="1" max="10" value={cols} onChange={(e) => setCols(clamp(e.target.value, 10))} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
        প্রথম সারি শিরোনাম (বোল্ড) হবে
      </label>
      <div className="tbl-prev" style={{ gridTemplateColumns: `repeat(${Math.min(cols, 10)}, 1fr)` }}>
        {Array.from({ length: Math.min(rows, 6) * Math.min(cols, 10) }).map((_, i) => (
          <span key={i} className={header && i < cols ? 'h' : ''} />
        ))}
      </div>
    </Modal>
  );
}

// a small editable part of a fraction / root (keeps x² and x₂ as HTML)
function RichField({ value, onChange, onActive, placeholder, autoFocus, onEnter }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = value || '';
      if (autoFocus) ref.current.focus();
    }
    // only the first value is loaded; after that the field is the source of truth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className="rich"
      contentEditable
      suppressContentEditableWarning
      data-ph={placeholder}
      onFocus={() => onActive({ ref, set: onChange })}
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

// accent marks and the underbar for the accent kind (value = name used in the paper)
function MathDialog({ init, editing, onClose, onApply }) {
  // an old accent mark opens as an underbar with its text as the first line
  const [kind, setKind] = useState(init.kind === 'acc' ? 'ubar' : init.kind);
  const [whole, setWhole] = useState(init.whole);
  const [num, setNum] = useState(init.num);
  const [den, setDen] = useState(init.den);
  const [val, setVal] = useState(init.val);
  // underbar: one text box per line (the bar goes under the last line)
  const [rows, setRows] = useState(() =>
    (init.kind === 'ubar' || init.kind === 'acc') && init.val ? String(init.val).split('\n') : ['', '', '']
  );
  const focusNew = useRef(false);
  useEffect(() => {
    if (!focusNew.current) return;
    focusNew.current = false;
    const ins = document.querySelectorAll('.ub-line input');
    if (ins.length) ins[ins.length - 1].focus();
  }, [rows.length]);
  const rowsClean = rows.map((r) => r.trim()).filter((r) => r !== '');
  const [npow, setNpow] = useState(init.npow || '');
  const [dpow, setDpow] = useState(init.dpow || '');
  const [nsub, setNsub] = useState(init.nsub || '');
  const [dsub, setDsub] = useState(init.dsub || '');
  // where the small text goes: 'normal' (default), 'sup' (ঘাত) or 'sub' (নিচে). It opens the matching boxes.
  const [pos, setPos] = useState(() => (init.npow || init.dpow ? 'sup' : init.nsub || init.dsub ? 'sub' : 'normal'));
  const active = useRef(null); // the field the teacher is typing in

  const fill = (v) => (plainMath(v) ? v : '□');
  const a = {
    kind,
    whole: plainMath(whole) ? whole : '',
    num: fill(num),
    den: fill(den),
    val: kind === 'ubar' ? rowsClean.join('\n') : fill(val),
    // only the boxes of the chosen position are used
    npow: pos === 'sup' && plainMath(npow) ? npow.trim() : '',
    dpow: pos === 'sup' && plainMath(dpow) ? dpow.trim() : '',
    nsub: pos === 'sub' && plainMath(nsub) ? nsub.trim() : '',
    dsub: pos === 'sub' && plainMath(dsub) ? dsub.trim() : '',
  };
  // 'plain' (সাধারণ) is the default: nothing can be inserted until a kind is chosen
  const ok =
    kind === 'frac'
      ? plainMath(num) && plainMath(den)
      : kind === 'sqrt'
        ? plainMath(val)
        : kind === 'ubar'
          ? rowsClean.length > 0
          : false;
  const submit = () => ok && onApply({ ...a, num, den, val: kind === 'ubar' ? a.val : val, whole });

  // superscript / subscript / normal on the field the teacher is in
  const style = (cmd) => {
    const f = active.current;
    if (!f || !f.ref.current) return;
    f.ref.current.focus();
    document.execCommand(cmd, false, null);
    f.set(f.ref.current.innerHTML);
  };

  // choose where the small text goes: ঘাত / নিচে opens its boxes, সাধারণ closes them
  // (the small text boxes below take the power / subscript; the field's own text is only changed when it is selected)
  const choose = (mode, cmd) => {
    setPos(mode);
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) style(cmd);
  };

  return (
    <Modal
      title={editing ? 'ভগ্নাংশ / মূল পরিবর্তন' : 'ভগ্নাংশ / বর্গমূল যোগ করুন'}
      onClose={onClose}
      actions={
        <>
          <button className="tbtn" onClick={onClose}>বাতিল</button>
          <button className="tbtn primary" disabled={!ok} onClick={submit}>
            {editing ? 'বদলান' : 'বসান'}
          </button>
        </>
      }
    >
      <div className="form-row">
        <label>
          ধরন বাছুন
          <select className="sizesel" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
            <option value="plain">সাধারণ (এখনো কিছু বসবে না)</option>
            <option value="frac">ভগ্নাংশ</option>
            <option value="sqrt">বর্গমূল √</option>
            <option value="ubar">নিচে দাগ (আন্ডারবার)</option>
          </select>
        </label>
      </div>

      {kind === 'plain' && (
        <p className="muted">উপরের তালিকা থেকে ভগ্নাংশ বা বর্গমূল বাছুন। তারপর সেই ঘর খুলবে।</p>
      )}

      {kind !== 'plain' && kind !== 'ubar' && (
        <div className="mathbar" onMouseDown={(e) => e.preventDefault()}>
          <span className="tb-label">লেখা কোথায়:</span>
          <Btn active={pos === 'normal'} title="সাধারণ লেখা (ঘাত বা নিচে নয়)" onClick={() => choose('normal', 'removeFormat')}>সাধারণ</Btn>
          <Btn active={pos === 'sup'} title="ঘাত: উপরের ছোট সংখ্যা (x²)" onClick={() => choose('sup', 'superscript')}>x<sup>²</sup> ঘাত</Btn>
          <Btn active={pos === 'sub'} title="নিচের ছোট সংখ্যা (x₂)" onClick={() => choose('sub', 'subscript')}>x<sub>₂</sub> নিচে</Btn>
        </div>
      )}

      {kind === 'frac' && (
        <>
        {pos === 'sup' && (
          <div className="form-row">
            <label>
              লবের ঘাত (উপরের ছোট)
              <input value={npow} onChange={(e) => setNpow(e.target.value)} placeholder="যেমন: ২" onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </label>
            <label>
              হরের ঘাত (উপরের ছোট)
              <input value={dpow} onChange={(e) => setDpow(e.target.value)} placeholder="যেমন: ২" onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </label>
          </div>
        )}
        {pos === 'sub' && (
          <div className="form-row">
            <label>
              লবের নিচের সংখ্যা
              <input value={nsub} onChange={(e) => setNsub(e.target.value)} placeholder="যেমন: ১" onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </label>
            <label>
              হরের নিচের সংখ্যা
              <input value={dsub} onChange={(e) => setDsub(e.target.value)} placeholder="যেমন: ১" onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </label>
          </div>
        )}
        <div className="form-row">
          <label>
            পূর্ণ সংখ্যা (থাকলে)
            <RichField value={init.whole} onChange={setWhole} onActive={(f) => (active.current = f)} placeholder="যেমন: ২" onEnter={submit} />
          </label>
          <label>
            লব (উপরে)
            <RichField value={init.num} onChange={setNum} onActive={(f) => (active.current = f)} placeholder="যেমন: ৩" autoFocus onEnter={submit} />
          </label>
          <label>
            হর (নিচে)
            <RichField value={init.den} onChange={setDen} onActive={(f) => (active.current = f)} placeholder="যেমন: ৪" onEnter={submit} />
          </label>
        </div>
        </>
      )}
      {kind === 'sqrt' && (
        <div className="form-row">
          <label>
            মূলের ভেতরের সংখ্যা বা রাশি
            <RichField value={init.val} onChange={setVal} onActive={(f) => (active.current = f)} placeholder="যেমন: ১৬" autoFocus onEnter={submit} />
          </label>
        </div>
      )}
      {kind === 'ubar' && (
        <div className="form-row">
          <p className="muted">লাইন লিখুন, প্রতি লাইনের পর Enter। সবচেয়ে নিচের লাইনের নিচে দাগ পড়বে (যেমন: ৬৭ / ৭৮ / +৮৯)।</p>
          {rows.map((r, i) => (
            <div key={i} className="ub-line">
              <input
                className="sizesel"
                value={r}
                placeholder={`লাইন ${i + 1}`}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (i === rows.length - 1) {
                      focusNew.current = true;
                      setRows([...rows, '']);
                    }
                  }
                }}
              />
              {rows.length > 1 && (
                <button type="button" className="tbtn small" title="এই লাইন মুছুন" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="tbtn small"
            onClick={() => {
              focusNew.current = true;
              setRows([...rows, '']);
            }}
          >
            ＋ লাইন যোগ
          </button>
        </div>
      )}

      {kind !== 'plain' && (
        <>
        <div className="math-box">
          <span className="muted">প্রিভিউ:</span> <MathPreview a={a} />
        </div>
        <p className="muted">
          {kind === 'ubar'
            ? 'লাইনগুলো লিখে দাগ বসান। Enter চাপলে নতুন লাইন আসবে, যত লাইন দরকার। পরে বদলাতে চাইলে পেপারে ডাবল ক্লিক করুন।'
            : 'ঘরে লিখে সংখ্যা সিলেক্ট করুন, তারপর “ঘাত” বা “নিচে” চাপুন। পরে বদলাতে চাইলে পেপারে ভগ্নাংশের ওপর ডাবল ক্লিক করুন।'}
        </p>
        </>
      )}
    </Modal>
  );
}

function PrintDialog({ onClose, onPrint }) {
  const [copies, setCopies] = useState(1);
  const [stack, setStack] = useState(false); // 2 copies: side by side or one above the other
  return (
    <Modal
      title="PDF / প্রিন্ট সেটিংস"
      onClose={onClose}
      actions={
        <>
          <button className="tbtn" onClick={onClose}>বাতিল</button>
          <button
            className="tbtn primary"
            onClick={() => onPrint(copies, stack)}
          >
            PDF / প্রিন্ট করুন
          </button>
        </>
      }
    >
      <p className="print-copy-intro">একটি A4 পৃষ্ঠায় কতটি একই প্রশ্নপত্র রাখতে চান?</p>
      <div className="print-copy-options" role="radiogroup" aria-label="প্রতি পাতায় কপি">
        {[{ n: 1, title: '১ কপি', desc: 'সাধারণ প্রিন্ট' }, { n: 2, title: '২ কপি', desc: 'এক পাতায় দুটি' }, { n: 4, title: '৪ কপি', desc: 'ল্যান্ডস্কেপ, ২ × ২' }].map((item) => (
          <button key={item.n} type="button" className={`print-copy-option ${copies === item.n ? 'on' : ''}`} onClick={() => setCopies(item.n)} aria-pressed={copies === item.n}>
            <b>{item.title}</b><span>{item.desc}</span>
          </button>
        ))}
      </div>
      {copies === 2 && (
        <>
          <p className="print-copy-intro">দুটি কপি কীভাবে বসবে?</p>
          <div className="print-copy-options two" role="radiogroup" aria-label="দুই কপির বিন্যাস">
            {[{ v: false, title: 'পাশাপাশি', desc: 'ল্যান্ডস্কেপ পাতা' }, { v: true, title: 'উপর-নিচে', desc: 'সোজা কপি, পোর্ট্রেট' }].map((item) => (
              <button key={item.title} type="button" className={`print-copy-option ${stack === item.v ? 'on' : ''}`} onClick={() => setStack(item.v)} aria-pressed={stack === item.v}>
                <b>{item.title}</b><span>{item.desc}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <ol className="steps">
        <li>প্রতিটি কপিতে স্কুলের নাম, পরীক্ষার তথ্য ও প্রশ্নসহ সম্পূর্ণ একই লেখা থাকবে।</li>
        <li>পাশাপাশি ও ৪ কপিতে পেজ A4 Landscape, উপর-নিচে বাছলে A4 Portrait। ফোন ও কম্পিউটারে এই বিন্যাস একই থাকে।</li>
        <li>PDF ফাইল সরাসরি ডাউনলোড হবে। প্রিন্ট করতে ফাইলটি খুলে প্রিন্ট দিন।</li>
      </ol>
    </Modal>
  );
}