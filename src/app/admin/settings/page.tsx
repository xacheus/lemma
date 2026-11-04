'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Lock, RefreshCw, Save } from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PageHeader } from '@/components/admin/shell';
import { EmptyState, Panel, Skeleton, StatusChip, Tabs, Toggle } from '@/components/ui';
import { CheckboxRow, SelectInput, TextArea, TextInput } from '@/components/ui/forms';
import { PAYMENT_METHOD_META } from '@/lib/domain/status';
import type { PaymentMethod, Settings } from '@/lib/domain/types';

type SettingsTab = 'property' | 'bookings' | 'payments' | 'taxes' | 'messaging';

interface DataStats {
  createdAt: string;
  today: string;
  counts: {
    apartments: number;
    guests: number;
    staff: number;
    reservations: number;
    payments: number;
    housekeeping: number;
    notifications: number;
  };
}

export default function SettingsPage() {
  const { snapshot, request, toast, can } = useApp();
  const [activeTab, setActiveTab] = useState<SettingsTab>('property');
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [stats, setStats] = useState<DataStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsAttempt, setStatsAttempt] = useState(0);
  const canManageSettings = can('settings.manage');

  useEffect(() => {
    if (snapshot && !draft) setDraft(structuredClone(snapshot.settings));
  }, [snapshot, draft]);

  useEffect(() => {
    if (!canManageSettings) return;
    let active = true;
    setStatsLoading(true);
    request<DataStats>('/api/data', { notifyOnError: false })
      .then((data) => {
        if (active) setStats(data);
      })
      .catch(() => {
        if (active) setStats(null);
      })
      .finally(() => {
        if (active) setStatsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canManageSettings, request, statsAttempt]);

  const dirty = useMemo(
    () => (snapshot && draft ? JSON.stringify(snapshot.settings) !== JSON.stringify(draft) : false),
    [snapshot, draft],
  );

  if (!snapshot) return <Skeleton className="h-96" />;

  if (!canManageSettings || !draft) {
    return (
      <div className="space-y-4">
        <PageHeader title="Settings" description="Property-wide configuration." />
        <EmptyState
          icon={Lock}
          title="Management only"
          body="Rates, payment rules and staff permissions are changed by an administrator. Ask an admin colleague to adjust policy for you."
          action={
            <Link href="/admin" className="btn-secondary h-9 px-3.5 text-[0.82rem]">
              Back to the dashboard
            </Link>
          }
        />
      </div>
    );
  }

  const set = <K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) =>
    setDraft((d) =>
      d ? { ...d, [section]: { ...(d[section] as object), ...(patch as object) } } : d,
    );

  async function saveSection(section: keyof Settings, label: string) {
    if (!draft) return;
    setSaving(section);
    try {
      await request('/api/settings', { method: 'PATCH', data: { [section]: draft[section] } });
      toast({
        tone: 'success',
        title: `${label} saved`,
        body: 'Applied to upcoming bookings, receipts and reminders.',
      });
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Not saved',
        body: err instanceof Error ? err.message : 'Check the values and try again.',
      });
    } finally {
      setSaving(null);
    }
  }

  async function runSweep() {
    try {
      const res = await request<{ sweep: { created: number; skipped: number } }>(
        '/api/notifications',
        { method: 'PUT', data: {} },
      );
      toast({
        tone: 'info',
        title: 'Reminder sweep finished',
        body: `${res.sweep.created} draft${res.sweep.created === 1 ? '' : 's'} added to the outbox; ${res.sweep.skipped} already covered.`,
      });
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Sweep failed',
        body: err instanceof Error ? err.message : 'Try again.',
      });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Manage property details, booking policies, ZMW payment channels, document prefixes and guest communication."
        actions={
          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="chip bg-gold-50 text-gold-700">Unsaved changes</span>
            ) : (
              <span className="chip">Saved</span>
            )}
            <Link href="/admin/reports" className="btn-secondary h-9 px-3 text-[0.82rem]">
              Reports
            </Link>
          </div>
        }
      />

      <Tabs
        tabs={[
          { value: 'property', label: 'Property' },
          { value: 'bookings', label: 'Bookings & Housekeeping' },
          { value: 'payments', label: 'Payments' },
          { value: 'taxes', label: 'Taxes & Numbering' },
          { value: 'messaging', label: 'Guest Messaging' },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {/* TAB 1: PROPERTY */}
      {activeTab === 'property' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel
            title="Property identity"
            subtitle="Printed on receipts, folios and the guest-facing website"
            bodyClass="p-4 space-y-3.5"
          >
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <TextInput
                label="Trading name"
                value={draft.property.name}
                onChange={(e) => set('property', { name: e.target.value })}
              />
              <TextInput
                label="Legal name"
                value={draft.property.legalName}
                onChange={(e) => set('property', { legalName: e.target.value })}
                hint="Appears on official receipts and bank instructions"
              />
              <TextInput
                label="Phone"
                value={draft.property.phone}
                onChange={(e) => set('property', { phone: e.target.value })}
              />
              <TextInput
                label="WhatsApp"
                value={draft.property.whatsapp}
                onChange={(e) => set('property', { whatsapp: e.target.value })}
              />
              <TextInput
                label="Email"
                type="email"
                value={draft.property.email}
                onChange={(e) => set('property', { email: e.target.value })}
              />
              <TextInput
                label="Website"
                value={draft.property.website}
                onChange={(e) => set('property', { website: e.target.value })}
              />
            </div>
            <TextInput
              label="Address line"
              value={draft.property.addressLine}
              onChange={(e) => set('property', { addressLine: e.target.value })}
            />
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <TextInput
                label="City"
                value={draft.property.city}
                onChange={(e) => set('property', { city: e.target.value })}
              />
              <TextInput
                label="Country"
                value={draft.property.country}
                onChange={(e) => set('property', { country: e.target.value })}
              />
              <TextInput
                label="TPIN"
                value={draft.property.taxPayerId}
                onChange={(e) => set('property', { taxPayerId: e.target.value })}
                hint="ZRA taxpayer number (optional)"
              />
            </div>
            <TextArea
              label="Reception hours"
              value={draft.property.receptionHours}
              onChange={(e) => set('property', { receptionHours: e.target.value })}
              rows={2}
              maxLength={200}
            />
            <div className="space-y-2 border-t border-sand-100 pt-3">
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-navy-400">
                Custom policy wording on /policies
              </p>
              <p className="text-[0.74rem] leading-relaxed text-navy-500">
                Leave blank to display standard terms including your deposit percentage, check-in
                times and cancellation window. Enter text below to override with custom wording.
              </p>
              <TextArea
                label="Your booking terms (optional)"
                value={draft.property.bookingTerms ?? ''}
                onChange={(e) => set('property', { bookingTerms: e.target.value })}
                rows={4}
                maxLength={4000}
                counter
                placeholder="Leave blank to print the standard booking terms."
              />
              <TextArea
                label="Your privacy statement (optional)"
                value={draft.property.privacyPolicy ?? ''}
                onChange={(e) => set('property', { privacyPolicy: e.target.value })}
                rows={4}
                maxLength={4000}
                counter
                placeholder="Leave blank to print the standard privacy statement."
              />
            </div>
            <SectionFooter
              onSave={() => saveSection('property', 'Property details')}
              busy={saving === 'property'}
              dirty={dirty}
            />
          </Panel>

          <div className="space-y-4">
            <Panel
              title="Regional format & property records"
              subtitle="Currency, business time zone and current register counts"
              bodyClass="p-4 space-y-3.5"
            >
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <SelectInput
                  label="Currency"
                  value="ZMW"
                  disabled
                  onChange={() => undefined}
                  options={[{ value: 'ZMW', label: 'Zambian Kwacha (ZMW)' }]}
                  hint="All rates and receipts are issued in Zambian Kwacha"
                />
                <TextInput
                  label="Currency symbol"
                  value={draft.locale.currencySymbol}
                  onChange={(e) => set('locale', { currencySymbol: e.target.value })}
                  hint="Displayed next to monetary figures"
                />
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <TextInput
                  label="Time zone"
                  value={draft.locale.timezone}
                  disabled
                  onChange={() => undefined}
                  hint="Central Africa Time (CAT)"
                />
                <TextInput
                  label="Date style"
                  value={draft.locale.dateStyle}
                  disabled
                  onChange={() => undefined}
                  hint="Day–month–year format"
                />
              </div>

              <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-3.5">
                <p className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-navy-800">
                  <ClipboardList size={13} className="text-teal-600" /> Property register summary
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.78rem] sm:grid-cols-4">
                  {stats ? (
                    <>
                      <Figure label="Apartments" value={stats.counts.apartments} />
                      <Figure label="Guests" value={stats.counts.guests} />
                      <Figure label="Reservations" value={stats.counts.reservations} />
                      <Figure label="Payments" value={stats.counts.payments} />
                      <Figure label="Housekeeping" value={stats.counts.housekeeping} />
                      <Figure label="Messages" value={stats.counts.notifications} />
                      <Figure label="Staff" value={stats.counts.staff} />
                    </>
                  ) : (
                    <div className="col-span-full text-navy-500" role="status">
                      {statsLoading ? (
                        'Loading record counts…'
                      ) : (
                        <>
                          <p>Record counts could not be loaded. Check your connection and try again.</p>
                          <button
                            type="button"
                            className="link mt-1"
                            onClick={() => setStatsAttempt((attempt) => attempt + 1)}
                          >
                            Reload record counts
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </dl>
                <p className="mt-2 text-[0.74rem] leading-relaxed text-navy-500">
                  Counts of active apartments, bookings, receipts and staff on the register.
                  {stats ? ` Last updated for ${stats.today}.` : ''}
                </p>
              </div>
              <SectionFooter
                onSave={() => saveSection('locale', 'Regional settings')}
                busy={saving === 'locale'}
                dirty={dirty}
              />
            </Panel>

            <Panel
              title="Google Maps & Business Profile"
              subtitle="Keep your public listing details aligned with Google Search & Maps"
              bodyClass="p-4 space-y-3.5"
            >
              <div className="rounded-md border border-sand-200 bg-sand-50 p-3 text-[0.8rem] text-navy-700">
                <p className="font-semibold text-navy-900">
                  Listing status:{' '}
                  <span className="uppercase">
                    {draft.googleBusiness?.googleVerified
                      ? 'Verified on Google Business Profile'
                      : 'Pending Google Verification'}
                  </span>
                </p>
                <p className="mt-1 text-navy-600">
                  Ownership verification is completed directly with Google at business.google.com.
                  Keep your trading name, category and Maps share link recorded here for reference.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <TextInput
                  label="Google Business Name"
                  value={draft.googleBusiness?.businessName ?? draft.property.name}
                  onChange={(e) =>
                    set('googleBusiness', {
                      ...(draft.googleBusiness ?? {}),
                      businessName: e.target.value,
                    } as Settings['googleBusiness'])
                  }
                />
                <TextInput
                  label="Primary Category"
                  value={draft.googleBusiness?.primaryCategory ?? 'Serviced accommodation'}
                  onChange={(e) =>
                    set('googleBusiness', {
                      ...(draft.googleBusiness ?? {}),
                      primaryCategory: e.target.value,
                    } as Settings['googleBusiness'])
                  }
                />
                <TextInput
                  label="Google Maps Share URL"
                  value={draft.googleBusiness?.mapsProfileUrl ?? ''}
                  onChange={(e) =>
                    set('googleBusiness', {
                      ...(draft.googleBusiness ?? {}),
                      mapsProfileUrl: e.target.value,
                    } as Settings['googleBusiness'])
                  }
                  hint="Paste your live Google Maps link once verified"
                />
                <TextInput
                  label="Listing Note"
                  value={draft.googleBusiness?.verificationNote ?? ''}
                  onChange={(e) =>
                    set('googleBusiness', {
                      ...(draft.googleBusiness ?? {}),
                      verificationNote: e.target.value,
                    } as Settings['googleBusiness'])
                  }
                />
              </div>
              <CheckboxRow
                label="Listing has completed official Google Business Profile verification"
                checked={Boolean(draft.googleBusiness?.googleVerified)}
                onChange={(on) =>
                  set('googleBusiness', {
                    ...(draft.googleBusiness ?? {}),
                    googleVerified: on,
                  } as Settings['googleBusiness'])
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand-100 pt-3">
                <a
                  href="https://business.google.com/create"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary h-9 px-3 text-[0.8rem]"
                >
                  Open Google Business Profile
                </a>
                <button
                  type="button"
                  className="btn-primary h-9 px-3.5 text-[0.82rem]"
                  disabled={saving === 'googleBusiness'}
                  onClick={() => saveSection('googleBusiness', 'Google Business Profile')}
                >
                  <Save size={14} /> Save listing details
                </button>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {/* TAB 2: BOOKINGS & HOUSEKEEPING */}
      {activeTab === 'bookings' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel
            title="Booking rules"
            subtitle="Arrival times, deposit percentage, advance window and cancellation terms"
            bodyClass="p-4 space-y-3.5"
          >
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <TextInput
                label="Check-in from"
                type="time"
                value={draft.booking.checkInTime}
                onChange={(e) => set('booking', { checkInTime: e.target.value })}
                hint="Default arrival time shown on bookings"
              />
              <TextInput
                label="Check-out by"
                type="time"
                value={draft.booking.checkOutTime}
                onChange={(e) => set('booking', { checkOutTime: e.target.value })}
              />
              <TextInput
                label="Deposit %"
                type="number"
                min={0}
                max={100}
                value={String(draft.booking.depositPercent)}
                onChange={(e) => set('booking', { depositPercent: Number(e.target.value) })}
                error={
                  draft.booking.depositPercent < 0 || draft.booking.depositPercent > 100
                    ? 'Between 0 and 100.'
                    : null
                }
                hint="Share of stay total requested to hold dates"
              />
              <TextInput
                label="Advance booking horizon (days)"
                type="number"
                min={7}
                max={730}
                value={String(draft.booking.maxAdvanceBookingDays)}
                onChange={(e) => set('booking', { maxAdvanceBookingDays: Number(e.target.value) })}
                hint="How far ahead guests can request dates online"
              />
              <TextInput
                label="Minimum weekend nights"
                type="number"
                min={1}
                max={7}
                value={String(draft.booking.minNightsWeekend)}
                onChange={(e) => set('booking', { minNightsWeekend: Number(e.target.value) })}
                hint="Displayed on public stay terms"
              />
              <TextInput
                label="Free cancellation window (hours)"
                type="number"
                min={0}
                max={336}
                value={String(draft.booking.cancellationPolicyHours)}
                onChange={(e) =>
                  set('booking', { cancellationPolicyHours: Number(e.target.value) })
                }
                hint="Notice period before check-in for free cancellation"
              />
            </div>
            <TextArea
              label="Cancellation text"
              value={draft.booking.cancellationText}
              onChange={(e) => set('booking', { cancellationText: e.target.value })}
              rows={3}
              maxLength={600}
              counter
            />
            <div className="space-y-1.5 border-t border-sand-100 pt-3">
              <CheckboxRow
                label="Quoted rates include applicable taxes and levies"
                checked={draft.booking.taxesIncluded}
                onChange={(on) => set('booking', { taxesIncluded: on })}
                hint="Shown on quotations and public rate summaries"
              />
              <CheckboxRow
                label="Place website requests straight onto the booking calendar"
                checked={draft.booking.autoConfirmPublicRequests}
                onChange={(on) => set('booking', { autoConfirmPublicRequests: on })}
                hint="When off, website requests arrive as enquiries for reception to accept first"
              />
            </div>
            <SectionFooter
              onSave={() => saveSection('booking', 'Booking rules')}
              busy={saving === 'booking'}
              dirty={dirty}
            />
          </Panel>

          <Panel
            title="Housekeeping standards"
            subtitle="Turnaround pacing, cleaner assignment and pre-arrival sign-off"
            bodyClass="p-4 space-y-3.5"
          >
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <TextInput
                label="Turnaround allowance (min)"
                type="number"
                min={15}
                max={300}
                value={String(draft.housekeeping.turnaroundMinutes)}
                onChange={(e) =>
                  set('housekeeping', { turnaroundMinutes: Number(e.target.value) })
                }
                hint="Target minutes from check-out to ready"
              />
              <TextInput
                label="Pre-arrival check (min)"
                type="number"
                min={0}
                max={120}
                value={String(draft.housekeeping.preArrivalInspectionMinutes)}
                onChange={(e) =>
                  set('housekeeping', { preArrivalInspectionMinutes: Number(e.target.value) })
                }
                hint="Inspection window before arrival"
              />
              <div className="flex items-end">
                <div className="w-full rounded-xl border border-sand-200 px-3 py-2">
                  <p className="label">Units ready now</p>
                  <p className="text-[0.95rem] font-semibold text-navy-800">
                    {snapshot.apartments.filter((a) => a.cleaningStatus === 'clean').length} of{' '}
                    {snapshot.apartments.length}
                  </p>
                </div>
              </div>
            </div>
            <CheckboxRow
              label="Auto-assign the next cleaner on duty"
              checked={draft.housekeeping.autoAssignCleaner}
              onChange={(on) => set('housekeeping', { autoAssignCleaner: on })}
              hint="Assigns new turnover tasks automatically across active cleaners on shift"
            />
            <CheckboxRow
              label="Require supervisor inspection before marking unit ready for check-in"
              checked={Boolean(draft.housekeeping.requireInspectionBeforeReady)}
              onChange={(on) => set('housekeeping', { requireInspectionBeforeReady: on })}
              hint="Places completed cleans into Inspection Required until signed off by reception"
            />
            <SectionFooter
              onSave={() => saveSection('housekeeping', 'Housekeeping settings')}
              busy={saving === 'housekeeping'}
              dirty={dirty}
            />
          </Panel>
        </div>
      ) : null}

      {/* TAB 3: PAYMENTS */}
      {activeTab === 'payments' ? (
        <Panel
          title="Payment channels & verification"
          subtitle="Configure how guests pay deposits and how reception verifies receipts"
          bodyClass="p-4 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.82rem] text-navy-600">
              Enable or hide channels below, or open the dedicated Payment Methods screen for full
              bank and mobile-money destination fields.
            </p>
            <Link href="/admin/payment-methods" className="btn-secondary h-9 px-3 text-[0.8rem]">
              Edit full account details
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {draft.payments.methods.map((m, index) => (
              <div key={m.id} className="rounded-xl border border-sand-200 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.86rem] font-semibold text-navy-800">
                    {PAYMENT_METHOD_META[m.id].label}
                  </p>
                  <Toggle
                    checked={m.enabled}
                    onChange={(on) => {
                      const methods = draft.payments.methods.map((x, i) =>
                        i === index ? { ...x, enabled: on } : x,
                      );
                      set('payments', { methods });
                    }}
                    label={m.enabled ? 'Offered to guests' : 'Hidden'}
                  />
                </div>
                <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextInput
                    label="Account label"
                    value={m.accountLabel}
                    onChange={(e) => {
                      const methods = draft.payments.methods.map((x, i) =>
                        i === index ? { ...x, accountLabel: e.target.value } : x,
                      );
                      set('payments', { methods });
                    }}
                  />
                  <TextInput
                    label="Number / merchant code"
                    value={m.accountNumber}
                    onChange={(e) => {
                      const methods = draft.payments.methods.map((x, i) =>
                        i === index ? { ...x, accountNumber: e.target.value } : x,
                      );
                      set('payments', { methods });
                    }}
                  />
                </div>
                <div className="mt-2.5">
                  <TextArea
                    label="Instructions shown to guests"
                    rows={2}
                    maxLength={600}
                    value={m.instructions}
                    onChange={(e) => {
                      const methods = draft.payments.methods.map((x, i) =>
                        i === index ? { ...x, instructions: e.target.value } : x,
                      );
                      set('payments', { methods });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2.5 border-t border-sand-100 pt-3.5">
            <CheckboxRow
              label="Reception assigns the payment channel"
              checked={Boolean(draft.payments.lockMethodToAdmin)}
              onChange={(on) => set('payments', { lockMethodToAdmin: on })}
              hint="When off, guests choose any enabled channel above when submitting their deposit."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SelectInput
                label="Default channel for guests"
                value={draft.payments.defaultMethod ?? 'airtel_money'}
                onChange={(e) =>
                  set('payments', { defaultMethod: e.target.value as PaymentMethod })
                }
                options={draft.payments.methods.map((m) => ({ value: m.id, label: m.label }))}
                hint="Pre-selected on the guest payment form"
              />
              <TextInput
                label="Claim review target (hours)"
                type="number"
                min={1}
                max={168}
                value={String(draft.payments.claimReviewHours ?? 24)}
                onChange={(e) =>
                  set('payments', { claimReviewHours: Number(e.target.value) })
                }
                hint="Highlights unreviewed guest payment submissions after this window"
              />
              <div className="flex items-end pb-1">
                <CheckboxRow
                  label="Accept part payments"
                  checked={draft.payments.allowPartialPayments !== false}
                  onChange={(on) => set('payments', { allowPartialPayments: on })}
                  hint="Allows guests to settle a balance in multiple transfers"
                />
              </div>
            </div>
            <CheckboxRow
              label="Allow screenshot or slip uploads with payment references"
              checked={draft.payments.proofUploadEnabled}
              onChange={(on) => set('payments', { proofUploadEnabled: on })}
            />
            <CheckboxRow
              label="Require supervisor verification on every recorded payment"
              checked={draft.payments.requireVerification}
              onChange={(on) => set('payments', { requireVerification: on })}
              hint="Keeps newly recorded payments pending until verified against the statement"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput
                label="Payment receipt prefix"
                value={draft.payments.receiptPrefix}
                onChange={(e) => set('payments', { receiptPrefix: e.target.value })}
                hint="Format: PREFIX-YYYYMMDD-0001"
              />
            </div>
          </div>

          <SectionFooter
            onSave={() => saveSection('payments', 'Payment settings')}
            busy={saving === 'payments'}
            dirty={dirty}
          />
        </Panel>
      ) : null}

      {/* TAB 4: TAXES & NUMBERING */}
      {activeTab === 'taxes' ? (
        <Panel
          title="Tax & Commercial Document Numbering"
          subtitle="ZMW tax settings and numbering prefixes for Quotations, Invoices & Official Receipts"
          bodyClass="p-4 space-y-3.5"
        >
          <CheckboxRow
            label="Show tax / VAT breakdown on quotations, bookings & invoices"
            checked={Boolean(draft.tax?.enabled)}
            onChange={(on) =>
              set('tax', {
                ...(draft.tax ?? {
                  name: 'VAT',
                  ratePercent: 16,
                  inclusive: true,
                  registrationNumber: draft.property.taxPayerId,
                }),
                enabled: on,
              })
            }
            hint="Leave off if rates are exempt or non-VAT registered"
          />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <TextInput
              label="Tax Label"
              value={draft.tax?.name ?? 'VAT'}
              onChange={(e) =>
                set('tax', { ...(draft.tax ?? {}), name: e.target.value } as Settings['tax'])
              }
            />
            <TextInput
              label="Tax Rate (%)"
              type="number"
              min={0}
              max={50}
              value={String(draft.tax?.ratePercent ?? 0)}
              onChange={(e) =>
                set('tax', {
                  ...(draft.tax ?? {}),
                  ratePercent: Number(e.target.value),
                } as Settings['tax'])
              }
            />
            <CheckboxRow
              label="Room rates are tax-inclusive"
              checked={Boolean(draft.tax?.inclusive ?? true)}
              onChange={(on) =>
                set('tax', { ...(draft.tax ?? {}), inclusive: on } as Settings['tax'])
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-3.5 border-t border-sand-100 pt-3 sm:grid-cols-3">
            <TextInput
              label="Quotation Prefix"
              value={draft.documents?.quotationPrefix ?? 'QUO'}
              onChange={(e) =>
                set('documents', {
                  ...(draft.documents ?? {}),
                  quotationPrefix: e.target.value,
                } as Settings['documents'])
              }
            />
            <TextInput
              label="Invoice Prefix"
              value={draft.documents?.invoicePrefix ?? 'INV'}
              onChange={(e) =>
                set('documents', {
                  ...(draft.documents ?? {}),
                  invoicePrefix: e.target.value,
                } as Settings['documents'])
              }
            />
            <TextInput
              label="Official Receipt Prefix"
              value={draft.documents?.receiptPrefix ?? 'RCP'}
              onChange={(e) =>
                set('documents', {
                  ...(draft.documents ?? {}),
                  receiptPrefix: e.target.value,
                } as Settings['documents'])
              }
            />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-sand-100 pt-3">
            <button
              type="button"
              className="btn-primary h-9 px-3.5 text-[0.82rem]"
              disabled={saving === 'tax'}
              onClick={async () => {
                setSaving('tax');
                try {
                  await request('/api/settings', {
                    method: 'PATCH',
                    data: { tax: draft.tax, documents: draft.documents },
                  });
                  toast({ tone: 'success', title: 'Tax & Document settings saved' });
                } finally {
                  setSaving(null);
                }
              }}
            >
              <Save size={14} /> Save Tax &amp; Numbering
            </button>
          </div>
        </Panel>
      ) : null}

      {/* TAB 5: GUEST MESSAGING */}
      {activeTab === 'messaging' ? (
        <Panel
          title="Guest messaging & automated reminders"
          subtitle="Configure outgoing channels, sender signature and reminder schedules"
          bodyClass="p-4 space-y-3.5"
        >
          {(['whatsapp', 'sms', 'email'] as const).map((channel) => {
            const value = draft.notifications[channel];
            const channelTitle =
              channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : 'Email';
            return (
              <div
                key={channel}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-sand-200 px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[0.86rem] font-semibold text-navy-800">{channelTitle}</p>
                  <p className="mt-0.5 text-[0.76rem] leading-snug text-navy-500">{value.note}</p>
                </div>
                <StatusChip
                  className={
                    value.connected
                      ? 'bg-st-availableBg text-st-available'
                      : 'bg-sand-200 text-navy-600'
                  }
                  dot="bg-current"
                >
                  {value.connected ? 'Direct send active' : 'Manual handoff'}
                </StatusChip>
                <Toggle
                  label={value.enabled ? 'Drafting enabled' : 'Drafting off'}
                  checked={value.enabled}
                  onChange={(on) =>
                    set('notifications', {
                      [channel]: { ...value, enabled: on },
                    } as Partial<Settings['notifications']>)
                  }
                />
              </div>
            );
          })}

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <TextInput
              label="Check-in reminder (days before)"
              type="number"
              min={0}
              max={30}
              value={String(draft.notifications.checkInReminderDays)}
              onChange={(e) =>
                set('notifications', { checkInReminderDays: Number(e.target.value) })
              }
            />
            <TextInput
              label="Departure reminder (days before)"
              type="number"
              min={0}
              max={30}
              value={String(draft.notifications.checkOutReminderDays)}
              onChange={(e) =>
                set('notifications', { checkOutReminderDays: Number(e.target.value) })
              }
            />
            <TextInput
              label="Balance reminder (days before)"
              type="number"
              min={0}
              max={30}
              value={String(draft.notifications.balanceReminderDays)}
              onChange={(e) =>
                set('notifications', { balanceReminderDays: Number(e.target.value) })
              }
            />
          </div>

          <div className="space-y-1.5 border-t border-sand-100 pt-3">
            <TextInput
              label="Signed as"
              value={draft.notifications.senderName}
              onChange={(e) => set('notifications', { senderName: e.target.value })}
              hint="Printed at the bottom of outgoing messages"
            />
            {(
              [
                ['sendBookingConfirmation', 'Booking confirmation'],
                ['sendPaymentConfirmation', 'Payment receipt confirmation'],
                ['sendCancellationNotice', 'Cancellation notice'],
                ['sendCleaningReminders', 'Housekeeping turnover reminders (staff)'],
                ['sendBalanceReminders', 'Outstanding-balance reminders'],
              ] as const
            ).map(([key, label]) => (
              <CheckboxRow
                key={key}
                label={label}
                checked={draft.notifications[key] as boolean}
                onChange={(on) =>
                  set('notifications', { [key]: on } as Partial<Settings['notifications']>)
                }
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-sand-100 pt-3">
            <button
              type="button"
              className="btn-secondary h-9 px-3 text-[0.82rem]"
              onClick={runSweep}
            >
              <RefreshCw size={14} /> Draft due reminders now
            </button>
            <Link href="/admin/notifications" className="btn-ghost h-9 px-3 text-[0.82rem]">
              Open message outbox
            </Link>
          </div>
          <SectionFooter
            onSave={() => saveSection('notifications', 'Messaging settings')}
            busy={saving === 'notifications'}
            dirty={dirty}
          />
        </Panel>
      ) : null}
    </div>
  );
}

function SectionFooter({
  onSave,
  busy,
  dirty,
}: {
  onSave: () => void;
  busy: boolean;
  dirty: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-sand-100 pt-3">
      <p className="text-[0.74rem] text-navy-400">
        {dirty ? 'Unsaved edits on this page.' : 'Matches saved configuration.'}
      </p>
      <button
        type="button"
        className="btn-primary h-9 px-3.5 text-[0.82rem]"
        onClick={onSave}
        disabled={busy}
      >
        {busy ? (
          'Saving…'
        ) : (
          <>
            <Save size={14} /> Save section
          </>
        )}
      </button>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-navy-400">{label}</dt>
      <dd className="font-semibold text-navy-800 tnum">{value}</dd>
    </div>
  );
}
