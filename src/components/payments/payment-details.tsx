'use client';

import { useState } from 'react';
import { paymentDetails, type PublicPaymentMethod } from '@/lib/domain/payment-details';

export function CopyDetail({ label, value }: { label: string; value: string }) {
  const [message, setMessage] = useState('');
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 py-1.5 last:border-0">
    <span className="min-w-0 break-words"><span className="text-navy-500">{label}: </span><strong>{value}</strong></span>
    <button type="button" className="btn-secondary min-h-10 px-3 text-xs" aria-label={`Copy ${label}`} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setMessage('Copied successfully'); }
      catch { setMessage('Copy unavailable; select the text to copy it.'); }
    }}>Copy</button>
    <span role="status" className="w-full text-xs text-navy-500">{message}</span>
  </div>;
}

export function PaymentDetails({ method }: { method: Omit<PublicPaymentMethod, 'id'> }) {
  const details = paymentDetails(method);
  return <div>
    {details.map(({ label, value }) => <CopyDetail key={label} label={label} value={value} />)}
    {!details.length && !method.instructions && !method.additionalInstructions ? <p>Payment details have not yet been configured.</p> : null}
    {method.instructions ? <p className="mt-2 whitespace-pre-line">{method.instructions}</p> : null}
    {method.additionalInstructions ? <p className="mt-2 whitespace-pre-line">{method.additionalInstructions}</p> : null}
  </div>;
}
