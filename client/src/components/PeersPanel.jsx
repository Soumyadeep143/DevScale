import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Users, Copy, Check, UserPlus, X, UserMinus, Clock, Eye, KeyRound } from 'lucide-react';
import { fetchMyPeerCode, fetchPeers, connectWithPeer, respondToPeerRequest, removePeer } from '../lib/api';
import { normalizePeerCode } from '../lib/peers';
import { formatDate } from '../lib/team';
import PageHeader, { primaryBtn, ghostBtn } from './ui/PageHeader';
import Panel from './ui/Panel';
import EmptyState from './ui/EmptyState';
import LoadingSkeleton from './ui/LoadingSkeleton';
import ConfirmationDialog from './ui/ConfirmationDialog';
import Modal from './ui/Modal';
import { Avatar, Notice, PillTabs, cardStyle, muted } from './team/parts';
import { useSharedChanges } from '../lib/sharedUpdates';

function PeerRow({ peer, sub, children }) {
  return (
    <div className="rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap" style={cardStyle}>
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={peer.name} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{peer.name || 'Unnamed peer'}</p>
          <p className="text-xs" style={muted}>{sub}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">{children}</div>
    </div>
  );
}

export default function PeersPanel({ intent, onIntentDone }) {
  const [myCode, setMyCode] = useState('');
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState('connected');
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [viewing, setViewing] = useState(null);
  const input = useRef(null);

  const load = useCallback(async () => {
    setErr('');
    try {
      const [code, list] = await Promise.all([fetchMyPeerCode(), fetchPeers()]);
      setMyCode(code || '');
      setPeers(list);
    } catch (error) {
      setErr(error.message || 'Could not load peers.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSharedChanges(['peers'], load); // reload live when peers change what they share with you
  useEffect(() => {
    if (intent === 'connect') { input.current?.focus(); onIntentDone && onIntentDone(); }
  }, [intent, onIntentDone]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(myCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setErr('Could not copy automatically — select the code and copy it manually.');
    }
  }

  async function handleConnect(e) {
    e.preventDefault();
    const code = normalizePeerCode(codeInput);
    if (!code || connecting) return;
    setConnecting(true); setErr(''); setNotice('');
    try {
      const result = await connectWithPeer(code);
      setNotice(result?.status === 'accepted'
        ? 'You are now connected — they had already sent you a request.'
        : 'Request sent. They will see it under Incoming requests.');
      setCodeInput('');
      await load();
    } catch (error) {
      setErr(error.message || 'Could not send the request.');
    } finally {
      setConnecting(false);
    }
  }

  async function act(id, fn, success) {
    setBusyId(id); setErr(''); setNotice('');
    try { await fn(); if (success) setNotice(success); await load(); }
    catch (error) { setErr(error.message || 'That did not work.'); }
    finally { setBusyId(null); }
  }

  const incoming = peers.filter((p) => p.status === 'pending' && p.direction === 'incoming');
  const outgoing = peers.filter((p) => p.status === 'pending' && p.direction === 'outgoing');
  const connected = peers.filter((p) => p.status === 'accepted');
  const spin = (id) => (busyId === id ? <Loader2 size={13} className="animate-spin" /> : null);

  return (
    <div className="space-y-5">
      <PageHeader title="Peers" subtitle="Connect with peers using your unique Peer Code." />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border p-4" style={{ ...cardStyle, background: 'linear-gradient(150deg, color-mix(in oklab, var(--brand) 16%, var(--surface)), var(--surface) 70%)' }}>
          <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><KeyRound size={15} style={{ color: 'var(--brand)' }} /> Your Peer Code</p>
          <div className="flex items-center gap-2 mt-3">
            <code className="flex-1 rounded-lg px-3 py-2.5 text-lg font-mono tracking-wider select-all" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              {loading ? '…' : myCode || '—'}
            </code>
            <button onClick={copyCode} disabled={!myCode} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} aria-label="Copy peer code">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs mt-2.5" style={muted}>Share this code with someone you trust. They enter it under “Connect with a Peer”, and you accept their request. It never changes.</p>
        </div>

        <form onSubmit={handleConnect} className="rounded-2xl border p-4" style={cardStyle}>
          <label htmlFor="peer-code-input" className="text-sm font-semibold block" style={{ color: 'var(--text-primary)' }}>Connect with a Peer</label>
          <input id="peer-code-input" ref={input} value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Enter peer code (e.g. PEER-B71M4P)"
            aria-label="Connect with a peer" autoComplete="off" spellCheck={false}
            className="w-full mt-3 rounded-lg px-3 py-2.5 text-sm font-mono outline-none border focus:ring-2 min-h-[44px]"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          <button type="submit" disabled={!codeInput.trim() || connecting} className={`${primaryBtn} w-full mt-3`} style={{ background: 'var(--brand)' }}>
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Send Request
          </button>
        </form>
      </div>

      <Notice err={err} notice={notice} />

      <PillTabs label="Connections" value={tab} onChange={setTab} tabs={[
        { id: 'connected', label: 'Connected', count: connected.length },
        { id: 'incoming', label: 'Incoming', count: incoming.length, dot: incoming.length > 0 },
        { id: 'outgoing', label: 'Outgoing', count: outgoing.length },
      ]} />

      {loading ? <LoadingSkeleton rows={3} label="Loading peers" /> : (
        <div className="space-y-2.5">
          {tab === 'incoming' && (incoming.length === 0 ? <Panel><p className="text-sm text-center py-6" style={muted}>No incoming requests.</p></Panel> : incoming.map((p) => (
            <PeerRow key={p.id} peer={p} sub={`Requested ${formatDate(p.createdAt)}`}>
              <button onClick={() => act(p.id, () => respondToPeerRequest(p.id, true), 'Connected.')} disabled={busyId === p.id} className={primaryBtn} style={{ background: 'var(--brand)' }}>{spin(p.id) || <Check size={14} />} Accept</button>
              <button onClick={() => act(p.id, () => respondToPeerRequest(p.id, false), 'Request rejected.')} disabled={busyId === p.id} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><X size={14} /> Reject</button>
            </PeerRow>
          )))}
          {tab === 'outgoing' && (outgoing.length === 0 ? <Panel><p className="text-sm text-center py-6" style={muted}>Nothing pending.</p></Panel> : outgoing.map((p) => (
            <PeerRow key={p.id} peer={p} sub={`Sent ${formatDate(p.createdAt)} · Pending`}>
              <span className="text-xs flex items-center gap-1 mr-1" style={muted}><Clock size={12} /> Waiting</span>
              <button onClick={() => act(p.id, () => removePeer(p.id), 'Request cancelled.')} disabled={busyId === p.id} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
            </PeerRow>
          )))}
          {tab === 'connected' && (connected.length === 0 ? (
            <EmptyState icon={Users} title="No connected peers yet">Share your code, or enter theirs above.</EmptyState>
          ) : connected.map((p) => (
            <PeerRow key={p.id} peer={p} sub={`Connected since ${formatDate(p.acceptedAt || p.createdAt)}`}>
              <button onClick={() => setViewing(p)} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} aria-label={`View ${p.name || 'peer'}`}><Eye size={14} /> View</button>
              <button onClick={() => setConfirmRemove(p)} disabled={busyId === p.id} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--red)' }}>{spin(p.id) || <UserMinus size={14} />} Remove</button>
            </PeerRow>
          )))}
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name || 'Peer'} maxWidth="max-w-sm">
        {viewing && (
          <div className="flex items-center gap-4">
            <Avatar name={viewing.name} size={56} />
            <dl className="text-sm space-y-1.5">
              <div><dt className="text-xs" style={muted}>Peer Code</dt><dd className="font-mono" style={{ color: 'var(--text-primary)' }}>{viewing.code}</dd></div>
              <div><dt className="text-xs" style={muted}>Connected since</dt><dd style={{ color: 'var(--text-primary)' }}>{formatDate(viewing.acceptedAt || viewing.createdAt)}</dd></div>
            </dl>
          </div>
        )}
      </Modal>
      <ConfirmationDialog open={!!confirmRemove} danger confirmLabel="Remove peer" title="Remove this peer?"
        message={confirmRemove ? `Remove ${confirmRemove.name || 'this peer'}? You will both lose access to each other's shared leads and contacts. Anything already imported stays with the person who imported it.` : ''}
        onConfirm={() => { const p = confirmRemove; setConfirmRemove(null); act(p.id, () => removePeer(p.id), 'Peer removed.'); }}
        onCancel={() => setConfirmRemove(null)} />
    </div>
  );
}
