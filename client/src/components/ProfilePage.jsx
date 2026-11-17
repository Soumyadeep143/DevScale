import { useEffect, useRef, useState } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import { ArrowLeft, Camera, Check, Copy, KeyRound, Loader2, LogOut, Mail, Moon, Plus, ShieldCheck, Sun, Trash2, Users } from 'lucide-react';
import { useJobs } from '../context/JobsContext';
import { fetchMyPeerCode } from '../lib/api';
import { clerkAppearanceFor } from '../lib/clerkAppearance';
import { clerkMessage } from '../lib/clerkMessage';
import { useTheme } from '../lib/useTheme';
import PageHeader, { ghostBtn, primaryBtn } from './ui/PageHeader';
import Panel from './ui/Panel';

const MAX_PHOTO = 10 * 1024 * 1024; // Clerk's limit
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2 min-h-[40px]';
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

function Banner({ kind = 'ok', children }) {
  const bad = kind === 'error';
  return (
    <div role={bad ? 'alert' : 'status'} className="text-sm rounded-lg px-3 py-2"
      style={{ background: `color-mix(in oklab, var(${bad ? '--red' : '--green'}) 12%, var(--surface))`, color: bad ? 'var(--red)' : 'var(--text-primary)' }}>
      {children}
    </div>
  );
}

function Avatar({ user, name, size = 80 }) {
  const initial = (name || user?.primaryEmailAddress?.emailAddress || 'U').trim()[0].toUpperCase();
  return user?.hasImage && user?.imageUrl ? (
    <img src={user.imageUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size, background: 'var(--surface-2)' }} />
  ) : (
    <span aria-hidden="true" className="rounded-full flex items-center justify-center font-semibold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(135deg, var(--brand), var(--purple))' }}>{initial}</span>
  );
}

