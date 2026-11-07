// Saved papers, the school header template, and the file helpers (save, open, share).
// Everything is kept in this browser (localStorage). A paper can also be saved to a .json file,
// to move it to another phone or computer.

const PAPERS_KEY = 'qgen-papers';
const TPL_KEY = 'qgen-school-tpl';
const FILE_FORMAT = 'question-paper-papers';
const LANGS = ['bn', 'en', 'math'];

const validPaper = (p) => !!p && typeof p.name === 'string' && typeof p.html === 'string';

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return d.toLocaleString();
  }
}

// ---------- school header template (name + address) ----------
export function getSchoolTpl() {
  try {
    const v = JSON.parse(localStorage.getItem(TPL_KEY) || 'null');
    if (!v || typeof v !== 'object') return null;
    return { school: String(v.school || ''), address: String(v.address || '') };
  } catch (e) {
    return null;
  }
}

// tpl = { school, address }, or null to forget it
export function setSchoolTpl(tpl) {
  try {
    if (tpl) localStorage.setItem(TPL_KEY, JSON.stringify(tpl));
    else localStorage.removeItem(TPL_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- saved papers (this browser) ----------
export function getPapers() {
  try {
    const v = JSON.parse(localStorage.getItem(PAPERS_KEY) || '[]');
    return Array.isArray(v) ? v.filter(validPaper) : [];
  } catch (e) {
    return [];
  }
}

export function putPapers(list) {
  try {
    localStorage.setItem(PAPERS_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false; // the space this site has in the browser is full
  }
}

// A paper that comes from a file was made by someone else: it is cleaned before it goes into the editor.
// Scripts, event handlers (onerror, onclick ...) and javascript: links are removed.
// Returns the clean html, or null when the text is not a paper.
export function cleanPaperHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${String(html)}</body>`, 'text/html');
  const body = doc.body;
  body.querySelectorAll('script, iframe, object, embed, link, meta, style, base, form').forEach((el) => el.remove());
  body.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((a) => {
      const name = a.name.toLowerCase();
      const value = a.value.replace(/\s/g, '').toLowerCase();
      const link = name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action' || name === 'formaction';
      if (name.startsWith('on') || (link && value.startsWith('javascript:'))) el.removeAttribute(a.name);
    });
  });
  if (!body.querySelector('.hdr')) return null;
  return body.innerHTML;
}

// the file: { format, version, savedAt, papers: [{ name, lang, html, savedAt }] }
export function papersFile(papers) {
  return JSON.stringify(
    {
      format: FILE_FORMAT,
      version: 1,
      savedAt: new Date().toISOString(),
      papers: papers.map(({ name, lang, html, savedAt }) => ({ name, lang, html, savedAt })),
    },
    null,
    2,
  );
}

// reads a file made by papersFile (or one single paper); returns the good papers with new ids
export function readPapersFile(text) {
  let v;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return { papers: [], error: 'ফাইলটি পড়া যায়নি। সেভ করা পেপারের .json ফাইলটি বাছুন।' };
  }
  const list = v && Array.isArray(v.papers) ? v.papers : v && typeof v.html === 'string' ? [v] : [];
  const papers = [];
  list.forEach((p) => {
    if (!validPaper(p)) return;
    const html = cleanPaperHtml(p.html);
    if (!html) return;
    papers.push({
      id: newId(),
      name: p.name.trim().slice(0, 120) || 'নামহীন পেপার',
      lang: LANGS.includes(p.lang) ? p.lang : 'bn',
      html,
      savedAt: typeof p.savedAt === 'string' ? p.savedAt : new Date().toISOString(),
    });
  });
  return { papers, error: papers.length ? '' : 'এই ফাইলে সেভ করা কোনো পেপার পাওয়া যায়নি।' };
}

// ---------- files and sharing ----------
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// can this browser share a PDF file (phone share sheet: WhatsApp, Messenger ...)?
export function canSharePdf() {
  try {
    if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
    return navigator.canShare({ files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] });
  } catch (e) {
    return false;
  }
}

// ---------- print options: page numbers, footer text, watermark (this browser) ----------
const PRINT_KEY = 'qgen-print-opts';
const PRINT_DEFAULT = { pageNumbers: false, footerText: '', watermark: '' };

export function getPrintOpts() {
  try {
    const v = JSON.parse(localStorage.getItem(PRINT_KEY) || 'null');
    if (!v || typeof v !== 'object') return { ...PRINT_DEFAULT };
    return {
      pageNumbers: !!v.pageNumbers,
      footerText: String(v.footerText || '').slice(0, 200),
      watermark: String(v.watermark || '').slice(0, 60),
    };
  } catch (e) {
    return { ...PRINT_DEFAULT };
  }
}

export function setPrintOpts(opts) {
  try {
    localStorage.setItem(PRINT_KEY, JSON.stringify(opts));
    return true;
  } catch (e) {
    return false;
  }
}