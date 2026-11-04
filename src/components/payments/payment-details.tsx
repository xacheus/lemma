'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { paymentDetails, type PublicPaymentMethod } from '@/lib/domain/payment-details';

export function CopyDetail({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'err'>('idle');

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200/70 py-1.5 last:border-0">
      <span className="min-w-0 break-words text-[0.81rem]">
        <span className="text-sand-600">{label}: </span>
        <strong className="font-semibold text-navy-900">{value}</strong>
      </span>
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded border border-sand-300 bg-white px-2 text-[0.72rem] font-medium text-navy-700 transition-colors hover:border-navy-800 hover:text-navy-900"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied('ok');
            window.setTimeout(() => setCopied('idle'), 2000);
          } catch {
            setCopied('err');
          }
        }}
      >
        {copied === 'ok' ? <Check size={12} className="text-st-available" /> : <Copy size={12} />}
        {copied === 'ok' ? 'Copied' : 'Copy'}
      </button>
      {copied === 'err' ? (
        <span role="status" className="w-full text-[0.72rem] text-sand-600">
          Select the text above to copy it manually.
        </span>
      ) : (
        <span role="status" className="sr-only">
          {copied === 'ok' ? `${label} copied` : ''}
        </span>
      )}
    </div>
  );
}

export function PaymentDetails({ method }: { method: Omit<PublicPaymentMethod, 'id'> }) {
  const details = paymentDetails(method);
  const hasAny = Boolean(details.length || method.instructions || method.additionalInstructions);

  return (
    <div>
      {details.map(({ label, value }) => (
        <CopyDetail key={label} label={label} value={value} />
      ))}
      {!hasAny ? (
        <p className="text-[0.79rem] leading-relaxed text-sand-700">
          Reception shares the verified merchant or bank number directly on confirmation so you
          always pay against an active booking reference.
        </p>
      ) : null}
      {method.instructions ? (
        <p className="mt-2 whitespace-pre-line text-[0.8rem] text-navy-800">{method.instructions}</p>
      ) : null}
      {method.additionalInstructions ? (
        <p className="mt-1.5 whitespace-pre-line text-[0.78rem] text-sand-700">
          {method.additionalInstructions}
        </p>
      ) : null}
    </div>
  );
}