// Name, photo, emails and appearance are edited here. Password, two-step sign-in, phone and active sessions
// open Clerk's own account window (it does the verification and security checks).
export default function ProfilePage({ onBack }) {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const { session, signOut } = useJobs();
  const { theme, setTheme } = useTheme();

  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchMyPeerCode().then((c) => { if (!cancelled) setCode(c || ''); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  }

  // ---- name
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState(null); // { kind, text }
  useEffect(() => { if (user) { setFirst(user.firstName || ''); setLast(user.lastName || ''); } }, [user?.id, user?.firstName, user?.lastName]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameDirty = !!user && (first.trim() !== (user.firstName || '') || last.trim() !== (user.lastName || ''));

  async function saveName(e) {
    e.preventDefault();
    if (!first.trim() && !last.trim()) { setNameMsg({ kind: 'error', text: 'Enter at least a first name: it is how your peers see you.' }); return; }
    setNameBusy(true); setNameMsg(null);
    try {
      await user.update({ firstName: first.trim(), lastName: last.trim() });
      setNameMsg({ kind: 'ok', text: 'Saved. Your peers will see the new name.' });
    } catch (err) { setNameMsg({ kind: 'error', text: clerkMessage(err) }); }
    finally { setNameBusy(false); }
  }

  // ---- photo
  const fileRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null);
  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) { setPhotoMsg({ kind: 'error', text: 'Use a PNG, JPG, WebP or GIF image.' }); return; }
    if (file.size > MAX_PHOTO) { setPhotoMsg({ kind: 'error', text: 'That image is over 10 MB. Choose a smaller one.' }); return; }
    setPhotoBusy(true); setPhotoMsg(null);
    try { await user.setProfileImage({ file }); setPhotoMsg({ kind: 'ok', text: 'Photo updated.' }); }
    catch (err) { setPhotoMsg({ kind: 'error', text: clerkMessage(err) }); }
    finally { setPhotoBusy(false); }
  }
  async function removePhoto() {
    setPhotoBusy(true); setPhotoMsg(null);
    try { await user.setProfileImage({ file: null }); setPhotoMsg({ kind: 'ok', text: 'Photo removed.' }); }
    catch (err) { setPhotoMsg({ kind: 'error', text: clerkMessage(err) }); }
    finally { setPhotoBusy(false); }
  }

  // ---- emails: add (with a code sent to it), make primary, remove
  const [emailBusy, setEmailBusy] = useState(null);
  const [emailMsg, setEmailMsg] = useState(null);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(null); // the address waiting for its code
  const [emailCode, setEmailCode] = useState('');

  async function run(key, fn, ok) {
    setEmailBusy(key); setEmailMsg(null);
    try { await fn(); if (ok) setEmailMsg({ kind: 'ok', text: ok }); }
    catch (err) { setEmailMsg({ kind: 'error', text: clerkMessage(err) }); }
    finally { setEmailBusy(null); }
  }
  const startAdd = (e) => {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    return run('add', async () => {
      const ea = await user.createEmailAddress({ email });
      await ea.prepareVerification({ strategy: 'email_code' });
      setPending(ea); setEmailCode(''); setAdding(false); setNewEmail('');
    });
  };
  const verify = (e) => {
    e.preventDefault();
    return run('verify', async () => {
      const res = await pending.attemptVerification({ code: emailCode.trim() });
      if (res?.verification?.status !== 'verified') throw new Error('That code did not match. Check it and try again.');
      setPending(null); setEmailCode('');
      await user.reload?.();
      setEmailMsg({ kind: 'ok', text: 'Email verified. You can make it your primary email.' });
    });
  };
  const resend = () => run('resend', async () => { await pending.prepareVerification({ strategy: 'email_code' }); }, 'We sent a new code.');
  const cancelPending = () => run('cancel', async () => { await pending.destroy(); setPending(null); setEmailCode(''); });
  const makePrimary = (ea) => run(`p${ea.id}`, () => user.update({ primaryEmailAddressId: ea.id }), `${ea.emailAddress} is now your primary email.`);
  const removeEmail = (ea) => run(`d${ea.id}`, () => ea.destroy(), `Removed ${ea.emailAddress}.`);

  const name = session?.user?.user_metadata?.display_name || '';
  const email = user?.primaryEmailAddress?.emailAddress || session?.user?.email || '';
  const since = user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : '';
  const emails = user?.emailAddresses || [];

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" subtitle="Your name, photo, email, password and security.">
        {onBack && <button onClick={onBack} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><ArrowLeft size={15} /> Back</button>}
      </PageHeader>

      {!isLoaded || !user ? (
        <div role="status" className="flex items-center justify-center py-20" style={{ color: 'var(--text-muted)' }}><Loader2 size={20} className="animate-spin mr-2" /> Loading your profile…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 space-y-5 min-w-0">
            <Panel title="Personal details" subtitle="Your name is how your peers see you.">
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <Avatar user={user} name={name} />
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <input ref={fileRef} type="file" accept={PHOTO_TYPES.join(',')} className="hidden" onChange={pickPhoto} aria-label="Choose a profile photo" />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      {photoBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} Change photo
                    </button>
                    {user.hasImage && <button type="button" onClick={removePhoto} disabled={photoBusy} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--red)' }}><Trash2 size={14} /> Remove</button>}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>PNG, JPG, WebP or GIF, up to 10 MB.</p>
                </div>
              </div>
              {photoMsg && <div className="mb-3"><Banner kind={photoMsg.kind}>{photoMsg.text}</Banner></div>}

              <form onSubmit={saveName} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="First name" htmlFor="pf-first"><input id="pf-first" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={60} autoComplete="given-name" className={inputCls} style={inputStyle} /></Field>
                  <Field label="Last name" htmlFor="pf-last"><input id="pf-last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={60} autoComplete="family-name" className={inputCls} style={inputStyle} /></Field>
                </div>
                {nameMsg && <Banner kind={nameMsg.kind}>{nameMsg.text}</Banner>}
                <div className="flex justify-end">
                  <button type="submit" disabled={!nameDirty || nameBusy} className={primaryBtn} style={{ background: 'var(--brand)' }}>
                    {nameBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save changes
                  </button>
                </div>
              </form>
            </Panel>

            <Panel title="Email addresses" subtitle="Your primary email is where DevScale sends sign-in and account messages.">
              <ul className="space-y-2">
                {emails.map((ea) => {
                  const primary = ea.id === user.primaryEmailAddressId;
                  const verified = ea.verification?.status === 'verified';
                  return (
                    <li key={ea.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                      <Mail size={15} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-sm flex-1 min-w-[10rem] truncate" style={{ color: 'var(--text-primary)' }}>{ea.emailAddress}</span>
                      {primary && <span className="text-[11px] rounded-full px-2 py-0.5" style={{ background: 'color-mix(in oklab, var(--brand) 18%, var(--surface))', color: 'var(--brand-strong)' }}>Primary</span>}
                      <span className="text-[11px] rounded-full px-2 py-0.5" style={{ background: `color-mix(in oklab, var(${verified ? '--green' : '--amber'}) 18%, var(--surface))`, color: verified ? 'var(--green)' : 'var(--amber)' }}>{verified ? 'Verified' : 'Unverified'}</span>
                      {!primary && verified && (
                        <button type="button" onClick={() => makePrimary(ea)} disabled={!!emailBusy} className="text-xs underline disabled:opacity-50" style={{ color: 'var(--brand)' }}>
                          {emailBusy === `p${ea.id}` ? 'Saving…' : 'Make primary'}
                        </button>
                      )}
                      {!primary && (
                        <button type="button" onClick={() => removeEmail(ea)} disabled={!!emailBusy} aria-label={`Remove ${ea.emailAddress}`} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-2)] disabled:opacity-50" style={{ color: 'var(--red)' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {pending && (
                <form onSubmit={verify} className="mt-3 rounded-xl border p-3 space-y-2.5" style={{ borderColor: 'var(--brand)', background: 'color-mix(in oklab, var(--brand) 6%, var(--surface))' }}>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>We sent a 6-digit code to <strong>{pending.emailAddress}</strong>. Enter it to verify the address.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={emailCode} onChange={(e) => setEmailCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" aria-label="Verification code" placeholder="123456" maxLength={8}
                      className={`${inputCls} !w-40 tracking-widest`} style={inputStyle} />
                    <button type="submit" disabled={!emailCode.trim() || !!emailBusy} className={primaryBtn} style={{ background: 'var(--brand)' }}>{emailBusy === 'verify' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Verify</button>
                    <button type="button" onClick={resend} disabled={!!emailBusy} className="text-xs underline disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>Send a new code</button>
                    <button type="button" onClick={cancelPending} disabled={!!emailBusy} className="text-xs underline disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                  </div>
                </form>
              )}

              {!pending && (adding ? (
                <form onSubmit={startAdd} className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[14rem]"><Field label="New email address" htmlFor="pf-new-email"><input id="pf-new-email" type="email" autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={inputCls} style={inputStyle} /></Field></div>
                  <button type="submit" disabled={!newEmail.trim() || !!emailBusy} className={primaryBtn} style={{ background: 'var(--brand)' }}>{emailBusy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send code</button>
                  <button type="button" onClick={() => { setAdding(false); setNewEmail(''); }} className={ghostBtn} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                </form>
              ) : (
                <button type="button" onClick={() => { setAdding(true); setEmailMsg(null); }} className={`${ghostBtn} mt-3`} style={{ borderColor: 'var(--border)', color: 'var(--brand)' }}><Plus size={14} /> Add an email</button>
              ))}
              {emailMsg && <div className="mt-3"><Banner kind={emailMsg.kind}>{emailMsg.text}</Banner></div>}
            </Panel>

            <Panel title="Appearance" subtitle="Applies on this device.">
              <div role="group" aria-label="Theme" className="inline-flex rounded-full p-1 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                {[['light', 'Light', Sun], ['dark', 'Dark', Moon]].map(([id, label, Icon]) => (
                  <button key={id} type="button" aria-pressed={theme === id} onClick={() => setTheme(id)}
                    className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium min-h-[36px]"
                    style={{ background: theme === id ? 'var(--brand)' : 'transparent', color: theme === id ? '#fff' : 'var(--text-secondary)' }}>
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-5 min-w-0">
            <Panel>
              <div className="flex items-center gap-3">
                <Avatar user={user} name={name} size={56} />
                <div className="min-w-0">
                  <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{name || 'No name set yet'}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{email || '—'}</p>
                  {since && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Member since {since}</p>}
                </div>
              </div>
            </Panel>

            <Panel title="Your peer code" subtitle="Share it so people can connect with you.">
              <div className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                <span className="flex items-center gap-2 min-w-0"><Users size={14} style={{ color: 'var(--text-muted)' }} /><code className="text-sm font-semibold tracking-wide truncate" style={{ color: 'var(--text-primary)' }}>{code || '—'}</code></span>
                <button type="button" onClick={copyCode} disabled={!code} aria-label="Copy peer code" className="text-xs inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-[var(--surface)] disabled:opacity-40" style={{ color: 'var(--brand)' }}>
                  {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
            </Panel>

            <Panel title="Security" subtitle="Password, two-step sign-in, phone and where you're signed in.">
              <div className="space-y-2.5">
                <button type="button" onClick={() => clerk.openUserProfile({ appearance: clerkAppearanceFor(theme) })} className={`${ghostBtn} w-full`} style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  <KeyRound size={15} /> Password &amp; security
                </button>
                <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}><ShieldCheck size={13} className="mt-0.5 shrink-0" /> Opens a secure window to change your password, turn on two-step sign-in, or delete your account.</p>
                <button type="button" onClick={signOut} className={`${ghostBtn} w-full`} style={{ borderColor: 'var(--border)', color: 'var(--red)' }}><LogOut size={15} /> Sign out</button>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
