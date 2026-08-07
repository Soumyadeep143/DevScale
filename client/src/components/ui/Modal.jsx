import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const lastFocused = useRef(null);
  // Read through a ref instead of taking onClose as an effect dependency —
  // callers frequently pass an inline arrow that gets a new identity on
  // every one of their re-renders (e.g. App re-renders on every background
  // poll tick). If the effect below depended on onClose directly, it would
  // tear down and re-run on those unrelated renders too, which yanks focus
  // out of whatever's active (like a form field mid-type) and back onto the
  // dialog's first focusable element every time.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Remember what had focus so it can be restored on close, then move
    // focus into the dialog — without this, a screen reader or keyboard
    // user stays "behind" the modal on the page underneath it. If a form
    // field inside already grabbed focus via its own autoFocus (React
    // applies that during commit, before this effect runs), leave it —
    // don't clobber a more specific autoFocus with the header's Close
    // button just because it's first in DOM order.
    lastFocused.current = document.activeElement;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const focusable = panel.querySelectorAll(FOCUSABLE);
      (focusable[0] || panel).focus();
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      lastFocused.current?.focus?.();
    };
    // Deliberately excludes onClose — see onCloseRef above. This effect
    // should only run when the dialog actually opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${maxWidth} rounded-t-2xl sm:rounded-2xl border max-h-[92vh] flex flex-col animate-[modalIn_.18s_ease-out] outline-none`}
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h2 id={titleId} className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 -mr-1 rounded-lg flex items-center justify-center transition-colors hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-thin px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
