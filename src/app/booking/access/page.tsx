'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function BookingAccessPage() {
  const router = useRouter();
  const started = useRef(false);
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!token) return;
    window.history.replaceState(null, '', window.location.pathname);
    setBusy(true);
    fetch('/api/public/booking-access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'exchange', token }) })
      .then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); router.replace(`/booking/${encodeURIComponent(data.data.reservationId)}`); })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'The link could not be checked.'))
      .finally(() => setBusy(false));
  }, [router]);
  async function requestLink(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/public/booking-access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request', reference, email }) });
      const data = await response.json(); setMessage(response.ok ? data.data.message : data.error);
    } catch { setMessage('Could not reach the server. Please try again.'); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-lg space-y-4 px-4 py-12"><h1 className="text-2xl font-semibold">Access a guest booking</h1><p className="text-sm text-navy-600">Enter the booking reference and email used for your reservation. We will send a secure link if email delivery is available.</p><form onSubmit={requestLink} className="card space-y-4 p-4"><div><label className="label block" htmlFor="reference">Booking reference</label><input id="reference" className="field" required value={reference} onChange={(e) => setReference(e.target.value)} /></div><div><label className="label block" htmlFor="email">Email address</label><input id="email" type="email" className="field" required value={email} onChange={(e) => setEmail(e.target.value)} /></div><button className="btn-primary min-h-11" disabled={busy}>Send secure link</button></form>{message ? <p role="status" className="text-sm text-navy-700">{message}</p> : null}<Link className="link" href="/login">Already have an account? Sign in</Link></main>;
}
