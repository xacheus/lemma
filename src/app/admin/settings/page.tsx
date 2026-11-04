'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Database, Lock, RefreshCw, Save } from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PageHeader } from '@/components/admin/shell';
import { Alert, EmptyState, Panel, Skeleton, StatusChip, Toggle } from '@/components/ui';
import { CheckboxRow, SelectInput, TextArea, TextInput } from '@/components/ui/forms';
import { PAYMENT_METHOD_META } from '@/lib/domain/status';
import type { PaymentMethod, Settings } from '@/lib/domain/types';

/** Which switches the running engine actually obeys. Everything else is policy copy. */
const ENFORCED = new Set([
  'depositPercent',
  'maxAdvanceBookingDays',
  'checkInTime',
  'checkOutTime',
  'autoConfirmPublicRequests',
  'proofUploadEnabled',
  'requireVerification',
  'autoAssignCleaner',
  'receiptPrefix',
  'checkInReminderDays',
  'checkOutReminderDays',
  'balanceReminderDays',
  'sendBookingConfirmation',
  'sendPaymentConfirmation',
  'sendCancellationNotice',
  'sendCleaningReminders',
  'sendBalanceReminders',
  'enabled',
  'connected',
]);

export default function SettingsPage() {
  const { snapshot, request, toast, can } = useApp();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  interface DataStats {
    file: string;
    exists: boolean;
    sizeBytes: number;
    createdAt: string;
    today: string;
    backendMode: string;
    counts: { apartments: number; guests: number; staff: number; reservations: number; payments: number; housekeeping: number; notifications: number };
  }
  const [stats, setStats] = useState<DataStats | null>(null);

  useEffect(() => {
    if (snapshot && !draft) setDraft(structuredClone(snapshot.settings));
  }, [snapshot, draft]);

  useEffect(() => {
    if (!can('settings.manage')) return;
    request<DataStats>('/api/data')
      .then(setStats)
      .catch(() => setStats(null));
  }, [can, request]);

  const dirty = useMemo(() => (snapshot && draft ? JSON.stringify(snapshot.settings) !== JSON.stringify(draft) : false), [snapshot, draft]);

  if (!snapshot) return <Skeleton className="h-96" />;

  if (!can('settings.manage') || !draft)
    return (
      <div className="space-y-4">
        <PageHeader title="Settings" description="Property-wide configuration." />
        <EmptyState
          icon={Lock}
          title="Management only"
          body="Rates, payment rules and staff permissions are changed by an administrator. Ask any admin account to adjust policy for you."
          action={
            <Link href="/admin" className="btn-secondary h-9 px-3.5 text-[0.82rem]">
              Back to the dashboard
            </Link>
          }
        />
      </div>
    );

  const set = <K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) =>
    setDraft((d) => (d ? { ...d, [section]: { ...(d[section] as object), ...(patch as object) } } : d));

  async function saveSection(section: keyof Settings, label: string) {
    if (!draft) return;
    setSaving(section);
    try {
      await request('/api/settings', { method: 'PATCH', data: { [section]: draft[section] } });
      toast({ tone: 'success', title: `${label} saved`, body: 'Applied to the next booking, receipt or reminder sweep — existing records are not rewritten.' });
    } catch (err) {
      toast({ tone: 'error', title: 'Not saved', body: err instanceof Error ? err.message : 'Check the values and try again.' });
    } finally {
      setSaving(null);
    }
  }

  async function runSweep() {
    try {
      const res = await request<{ sweep: { created: number; skipped: number } }>('/api/notifications', { method: 'PUT', data: {} });
      toast({
        tone: 'info',
        title: 'Reminder sweep finished',
        body: `${res.sweep.created} draft${res.sweep.created === 1 ? '' : 's'} added to the outbox; ${res.sweep.skipped} already covered. Nothing was sent anywhere automatically.`,
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Sweep failed', body: err instanceof Error ? err.message : 'Try again.' });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Manage property details, payment policies, and guest communication preferences."
        actions={
          <div className="flex items-center gap-2">
            {dirty ? <span className="chip bg-gold-50 text-gold-700">Unsaved changes</span> : <span className="chip">Saved</span>}
            <Link href="/admin/reports" className="btn-secondary h-9 px-3 text-[0.82rem]">
              Reports
            </Link>
          </div>
        }
      />

      <Alert tone="info" title="How to read the labels">
        A switch marked <span className="font-semibold">enforced</span> changes how the software behaves right now. Everything else is policy copy — it prints on folios and confirms what
        reception tells guests, but this build does not yet police it. External integrations (mobile-money APIs, SMS aggregators, SMTP) are deliberately not connected.
      </Alert>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Property identity" subtitle="Printed on receipts, folios and the guest-facing site" bodyClass="p-4 space-y-3.5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <TextInput label="Trading name" value={draft.property.name} onChange={(e) => set('property', { name: e.target.value })} />
            <TextInput label="Legal name" value={draft.property.legalName} onChange={(e) => set('property', { legalName: e.target.value })} hint="Appears on receipts and bank instructions" />
            <TextInput label="Phone" value={draft.property.phone} onChange={(e) => set('property', { phone: e.target.value })} />
            <TextInput label="WhatsApp" value={draft.property.whatsapp} onChange={(e) => set('property', { whatsapp: e.target.value })} />
            <TextInput label="Email" type="email" value={draft.property.email} onChange={(e) => set('property', { email: e.target.value })} />
            <TextInput label="Website" value={draft.property.website} onChange={(e) => set('property', { website: e.target.value })} />
          </div>
          <TextInput label="Address line" value={draft.property.addressLine} onChange={(e) => set('property', { addressLine: e.target.value })} />
          <div className="grid gap-3.5 sm:grid-cols-3">
            <TextInput label="City" value={draft.property.city} onChange={(e) => set('property', { city: e.target.value })} />
            <TextInput label="Country" value={draft.property.country} onChange={(e) => set('property', { country: e.target.value })} />
            <TextInput label="TPIN" value={draft.property.taxPayerId} onChange={(e) => set('property', { taxPayerId: e.target.value })} hint="ZRA tax payer ID" />
          </div>
          <TextArea label="Reception hours" value={draft.property.receptionHours} onChange={(e) => set('property', { receptionHours: e.target.value })} rows={2} maxLength={200} />
          <div className="space-y-2 border-t border-sand-100 pt-3">
            <p className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-navy-400">
              Policy copy on /policies
            </p>
            <p className="text-[0.74rem] leading-relaxed text-navy-500">
              Leave these blank to print the standard terms, which already include your deposit
              percentage, check-in times and cancellation window. Type here to replace that wording
              with your own — it appears on the public policy page immediately.
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
          <SectionFooter onSave={() => saveSection('property', 'Property details')} busy={saving === 'property'} dirty={dirty} />
        </Panel>

        <Panel title="Booking rules" subtitle="These drive the availability engine and the quote on every new folio" bodyClass="p-4 space-y-3.5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <TextInput
              label="Check-in from"
              type="time"
              value={draft.booking.checkInTime}
              onChange={(e) => set('booking', { checkInTime: e.target.value })}
              hint={ENFORCED.has('checkInTime') ? 'Enforced · default arrival time on new bookings' : undefined}
            />
            <TextInput label="Check-out by" type="time" value={draft.booking.checkOutTime} onChange={(e) => set('booking', { checkOutTime: e.target.value })} />
            <TextInput
              label="Deposit %"
              type="number"
              min={0}
              max={100}
              value={String(draft.booking.depositPercent)}
              onChange={(e) => set('booking', { depositPercent: Number(e.target.value) })}
              error={draft.booking.depositPercent < 0 || draft.booking.depositPercent > 100 ? 'Between 0 and 100.' : null}
              hint="Enforced · the booking form quotes this share as the deposit"
            />
            <TextInput
              label="Booking horizon (nights ahead)"
              type="number"
              min={7}
              max={730}
              value={String(draft.booking.maxAdvanceBookingDays)}
              onChange={(e) => set('booking', { maxAdvanceBookingDays: Number(e.target.value) })}
              hint="Enforced · searches refuse nights beyond this"
            />
            <TextInput label="Minimum weekend nights" type="number" min={1} max={7} value={String(draft.booking.minNightsWeekend)} onChange={(e) => set('booking', { minNightsWeekend: Number(e.target.value) })} hint="Policy copy — not yet policed by the engine" />
            <TextInput label="Free cancellation window (hours)" type="number" min={0} max={336} value={String(draft.booking.cancellationPolicyHours)} onChange={(e) => set('booking', { cancellationPolicyHours: Number(e.target.value) })} hint="Shown to guests; refunds are always a manual manager decision" />
          </div>
          <TextArea label="Cancellation text" value={draft.booking.cancellationText} onChange={(e) => set('booking', { cancellationText: e.target.value })} rows={3} maxLength={600} counter />
          <div className="space-y-1.5 border-t border-sand-100 pt-3">
            <CheckboxRow
              label="Rates include taxes and levies"
              checked={draft.booking.taxesIncluded}
              onChange={(on) => set('booking', { taxesIncluded: on })}
              hint="Printed on quotes and the website; no tax is added to a folio in this build"
            />
            <CheckboxRow
              label="Auto-confirm requests from the public site"
              checked={draft.booking.autoConfirmPublicRequests}
              onChange={(on) => set('booking', { autoConfirmPublicRequests: on })}
              hint="Enforced · off, website submissions land as enquiries that hold no inventory"
            />
          </div>
          <SectionFooter onSave={() => saveSection('booking', 'Booking rules')} busy={saving === 'booking'} dirty={dirty} />
        </Panel>

        <Panel title="Money" subtitle="Where guests pay and how a receipt becomes a payment" bodyClass="p-4 space-y-3">
          {draft.payments.methods.map((m, index) => (
            <div key={m.id} className="rounded-xl border border-sand-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.86rem] font-semibold text-navy-800">{PAYMENT_METHOD_META[m.id].label}</p>
                <Toggle
                  checked={m.enabled}
                  onChange={(on) => {
                    const methods = draft.payments.methods.map((x, i) => (i === index ? { ...x, enabled: on } : x));
                    set('payments', { methods });
                  }}
                  label={m.enabled ? 'Offered to guests' : 'Hidden'}
                />
              </div>
              <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                <TextInput
                  label="Label"
                  value={m.accountLabel}
                  onChange={(e) => {
                    const methods = draft.payments.methods.map((x, i) => (i === index ? { ...x, accountLabel: e.target.value } : x));
                    set('payments', { methods });
                  }}
                />
                <TextInput
                  label="Code / account number"
                  value={m.accountNumber}
                  onChange={(e) => {
                    const methods = draft.payments.methods.map((x, i) => (i === index ? { ...x, accountNumber: e.target.value } : x));
                    set('payments', { methods });
                  }}
                />
              </div>
              <div className="mt-2.5">
                <TextArea
                  label="Instructions given to guests"
                  rows={2}
                  maxLength={600}
                  value={m.instructions}
                  onChange={(e) => {
                    const methods = draft.payments.methods.map((x, i) => (i === index ? { ...x, instructions: e.target.value } : x));
                    set('payments', { methods });
                  }}
                />
              </div>
            </div>
          ))}

          <div className="space-y-2 border-t border-sand-100 pt-3">
            <p className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-navy-400">
              Who chooses the channel
            </p>
            <CheckboxRow
              label="Reception chooses the payment channel"
              checked={Boolean(draft.payments.lockMethodToAdmin)}
              onChange={(on) => set('payments', { lockMethodToAdmin: on })}
              hint="Off (default) · the guest picks from the enabled channels above when they pay. On · reception assigns the channel and the guest only records what they paid."
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectInput
                label="Default channel for guests"
                value={draft.payments.defaultMethod ?? 'airtel_money'}
                onChange={(e) => set('payments', { defaultMethod: e.target.value as PaymentMethod })}
                options={draft.payments.methods.map((m) => ({ value: m.id, label: m.label }))}
                hint="Pre-selected on the guest payment form"
              />
              <TextInput
                label="Review window (hours)"
                type="number"
                min={1}
                max={168}
                value={String(draft.payments.claimReviewHours ?? 24)}
                onChange={(e) => set('payments', { claimReviewHours: Number(e.target.value) })}
                hint="Unchecked guest claims are flagged after this"
              />
              <div className="flex items-end pb-1">
                <CheckboxRow
                  label="Accept part payments"
                  checked={draft.payments.allowPartialPayments !== false}
                  onChange={(on) => set('payments', { allowPartialPayments: on })}
                  hint="Off · the guest must pay the suggested amount in one go"
                />
              </div>
            </div>
            <CheckboxRow
              label="Allow proof-of-payment uploads"
              checked={draft.payments.proofUploadEnabled}
              onChange={(on) => set('payments', { proofUploadEnabled: on })}
              hint="Enforced · the receipt dialog only offers the uploader when this is on"
            />
            <CheckboxRow
              label="Require a second pair of eyes on every receipt"
              checked={draft.payments.requireVerification}
              onChange={(on) => set('payments', { requireVerification: on })}
              hint="Enforced · on, even a manager's entry sits in the queue until verified. Off, staff with payments.verify can bank cash at the desk immediately."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="Receipt number prefix" value={draft.payments.receiptPrefix} onChange={(e) => set('payments', { receiptPrefix: e.target.value })} hint="Enforced · receipts print as PREFIX-YYYYMMDD-0001" />
            </div>
          </div>
          <SectionFooter onSave={() => saveSection('payments', 'Payment settings')} busy={saving === 'payments'} dirty={dirty} />
        </Panel>

        <Panel title="Guest messaging" subtitle="Drafts, delivery claims and reminder timing" bodyClass="p-4 space-y-3">
          <Alert tone="warn" title="No provider is connected — on purpose">
            WhatsApp, SMS and email are all shown as <span className="font-semibold">not connected</span>. The system drafts the copy, opens it in the staff member's own app, and records who
            claims to have sent it. It will never print a delivery you cannot prove.
          </Alert>

          {(['whatsapp', 'sms', 'email'] as const).map((channel) => {
            const value = draft.notifications[channel];
            return (
              <div key={channel} className="flex flex-wrap items-center gap-3 rounded-xl border border-sand-200 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.85rem] font-semibold text-navy-800 capitalize">{channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp Business' : 'Email (SMTP)'}</p>
                  <p className="mt-0.5 text-[0.76rem] leading-snug text-navy-400">{value.note}</p>
                </div>
                <StatusChip className={value.connected ? 'bg-st-availableBg text-st-available' : 'bg-sand-200 text-navy-500'} dot="bg-current">
                  {value.connected ? 'connected' : 'not connected'}
                </StatusChip>
                <Toggle
                  label={value.enabled ? 'Drafting enabled' : 'Drafting off'}
                  checked={value.enabled}
                  onChange={(on) => set('notifications', { [channel]: { ...value, enabled: on } } as Partial<Settings['notifications']>)}
                />
              </div>
            );
          })}

          <div className="grid gap-3.5 sm:grid-cols-3">
            <TextInput label="Check-in reminder (days)" type="number" min={0} max={30} value={String(draft.notifications.checkInReminderDays)} onChange={(e) => set('notifications', { checkInReminderDays: Number(e.target.value) })} hint="Enforced by the sweep" />
            <TextInput label="Departure reminder (days)" type="number" min={0} max={30} value={String(draft.notifications.checkOutReminderDays)} onChange={(e) => set('notifications', { checkOutReminderDays: Number(e.target.value) })} />
            <TextInput label="Balance reminder (days before)" type="number" min={0} max={30} value={String(draft.notifications.balanceReminderDays)} onChange={(e) => set('notifications', { balanceReminderDays: Number(e.target.value) })} />
          </div>

          <div className="space-y-1.5 border-t border-sand-100 pt-3">
            <TextInput label="Signed as" value={draft.notifications.senderName} onChange={(e) => set('notifications', { senderName: e.target.value })} hint="Appears at the foot of every draft" />
            {(
              [
                ['sendBookingConfirmation', 'Booking confirmation'],
                ['sendPaymentConfirmation', 'Payment confirmation'],
                ['sendCancellationNotice', 'Cancellation notice'],
                ['sendCleaningReminders', 'Cleaning reminders (internal)'],
                ['sendBalanceReminders', 'Outstanding-balance reminders'],
              ] as const
            ).map(([key, label]) => (
              <CheckboxRow
                key={key}
                label={label}
                checked={draft.notifications[key] as boolean}
                onChange={(on) => set('notifications', { [key]: on } as Partial<Settings['notifications']>)}
                hint="Enforced · decides whether the sweep queues a draft for this event"
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-sand-100 pt-3">
            <button type="button" className="btn-secondary h-9 px-3 text-[0.82rem]" onClick={runSweep}>
              <RefreshCw size={14} /> Run the reminder sweep now
            </button>
            <Link href="/admin/notifications" className="btn-ghost h-9 px-3 text-[0.82rem]">
              Open the outbox
            </Link>
          </div>
          <SectionFooter onSave={() => saveSection('notifications', 'Messaging settings')} busy={saving === 'notifications'} dirty={dirty} />
        </Panel>

        <Panel title="Housekeeping" subtitle="How turnovers are produced and paced" bodyClass="p-4 space-y-3.5">
          <div className="grid gap-3.5 sm:grid-cols-3">
            <TextInput label="Turnaround allowance (min)" type="number" min={15} max={300} value={String(draft.housekeeping.turnaroundMinutes)} onChange={(e) => set('housekeeping', { turnaroundMinutes: Number(e.target.value) })} hint="Target time between departure and ready" />
            <TextInput label="Pre-arrival check (min)" type="number" min={0} max={120} value={String(draft.housekeeping.preArrivalInspectionMinutes)} onChange={(e) => set('housekeeping', { preArrivalInspectionMinutes: Number(e.target.value) })} hint="Built into the due time on new jobs" />
            <div className="flex items-end">
              <div className="w-full rounded-xl border border-sand-200 px-3 py-2">
                <p className="label">Units ready now</p>
                <p className="text-[0.95rem] font-semibold text-navy-800">{snapshot.apartments.filter((a) => a.cleaningStatus === 'clean').length} of {snapshot.apartments.length}</p>
              </div>
            </div>
          </div>
          <CheckboxRow
            label="Auto-assign the next cleaner on duty"
            checked={draft.housekeeping.autoAssignCleaner}
            onChange={(on) => set('housekeeping', { autoAssignCleaner: on })}
            hint="Enforced · new turnover jobs go to the cleanest roster; off, they land unassigned"
          />
          <CheckboxRow
            label="Require supervisor inspection before marking unit ready for check-in"
            checked={Boolean(draft.housekeeping.requireInspectionBeforeReady)}
            onChange={(on) => set('housekeeping', { requireInspectionBeforeReady: on })}
            hint="Enforced · cleaner completion places apartment into Inspection Required until signed off"
          />
          <SectionFooter onSave={() => saveSection('housekeeping', 'Housekeeping settings')} busy={saving === 'housekeeping'} dirty={dirty} />
        </Panel>

        <Panel
          title="Tax & Commercial Document Numbering"
          subtitle="Configurable ZMW tax rules and prefixes for Quotations, Invoices & Receipts"
          bodyClass="p-4 space-y-3.5"
        >
          <CheckboxRow
            label="Enable Tax / VAT calculation on Quotations, Bookings & Invoices"
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
            hint="Enforced · never hardcoded; turn off if rates are exempt or non-VAT registered"
          />
          <div className="grid gap-3.5 sm:grid-cols-3">
            <TextInput
              label="Tax Label"
              value={draft.tax?.name ?? 'VAT'}
              onChange={(e) => set('tax', { ...(draft.tax ?? {}), name: e.target.value } as Settings['tax'])}
            />
            <TextInput
              label="Tax Rate (%)"
              type="number"
              min={0}
              max={50}
              value={String(draft.tax?.ratePercent ?? 0)}
              onChange={(e) =>
                set('tax', { ...(draft.tax ?? {}), ratePercent: Number(e.target.value) } as Settings['tax'])
              }
            />
            <CheckboxRow
              label="Rates are tax-inclusive"
              checked={Boolean(draft.tax?.inclusive ?? true)}
              onChange={(on) => set('tax', { ...(draft.tax ?? {}), inclusive: on } as Settings['tax'])}
            />
          </div>
          <div className="grid gap-3.5 sm:grid-cols-3 border-t border-sand-100 pt-3">
            <TextInput
              label="Quotation Prefix"
              value={draft.documents?.quotationPrefix ?? 'QUO'}
              onChange={(e) =>
                set('documents', { ...(draft.documents ?? {}), quotationPrefix: e.target.value } as Settings['documents'])
              }
            />
            <TextInput
              label="Invoice Prefix"
              value={draft.documents?.invoicePrefix ?? 'INV'}
              onChange={(e) =>
                set('documents', { ...(draft.documents ?? {}), invoicePrefix: e.target.value } as Settings['documents'])
              }
            />
            <TextInput
              label="Official Receipt Prefix"
              value={draft.documents?.receiptPrefix ?? 'RCP'}
              onChange={(e) =>
                set('documents', { ...(draft.documents ?? {}), receiptPrefix: e.target.value } as Settings['documents'])
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

        <Panel
          title="Google Business Profile Readiness & Onboarding"
          subtitle="Structured Google Search & Google Maps listing preparation (honest verification tracking)"
          bodyClass="p-4 space-y-3.5"
        >
          <div className="rounded-md border border-sand-200 bg-sand-50 p-3 text-[0.8rem] text-navy-700">
            <p className="font-semibold text-navy-900">
              Official Verification Status:{' '}
              <span className="uppercase">
                {draft.googleBusiness?.googleVerified
                  ? 'Confirmed Externally in Google Business Manager'
                  : 'Pending Official Google Verification'}
              </span>
            </p>
            <p className="mt-1 text-navy-600">
              Google Business Profile ownership verification must be completed directly with Google
              via postcard, phone, video, or Search Console. Use the synchronised property details
              below to submit or update your listing accurately.
            </p>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
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
              label="Google Maps Profile URL"
              value={draft.googleBusiness?.mapsProfileUrl ?? ''}
              onChange={(e) =>
                set('googleBusiness', {
                  ...(draft.googleBusiness ?? {}),
                  mapsProfileUrl: e.target.value,
                } as Settings['googleBusiness'])
              }
              hint="Paste your live Google Maps share URL once verified"
            />
            <TextInput
              label="Verification Note"
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
            hint="Only enable after completing official verification at business.google.com"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand-100 pt-3">
            <a
              href="https://business.google.com/create"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary h-9 px-3 text-[0.8rem]"
            >
              Open Official Google Business Profile Setup
            </a>
            <button
              type="button"
              className="btn-primary h-9 px-3.5 text-[0.82rem]"
              disabled={saving === 'googleBusiness'}
              onClick={() => saveSection('googleBusiness', 'Google Business Profile')}
            >
              <Save size={14} /> Save GBP Onboarding Details
            </button>
          </div>
        </Panel>

        <Panel title="Locale & data storage" subtitle="Where the live records are kept, and what this property currently holds" bodyClass="p-4 space-y-3.5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <SelectInput
              label="Currency"
              value="ZMW"
              disabled
              onChange={() => undefined}
              options={[{ value: 'ZMW', label: 'Zambian Kwacha (ZMW)' }]}
              hint="The pricing engine stores whole Kwacha; ZMW only"
            />
            <TextInput label="Currency symbol" value={draft.locale.currencySymbol} onChange={(e) => set('locale', { currencySymbol: e.target.value })} hint="Used in every money figure on screen and on paper" />
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <TextInput label="Time zone" value={draft.locale.timezone} disabled onChange={() => undefined} hint="Business date and day boundaries" />
            <TextInput label="Date style" value={draft.locale.dateStyle} disabled onChange={() => undefined} hint="day-month-year, as used in Zambia" />
          </div>

          <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-3">
            <p className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-navy-800">
              <Database size={13} className="text-teal-600" /> Live data
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.78rem] sm:grid-cols-4">
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
                <p className="col-span-4 text-navy-400">Storage figures unavailable — the data endpoint did not answer.</p>
              )}
            </dl>
            <p className="mt-2 text-[0.74rem] leading-relaxed text-navy-500">
              These figures reflect the bookings, payments and apartments currently on record.
              {stats ? ` Last updated for ${stats.today}.` : ''}
            </p>
          </div>
          <SectionFooter onSave={() => saveSection('locale', 'Locale')} busy={saving === 'locale'} dirty={dirty} />
        </Panel>
      </div>

    </div>
  );
}

function SectionFooter({ onSave, busy, dirty }: { onSave: () => void; busy: boolean; dirty: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-sand-100 pt-3">
      <p className="text-[0.74rem] text-navy-400">{dirty ? 'This section has unsaved edits.' : 'Everything on this panel matches the stored configuration.'}</p>
      <button type="button" className="btn-primary h-9 px-3.5 text-[0.82rem]" onClick={onSave} disabled={busy}>
        {busy ? 'Saving…' : <><Save size={14} /> Save section</>}
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
