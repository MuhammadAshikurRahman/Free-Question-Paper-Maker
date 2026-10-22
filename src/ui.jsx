import { useEffect, useRef, useState } from 'react';
import { mathHTML } from './editor.js';
import { Icon } from './icons.jsx';

// Toolbar button. mousedown is cancelled by the toolbar so the caret stays in the paper.
export function Btn({ onClick, active, title, children, className = '', disabled }) {
  return (
    <button
      type="button"
      className={`tbtn ${active ? 'on' : ''} ${className}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// Drop-down menu
export function Menu({ label, title, children, wide }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  return (
    <div className={`menu ${open ? 'open' : ''}`} ref={ref}>
      <Btn onClick={() => setOpen((o) => !o)} active={open} title={title || label}>
        {label}
        <span className="caret" aria-hidden="true" />
      </Btn>
      {open && (
        <div className={`menu-pop ${wide ? 'wide' : ''}`}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, actions }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}

// live preview of a fraction / root (same markup as the paper)
export function MathPreview({ a }) {
  return <span className="math-prev" dangerouslySetInnerHTML={{ __html: mathHTML(a) }} />;
}

// One collapsible section of the tool panel (the slim rail shows only its icon)
export function Group({ title, icon, open, onToggle, children }) {
  return (
    <section className={`grp ${open ? 'open' : ''}`}>
      <button type="button" className="grp-h" aria-expanded={open} title={title} onClick={onToggle}>
        <span className="grp-ic">
          <Icon name={icon} />
        </span>
        <span className="grp-t">{title}</span>
        <span className="chev" aria-hidden="true" />
      </button>
      <div className="grp-body">
        <div className="grp-in">
          <div className="grp-pad">{children}</div>
        </div>
      </div>
    </section>
  );
}