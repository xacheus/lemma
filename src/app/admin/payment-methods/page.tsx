'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/providers/app';
import { PageHeader } from '@/components/admin/shell';
import { EmptyState, Panel, Skeleton, Toggle } from '@/components/ui';
import { TextArea, TextInput } from '@/components/ui/forms';
import { DEFAULT_SETTINGS } from '@/lib/db/default-settings';
import type { PaymentMethodSetting } from '@/lib/domain/types';

const fields: Array<{ key: keyof PaymentMethodSetting; label: string; methods?: string[] }> = [
  { key: 'networkName', label: 'Network name', methods: ['airtel_money', 'mtn_money'] },
  { key: 'recipientName', label: 'Recipient name' },
  { key: 'mobileNumber', label: 'Mobile money number', methods: ['airtel_money', 'mtn_money'] },
  { key: 'merchantCode', label: 'Merchant code', methods: ['airtel_money', 'mtn_money'] },
  { key: 'agentCode', label: 'Agent code', methods: ['airtel_money', 'mtn_money'] },
  { key: 'businessName', label: 'Account or business name' },
  { key: 'bankName', label: 'Bank name', methods: ['bank_transfer'] },
  { key: 'bankAccountName', label: 'Bank account name', methods: ['bank_transfer'] },
  { key: 'bankAccountNumber', label: 'Bank account number', methods: ['bank_transfer'] },
  { key: 'bankBranch', label: 'Bank branch', methods: ['bank_transfer'] },
  { key: 'accountLabel', label: 'Other destination label' },
  { key: 'accountNumber', label: 'Other destination value' },
];

export default function PaymentMethodsPage() {
  const { snapshot, request, toast, can } = useApp();
  const [methods, setMethods] = useState<PaymentMethodSetting[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (snapshot && !methods) {
      const existing = snapshot.settings.payments.methods;
      setMethods(DEFAULT_SETTINGS.payments.methods.map((fallback) => existing.find((m) => m.id === fallback.id) ?? { ...fallback, enabled: false }));
    }
  }, [snapshot, methods]);
  if (!snapshot) return <Skeleton className="h-96" />;
  if (!can('settings.manage') || !['admin', 'super_admin'].includes(snapshot.user.role)) return <EmptyState title="Administrators only" body="Only an administrator can change payment details." />;
  if (!methods) return <Skeleton className="h-96" />;
  const update = (index: number, patch: Partial<PaymentMethodSetting>) => setMethods((current) => current?.map((method, i) => i === index ? { ...method, ...patch } : method) ?? null);
  const save = async () => {
    setBusy(true);
    try {
      await request('/api/settings', { method: 'PATCH', data: { payments: { methods } } });
      toast({ tone: 'success', title: 'Payment methods saved', body: 'Enabled instructions are visible to customers.' });
    } catch { /* request shows the error */ } finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <PageHeader title="Payment Methods" description="Configure the destinations customers use for manual payments. Leave fields blank when they do not apply." />
    <p className="text-sm text-navy-600">Only enabled methods are offered to customers. Changes do not automatically collect or verify payments.</p>
    {methods.map((method, index) => <Panel key={method.id} title={method.label} bodyClass="space-y-3 p-4">
      <Toggle checked={method.enabled} onChange={(enabled) => update(index, { enabled })} label={method.enabled ? 'Enabled for customers' : 'Disabled'} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.filter((field) => !field.methods || field.methods.includes(method.id)).map((field) => <TextInput key={field.key} label={field.label} value={String(method[field.key] ?? '')} onChange={(e) => update(index, { [field.key]: e.target.value })} />)}
      </div>
      <TextArea label="Payment instructions" rows={3} maxLength={1000} value={method.instructions} onChange={(e) => update(index, { instructions: e.target.value })} />
      <TextArea label="Additional instructions" rows={2} maxLength={1000} value={method.additionalInstructions ?? ''} onChange={(e) => update(index, { additionalInstructions: e.target.value })} />
    </Panel>)}
    <button type="button" className="btn-primary min-h-11" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save payment methods'}</button>
  </div>;
}
