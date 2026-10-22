// Small line-icon set for the toolbar (24 x 24 grid, drawn with the current text colour).
const FILE = <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6" />;

const ICONS = {
  doc: (
    <>
      {FILE}
      <path d="M16 13H8M16 17H8M10 9H8" />
    </>
  ),
  filePlus: (
    <>
      {FILE}
      <path d="M12 18v-6M9 15h6" />
    </>
  ),
  page: FILE,
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  print: <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />,
  reset: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
  help: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
    </>
  ),
  type: <path d="M4 7V5h16v2M12 5v14M9 19h6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  plusSquare: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  heading: <path d="M6 4v16M18 4v16M6 12h12" />,
  note: <path d="M4 6h16M4 12h10M4 18h14" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  table: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M12 3v18" />
    </>
  ),
  fraction: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <path d="M5 12h14" />
      <rect x="9" y="16" width="6" height="5" rx="1" />
    </>
  ),
  omega: <path d="M4 20h5v-2.2A8 8 0 1 1 15 17.8V20h5" />,
  dots: <path d="M3 12h2M8 12h2M14 12h2M19 12h2" />,
  arrow: <path d="M4 12h16M14 6l6 6-6 6" />,
  textbox: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M9 10h6M12 10v5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </>
  ),
  columns: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 3v18" />
    </>
  ),
  frame: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </>
  ),
};

export function Icon({ name, size = 18 }) {
  return (
    <svg
      className="ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name] || null}
    </svg>
  );
}