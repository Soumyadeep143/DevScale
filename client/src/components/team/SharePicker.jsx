import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Share2 } from 'lucide-react';
import Modal from '../ui/Modal';
import InfiniteScrollSentinel from '../ui/InfiniteScrollSentinel';
import { useWindowedList } from '../../lib/useWindowedList';
import { muted } from './parts';

// Lists the user's OWN personal records so they can be moved to Team (shared with peers). Pick one with
// its own button, or tick several (or all that match the search) and move them together. Moving only
// flips each record's visibility; who can then see it is decided by the database.
export default function SharePicker({ open, onClose, title, items, getTitle, getSub, onShare, onShareMany, busyId, emptyText, footer, noun = 'items' }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [moving, setMoving] = useState(false);

  const shown = useMemo(
    () => items.filter((i) => `${getTitle(i)} ${getSub(i)}`.toLowerCase().includes(q.trim().toLowerCase())),
    [items, q, getTitle, getSub],
  );
  const win = useWindowedList(shown, { pageSize: 40, resetKey: q.trim().toLowerCase() });

  // Forget ticks for records that are gone (moved, deleted, changed elsewhere), and start clean on reopen.
  useEffect(() => {
    setPicked((prev) => {
      const ids = new Set(items.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);
  useEffect(() => { if (!open) { setPicked(new Set()); setQ(''); } }, [open]);

  const shownIds = shown.map((i) => i.id);
  const allShownPicked = shownIds.length > 0 && shownIds.every((id) => picked.has(id));
  const toggle = (id) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked((prev) => {
    const n = new Set(prev);
    shownIds.forEach((id) => (allShownPicked ? n.delete(id) : n.add(id)));
    return n;
  });

  async function moveSelected() {
    const chosen = items.filter((i) => picked.has(i.id));
    if (chosen.length === 0) return;
    setMoving(true);
    try {
      if (onShareMany) await onShareMany(chosen);
      else for (const item of chosen) await onShare(item);
      setPicked(new Set());
      onClose();
    } catch {
      // The page that owns the move reports its own error; keep the dialog open and the ticks in place.
    } finally {
      setMoving(false);
    }
  }

  const count = picked.size;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={muted} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search records to move"
            className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
        </div>

        {shown.length === 0 ? (
          <p className="text-sm text-center py-6" style={muted}>{items.length === 0 ? emptyText : 'Nothing matches your search.'}</p>
        ) : (
          <>
            <label className="flex items-center gap-2.5 px-1 text-sm cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={allShownPicked} onChange={toggleAll} className="w-4 h-4" />
              {q.trim() ? `Select all ${shown.length} matching` : `Select all ${shown.length}`}
            </label>
            <ul className="space-y-2 max-h-[46vh] overflow-y-auto scrollbar-thin">
              {win.visible.map((i) => {
                const checked = picked.has(i.id);
                return (
                  <li key={i.id} className="flex items-center gap-3 rounded-xl border p-3 transition-colors"
                    style={{ borderColor: checked ? 'var(--brand)' : 'var(--border)', background: checked ? 'color-mix(in oklab, var(--brand) 8%, var(--surface))' : 'transparent' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(i.id)} aria-label={`Select ${getTitle(i)}`} className="w-4 h-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{getTitle(i)}</p>
                      <p className="text-xs truncate" style={muted}>{getSub(i)}</p>
                    </div>
                    <button onClick={() => onShare(i)} disabled={busyId === i.id || moving} aria-label={`Move ${getTitle(i)} to Team`}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white min-h-[36px] disabled:opacity-50" style={{ background: 'var(--brand)' }}>
                      {busyId === i.id ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />} Move to Team
                    </button>
                  </li>
                );
              })}
              <li><InfiniteScrollSentinel hasMore={win.hasMore} loading={false} onLoadMore={win.loadMore} loadedCount={win.visible.length} noun={noun} /></li>
            </ul>
          </>
        )}

        {count > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 sticky bottom-0" style={{ borderColor: 'var(--brand)', background: 'var(--surface)' }}>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }} role="status">{count} selected</span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPicked(new Set())} className="text-xs underline" style={{ color: 'var(--text-secondary)' }}>Clear</button>
              <button type="button" onClick={moveSelected} disabled={moving}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60 min-h-[40px]" style={{ background: 'var(--brand)' }}>
                {moving ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Move {count} to Team
              </button>
            </div>
          </div>
        )}
        {footer}
      </div>
    </Modal>
  );
}
