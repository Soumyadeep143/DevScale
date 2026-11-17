import Modal from './Modal';

export default function ConfirmationDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-sm">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-sm border min-h-[40px]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
        <button onClick={onConfirm} disabled={busy} className="rounded-lg px-3.5 py-2 text-sm font-medium text-white min-h-[40px] disabled:opacity-50"
          style={{ background: danger ? 'var(--red)' : 'var(--brand)' }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
