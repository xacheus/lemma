'use client';

import { AlertTriangle, CalendarCheck, Check, Info, Loader2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/overlays';
import { CheckboxRow, DateInput, Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/forms';
import { Alert, StatusChip } from '@/components/ui';
import { useApp } from '@/components/providers/app';
import { formatKwacha } from '@/lib/domain/money';
import { addISO, dayDiff, formatMediumDate, isValidISODate } from '@/lib/domain/dates';
import { BOOKING_STATUS_META, PAYMENT_METHOD_META, SOURCE_META } from '@/lib/domain/status';
import type { BookingSource, PaymentMethod } from '@/lib/domain/types';
import { nightsBetween } from '@/lib/domain/availability';

interface Prefill {
  apartmentId?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  source?: BookingSource;
  /** Attach the new stay to an existing guest record instead of creating one. */
  guestId?: string;
}

interface ProbeResult {
  available: boolean;
  conflicts: { reference: string; checkIn: string; checkOut: string; guestName: string; status: string }[];
  advisories: string[];
  reason?: string;
}

/**
 * Create or amend a reservation. Availability is probed as the receptionist types
 * and re-checked authoritatively on submit — the form can describe a conflict, but
 * the server is what refuses it.
 */
export function ReservationFormDialog({
  open,
  onClose,
  prefill,
  reservationId,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: Prefill;
  reservationId?: string | null;
}) {
  const { snapshot, request, busy, toast } = useApp();
  const editing = !!reservationId;
  const existing = editing ? (snapshot?.reservations ?? []).find((r) => r.id === reservationId) : null;

  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [guestQuery, setGuestQuery] = useState('');
  const [guestId, setGuestId] = useState<string | null>(null);
  const [form, setForm] = useState(() => blank(snapshot?.today ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [takeDeposit, setTakeDeposit] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | null>(null);

  function blank(today: string) {
    return {
      fullName: '',
      phone: '',
      email: '',
      nationalId: '',
      idType: 'nrc' as 'nrc' | 'passport',
      apartmentId: prefill?.apartmentId ?? '',
      checkIn: prefill?.checkIn ?? today,
      checkOut: prefill?.checkOut ?? addISO(prefill?.checkIn ?? today, 2),
      guestCount: prefill?.guests ?? 2,
      nightlyRate: '',
      discount: '',
      source: (prefill?.source ?? 'phone') as BookingSource,
      arrivalTime: '14:00',
      notes: '',
      depositAmount: '',
      depositMethod: 'airtel_money' as PaymentMethod,
      depositReference: '',
      status: 'reserved' as 'reserved' | 'inquiry' | 'fully_paid',
    };
  }

  // hydrate for editing
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setProbe(null);
    setSaved(false);
    if (existing) {
      setMode('existing');
      setGuestId(existing.guestId);
      setGuestQuery(existing.guest?.fullName ?? '');
      setForm({
        ...blank(snapshot?.today ?? ''),
        fullName: existing.guest?.fullName ?? '',
        phone: existing.guest?.phone ?? '',
        email: existing.guest?.email ?? '',
        nationalId: existing.guest?.nationalId ?? '',
        idType: (existing.guest?.idType as 'nrc' | 'passport') ?? 'nrc',
        apartmentId: existing.apartmentId,
        checkIn: existing.checkIn,
        checkOut: existing.checkOut,
        guestCount: existing.guestCount,
        nightlyRate: String(existing.nightlyRate),
        discount: existing.discount ? String(existing.discount) : '',
        source: existing.source,
        arrivalTime: existing.arrivalTime,
        notes: existing.notes,
        status: existing.status === 'fully_paid' ? 'fully_paid' : 'reserved',
      });
      setTakeDeposit(false);
    } else {
      const apartment = snapshot?.apartments.find((a) => a.id === prefill?.apartmentId);
      const knownGuest = prefill?.guestId ? (snapshot?.guests ?? []).find((g) => g.id === prefill.guestId) ?? null : null;
      setMode(knownGuest ? 'existing' : 'new');
      setGuestId(knownGuest?.id ?? null);
      setGuestQuery(knownGuest?.fullName ?? '');
      setForm({
        ...blank(snapshot?.today ?? ''),
        ...(prefill ?? {}),
        nightlyRate: apartment ? String(apartment.nightlyRate) : '',
        depositAmount: apartment ? String(Math.round((nightsBetween(form.checkIn, form.checkOut) * apartment.nightlyRate) / 2)) : '',
      });
      setTakeDeposit(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reservationId]);

  const apartment = snapshot?.apartments.find((a) => a.id === form.apartmentId) ?? null;
  const nights = nightsBetween(form.checkIn, form.checkOut);
  const rate = form.nightlyRate === '' ? (apartment?.nightlyRate ?? 0) : Number(form.nightlyRate);
  const discount = Number(form.discount || 0);
  const total = Math.max(0, nights * rate - discount);
  const depositPercent = snapshot?.settings.booking.depositPercent ?? 50;
  const depositDue = Math.round((total * depositPercent) / 100);
  const paidSoFar = existing?.verifiedPaid ?? 0;
  const pendingSoFar = existing?.pendingVerification ?? 0;
  const balance = Math.max(0, total - paidSoFar - (takeDeposit ? Number(form.depositAmount || 0) : 0));

  const guestOptions = useMemo(() => {
    const list = snapshot?.guests ?? [];
    const q = guestQuery.trim().toLowerCase();
    if (!q) return list.slice(0, 6);
    return list
      .filter((g) => g.fullName.toLowerCase().includes(q) || g.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) || g.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [guestQuery, snapshot]);

  // debounce an availability probe whenever the material fields change
  useEffect(() => {
    if (!open || !form.apartmentId || !isValidISODate(form.checkIn) || !isValidISODate(form.checkOut)) {
      setProbe(null);
      return;
    }
    if (dayDiff(form.checkIn, form.checkOut) <= 0) {
      setProbe({ available: false, conflicts: [], advisories: [], reason: 'invalid_dates' });
      return;
    }
    setProbing(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const params = new URLSearchParams({
        apartmentId: form.apartmentId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        guests: String(form.guestCount),
        allowPast: 'true',
      });
      if (reservationId) params.set('exclude', reservationId);
      try {
        const result = await request<{ snapshot?: never } & ProbeResult>(`/api/reservations?${params.toString()}`);
        setProbe(result as unknown as ProbeResult);
      } catch {
        setProbe(null);
      } finally {
        setProbing(false);
      }
    }, 280);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.apartmentId, form.checkIn, form.checkOut, form.guestCount, reservationId]);

  useEffect(() => {
    if (!open) return;
    const apartment = snapshot?.apartments.find((a) => a.id === form.apartmentId);
    if (apartment && !editing && form.nightlyRate === '') {
      setForm((f) => ({ ...f, nightlyRate: String(apartment.nightlyRate), depositAmount: String(Math.round((nights * apartment.nightlyRate) / 2)) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.apartmentId, open]);

  function set<K extends keyof ReturnType<typeof blank>>(key: K, value: ReturnType<typeof blank>[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key as string]: '' }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!snapshot) return;
    const nextErrors: Record<string, string> = {};
    if (mode === 'new') {
      if (form.fullName.trim().length < 2) nextErrors.fullName = 'Full name is required.';
      if (form.phone.replace(/\D/g, '').length < 9) nextErrors.phone = 'Enter a reachable Zambian number, e.g. +260 977 415 208.';
      if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(form.email)) nextErrors.email = 'That email address looks incomplete.';
      if (!form.nationalId.trim()) nextErrors.nationalId = 'NRC or passport number is required for the register.';
    } else if (!guestId) {
      nextErrors.guest = 'Choose the guest from the register, or switch to “New guest”.'.trim();
    }
    if (!form.apartmentId) nextErrors.apartmentId = 'Select the apartment to sell.';
    if (!isValidISODate(form.checkIn)) nextErrors.checkIn = 'Pick the arrival date.';
    if (!isValidISODate(form.checkOut)) nextErrors.checkOut = 'Pick the departure date.';
    if (dayDiff(form.checkIn, form.checkOut) <= 0) nextErrors.checkOut = 'Departure must be at least one night after arrival.';
    if (apartment && form.guestCount > apartment.maxGuests) nextErrors.guestCount = `Apt ${apartment.number} sleeps ${apartment.maxGuests} at most.`;
    if (rate <= 0) nextErrors.nightlyRate = 'Enter the nightly rate in Kwacha.';
    if (takeDeposit && Number(form.depositAmount) <= 0) nextErrors.depositAmount = 'Enter the deposit actually received, or untick it.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const payload = {
      ...(mode === 'existing' ? { guestId } : {}),
      ...(mode === 'new'
        ? {
            guest: {
              fullName: form.fullName.trim(),
              phone: form.phone.trim(),
              email: form.email.trim(),
              nationalId: form.nationalId.trim(),
              idType: form.idType,
            },
          }
        : {}),
      apartmentId: form.apartmentId,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      guestCount: Number(form.guestCount),
      nightlyRate: Number(rate),
      discount: Number(discount || 0),
      source: form.source,
      arrivalTime: form.arrivalTime,
      notes: form.notes,
      status: form.status,
      ...(!editing && takeDeposit
        ? {
            initialDeposit: {
              amount: Number(form.depositAmount),
              method: form.depositMethod,
              reference: form.depositReference.trim() || undefined,
            },
          }
        : {}),
      ...(!editing ? { asInquiry: form.status === 'inquiry' } : {}),
    };

    try {
      if (editing) {
        await request(`/api/reservations/${reservationId}`, { method: 'PATCH', data: payload });
        toast({ tone: 'success', title: 'Reservation updated', body: `${existing?.reference ?? ''} now runs ${formatMediumDate(form.checkIn)} – ${formatMediumDate(form.checkOut)}.` });
      } else {
        const result = await request<{ reference: string }>(`/api/reservations`, { method: 'POST', data: payload });
        setSaved(true);
        toast({ tone: 'success', title: 'Booking created', body: `${result.reference} · ${formatKwacha(total)} for ${nights} night${nights === 1 ? '' : 's'}.` });
      }
      onClose();
    } catch (error) {
      const err = error as { details?: { conflicts?: ProbeResult['conflicts'] }; message?: string; code?: string };
      if (err.code === 'date_conflict' && err.details?.conflicts?.length) {
        setProbe({
          available: false,
          conflicts: err.details.conflicts,
          advisories: [],
        });
      }
      setErrors((e) => ({ ...e, submit: err.message ?? 'The booking could not be saved.' }));
    }
  }

  const apartmentOptions = [
    { value: '', label: 'Choose an apartment…' },
    ...(snapshot?.apartments ?? []).map((a) => ({
      value: a.id,
      label: `Apt ${a.number} — ${a.name}`,
      note: `${formatKwacha(a.nightlyRate)} · sleeps ${a.maxGuests}${a.tonightStatus === 'out_of_service' ? ' · inactive' : ''}`,
      disabled: !a.active,
    })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${existing?.reference ?? 'reservation'}` : 'New booking'}
      subtitle={
        editing
          ? 'Amendments are re-checked against live availability; the folio recalculates automatically.'
          : 'Availability, pricing and the deposit are calculated as you go. Nothing is sold twice.'
      }
      footer={
        <>
          <button type="button" className="btn-secondary h-10 px-4" onClick={onClose}>
            Close
          </button>
          <button type="submit" form="reservation-form" className="btn-primary h-10 px-5" disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {editing ? 'Save changes' : saved ? 'Created' : 'Create booking'}
          </button>
        </>
      }
    >
      <form id="reservation-form" onSubmit={submit} className="space-y-5">
        {!editing ? (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="label">Guest</p>
              <div className="flex items-center gap-1 rounded-lg border border-sand-300 bg-white p-0.5">
                <button type="button" onClick={() => setMode('new')} className={`rounded-md px-2.5 py-1 text-[0.75rem] font-semibold ${mode === 'new' ? 'bg-navy-800 text-white' : 'text-navy-500'}`}>
                  <UserPlus size={12} className="mr-1 inline" />
                  New guest
                </button>
                <button type="button" onClick={() => setMode('existing')} className={`rounded-md px-2.5 py-1 text-[0.75rem] font-semibold ${mode === 'existing' ? 'bg-navy-800 text-white' : 'text-navy-500'}`}>
                  Register
                </button>
              </div>
            </div>

            {mode === 'new' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput label="Full name" required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="e.g. John Banda" error={errors.fullName} />
                <TextInput label="Phone number" required value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+260 977 415 208" error={errors.phone} />
                <TextInput label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="guest@example.co.zm" error={errors.email} />
                <div className="grid grid-cols-[1fr_6.5rem] gap-2">
                  <TextInput label="NRC / Passport" required value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} placeholder="389104/61/1" error={errors.nationalId} />
                  <SelectInput
                    label="Type"
                    value={form.idType}
                    onChange={(e) => set('idType', e.target.value as 'nrc' | 'passport')}
                    options={[
                      { value: 'nrc', label: 'NRC' },
                      { value: 'passport', label: 'Passport' },
                    ]}
                  />
                </div>
              </div>
            ) : (
              <div>
                <TextInput
                  label="Search the guest register"
                  value={guestQuery}
                  onChange={(e) => {
                    setGuestQuery(e.target.value);
                    setGuestId(null);
                  }}
                  placeholder="Name, phone or email"
                  error={errors.guest}
                />
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {guestOptions.map((g) => {
                    const selected = guestId === g.id;
                    const totals = snapshot?.guestTotals?.[g.id];
                    return (
                      <button
                        type="button"
                        key={g.id}
                        onClick={() => {
                          setGuestId(g.id);
                          setGuestQuery(g.fullName);
                          setErrors((e) => ({ ...e, guest: '' }));
                        }}
                        className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left transition ${
                          selected ? 'border-teal-400 bg-teal-50' : 'border-sand-200 bg-white hover:border-sand-400'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[0.84rem] font-semibold text-navy-800">{g.fullName}</span>
                          <span className="block truncate text-[0.72rem] text-navy-400">
                            {g.phone} · {g.email || 'no email'}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[0.68rem] leading-tight text-navy-500">
                          {totals?.stays ?? 0} stays
                          <br />
                          <span className={totals && totals.outstanding > 0 ? 'font-semibold text-st-cancelled' : 'text-navy-400'}>
                            {totals && totals.outstanding > 0 ? `${formatKwacha(totals.outstanding)} due` : 'no balance'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {!guestOptions.length ? <p className="col-span-2 py-3 text-center text-[0.8rem] text-navy-400">No guest matches that search.</p> : null}
                </div>
              </div>
            )}
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-[1fr_1fr] lg:grid-cols-4">
          <Field label="Apartment" required error={errors.apartmentId} className="sm:col-span-2 lg:col-span-2">
            <SelectInput value={form.apartmentId} onChange={(e) => set('apartmentId', e.target.value)} options={apartmentOptions} />
          </Field>
          <DateInput label="Check-in" required value={form.checkIn} min={editing ? undefined : addISO(snapshot?.today ?? '', -30)} onChange={(e) => set('checkIn', e.target.value)} error={errors.checkIn} />
          <DateInput label="Check-out" required value={form.checkOut} min={form.checkIn} onChange={(e) => set('checkOut', e.target.value)} error={errors.checkOut} />
          <SelectInput
            label="Guests"
            value={String(form.guestCount)}
            onChange={(e) => set('guestCount', Number(e.target.value))}
            error={errors.guestCount}
            options={Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} guest${i ? 's' : ''}`, disabled: !!apartment && i + 1 > apartment.maxGuests }))}
          />
          <MoneyInput label="Rate per night" required value={form.nightlyRate} onValueChange={(n) => set('nightlyRate', String(n))} error={errors.nightlyRate} hint={apartment ? `Rack rate ${formatKwacha(apartment.nightlyRate)}` : 'Set once an apartment is chosen'} />
          <MoneyInput label="Discount" value={form.discount} onValueChange={(n) => set('discount', String(n))} hint="Long-stay or corporate concession" />
          <SelectInput
            label="Booking source"
            value={form.source}
            onChange={(e) => set('source', e.target.value as BookingSource)}
            options={(Object.keys(SOURCE_META) as BookingSource[]).map((key) => ({ value: key, label: SOURCE_META[key] }))}
          />
          <Field label="Expected arrival">
            <input type="time" value={form.arrivalTime} onChange={(e) => set('arrivalTime', e.target.value)} className="field" />
          </Field>
        </section>

        {/* live availability read-out */}
        <section className="rounded-xl border border-sand-200 bg-sand-50/70 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[0.82rem] font-semibold text-navy-700">
              <CalendarCheck size={15} className="text-navy-400" />
              {nights} night{nights === 1 ? '' : 's'} · {formatMediumDate(form.checkIn)} → {formatMediumDate(form.checkOut)}
            </p>
            <p className="text-[0.8rem] text-navy-500">
              Total{' '}
              <span className="text-[1rem] font-bold tabular-nums text-navy-800">{formatKwacha(total)}</span>
              {depositDue > 0 ? <span className="ml-2 text-navy-400">deposit {formatKwacha(depositDue)}</span> : null}
            </p>
          </div>

          {probing ? (
            <p className="mt-2 flex items-center gap-2 text-[0.78rem] text-navy-400">
              <Loader2 size={13} className="animate-spin" /> Checking this apartment’s calendar…
            </p>
          ) : probe && !probe.available ? (
            <div className="mt-2 space-y-2">
              <Alert tone="error" title="These dates cannot be sold">
                {probe.reason === 'invalid_dates' ? (
                  <span>Departure must be at least one night after arrival.</span>
                ) : probe.conflicts.length ? (
                  <ul className="mt-1 space-y-1">
                    {probe.conflicts.map((c) => (
                      <li key={c.reference} className="flex flex-wrap items-center gap-2 text-[0.78rem]">
                        <span className="font-semibold">{c.reference}</span>
                        <StatusChip className={BOOKING_STATUS_META[(c.status as keyof typeof BOOKING_STATUS_META) ?? 'reserved'].chip}>
                          {c.status.replace(/_/g, ' ')}
                        </StatusChip>
                        <span>
                          {c.guestName ? `${c.guestName} · ` : ''}
                          {formatMediumDate(c.checkIn)} – {formatMediumDate(c.checkOut)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span>This apartment is held or not available for the selected nights. Try another unit or different dates.</span>
                )}
              </Alert>
              {apartment && probe.reason !== 'invalid_dates' ? (
                <p className="text-[0.76rem] text-navy-500">
                  {apartment.nextFreeFrom && apartment.nextFreeFrom > form.checkIn ? (
                    <>
                      <Info size={12} className="mr-1 inline text-navy-400" />
                      Next free night for Apt {apartment.number}: <button type="button" className="link font-semibold" onClick={() => setForm((f) => ({ ...f, checkIn: apartment.nextFreeFrom!, checkOut: addISO(apartment.nextFreeFrom!, Math.max(1, nights)) }))}>{formatMediumDate(apartment.nextFreeFrom)}</button>
                    </>
                  ) : (
                    <>No contiguous opening in the next 30 nights.</>
                  )}
                </p>
              ) : null}
            </div>
          ) : probe?.available ? (
            <p className="mt-2 flex items-center gap-1.5 text-[0.78rem] font-medium text-st-available">
              <Check size={13} /> {apartment ? `Apt ${apartment.number} is free for these nights` : 'Dates are free'}
              {nights > 0 ? ` · ${formatKwacha(rate)} × ${nights} = ${formatKwacha(total)}` : ''}
            </p>
          ) : null}

          {probe?.advisories.length ? (
            <ul className="mt-2 space-y-1">
              {probe.advisories.map((a) => (
                <li key={a} className="flex items-start gap-1.5 text-[0.76rem] text-gold-700">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {a}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {editing ? (
          <section className="grid gap-3 sm:grid-cols-3">
            <SelectInput
              label="Booking status"
              value={form.status}
              onChange={(e) => set('status', e.target.value as typeof form.status)}
              options={[
                { value: 'reserved', label: 'Reserved' },
                { value: 'fully_paid', label: 'Fully paid' },
                { value: 'inquiry', label: 'Inquiry (holds no inventory)' },
              ]}
              hint="Check-in, check-out and cancellation are driven from the folio page."
            />
            <div className="rounded-lg border border-sand-200 bg-sand-50/70 px-3 py-2">
              <p className="label">Folio so far</p>
              <p className="mt-1 text-[0.82rem] text-navy-700">
                {formatKwacha(paidSoFar)} verified{pendingSoFar > 0 ? ` · ${formatKwacha(pendingSoFar)} awaiting verification` : ''}
              </p>
              <p className={`mt-0.5 text-[0.78rem] font-semibold ${balance > 0 ? 'text-st-cancelled' : 'text-st-available'}`}>
                {balance > 0 ? `${formatKwacha(balance)} outstanding` : 'Settled in full'}
              </p>
            </div>
            <MoneyInput label="Revised rate per night" value={form.nightlyRate} onValueChange={(n) => set('nightlyRate', String(n))} hint="Historic folios keep their captured rate" />
          </section>
        ) : (
          <section className="space-y-2.5 rounded-xl border border-sand-200 p-3.5">
            <CheckboxRow
              checked={takeDeposit}
              onChange={(v) => {
                setTakeDeposit(v);
                if (v && !form.depositAmount) set('depositAmount', String(depositDue));
              }}
              label="A deposit has been received now"
              hint={`Recorded against the folio as ${depositPercent ? `${depositPercent}% of ${formatKwacha(total)}` : 'a deposit'}. Money entered by reception stays “awaiting verification” until an administrator confirms it.`}
            />
            {takeDeposit ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <MoneyInput label="Amount received" required value={form.depositAmount} onValueChange={(n) => set('depositAmount', String(n))} error={errors.depositAmount} />
                <SelectInput
                  label="Method"
                  value={form.depositMethod}
                  onChange={(e) => set('depositMethod', e.target.value as PaymentMethod)}
                  options={(snapshot?.settings.payments.methods ?? []).filter((m) => m.enabled).map((m) => ({ value: m.id, label: m.label }))}
                />
                <TextInput label="Provider reference" value={form.depositReference} onChange={(e) => set('depositReference', e.target.value)} placeholder="MP1447… / MOMO219…" hint={PAYMENT_METHOD_META[form.depositMethod]?.hint} />
              </div>
            ) : null}
            <p className="text-[0.74rem] text-navy-400">Balance after this entry: <span className="font-semibold text-navy-700">{formatKwacha(balance)}</span></p>
          </section>
        )}

        <TextArea label="Internal notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={1200} counter placeholder="Arrival time agreed with the guard, extra bed, corporate account number, anything the next shift must know." />

        {errors.submit ? (
          <Alert tone="error" title="The booking was not saved">
            {errors.submit}
          </Alert>
        ) : null}
      </form>
    </Modal>
  );
}

export function ReservationQuickCreateTrigger() {
  return null;
}
