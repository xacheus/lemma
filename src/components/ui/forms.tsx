'use client';

import { AlertCircle, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

/* ------------------------------------------------------------------------- wrappers */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className = '',
  htmlFor,
  suffix,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
  suffix?: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label ? (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <label htmlFor={htmlFor} className="label">
            {label}
            {required ? <span className="ml-0.5 text-st-cancelled">*</span> : null}
          </label>
          {suffix}
        </div>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-[0.75rem] font-medium text-st-cancelled">
          <AlertCircle size={12} /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[0.75rem] leading-snug text-navy-400">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  suffix?: React.ReactNode;
};

export function TextInput({ label, hint, error, suffix, className = '', ...rest }: InputProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={rest.required} className={className} suffix={suffix}>
      <input id={id} {...rest} className={`field ${error ? 'field-invalid' : ''} ${className}`} />
    </Field>
  );
}

export function MoneyInput({
  label,
  hint,
  error,
  value,
  onValueChange,
  className = '',
  ...rest
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  value: number | string;
  onValueChange: (n: number) => void;
  className?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.85rem] font-semibold text-navy-400">K</span>
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.]/g, '');
            onValueChange(raw === '' ? 0 : Number(raw));
          }}
          className={`field pl-7 tabular-nums ${error ? 'field-invalid' : ''}`}
          {...rest}
        />
      </div>
    </Field>
  );
}

export function DateInput({
  label,
  hint,
  error,
  className = '',
  ...rest
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={rest.required} className={className}>
      <input id={id} type="date" {...rest} className={`field tabular-nums ${error ? 'field-invalid' : ''}`} />
    </Field>
  );
}

export function SelectInput({
  label,
  hint,
  error,
  options,
  className = '',
  loading,
  ...rest
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  options: { value: string; label: string; disabled?: boolean; note?: string }[];
  className?: string;
  loading?: boolean;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={rest.required} className={className}>
      <div className="relative">
        <select id={id} {...rest} className={`field appearance-none pr-9 ${error ? 'field-invalid' : ''}`}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
              {o.note ? ` — ${o.note}` : ''}
            </option>
          ))}
        </select>
        {loading ? (
          <Loader2 size={14} className="absolute right-8 top-1/2 -translate-y-1/2 animate-spin text-navy-400" />
        ) : null}
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-navy-400" />
      </div>
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  counter,
  className = '',
  ...rest
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  counter?: boolean;
  className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const [length, setLength] = useState(() => String(rest.value ?? '').length);
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      htmlFor={id}
      className={className}
      suffix={
        counter ? (
          <span className="text-[0.7rem] tabular-nums text-navy-400">
            {length}/{rest.maxLength ?? 600}
          </span>
        ) : null
      }
    >
      <textarea
        id={id}
        {...rest}
        onChange={(e) => {
          setLength(e.target.value.length);
          rest.onChange?.(e);
        }}
        className={`field min-h-[84px] resize-y leading-relaxed ${error ? 'field-invalid' : ''}`}
      />
    </Field>
  );
}

export function CheckboxRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex items-start gap-2.5 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-sand-400 text-teal-600 focus:ring-gold-300"
      />
      <span className="min-w-0">
        <span className="block text-[0.85rem] font-medium leading-snug text-navy-800">{label}</span>
        {hint ? <span className="mt-0.5 block text-[0.76rem] leading-snug text-navy-400">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field pl-9 pr-8"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-navy-400 hover:bg-sand-100 hover:text-navy-700"
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex max-w-full flex-wrap rounded-lg border border-sand-300 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-[0.78rem] font-semibold transition ${
            o.value === value ? 'bg-navy-800 text-white' : 'text-navy-500 hover:bg-sand-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Reads an image file to a data URL so the proof of payment travels with the receipt record. */
export function ProofUploader({
  value,
  onChange,
  maxBytes = 1_500_000,
}: {
  value: { fileName: string; mimeType: string; dataUrl: string; sizeBytes: number } | null;
  onChange: (next: { fileName: string; mimeType: string; dataUrl: string; sizeBytes: number } | null) => void;
  maxBytes?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'reading' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-dashed border-sand-300 bg-sand-50/60 p-3">
      {value ? (
        <div className="flex flex-wrap items-center gap-3">
          <img src={value.dataUrl} alt="Uploaded proof of payment" className="h-14 w-14 rounded-md border border-sand-300 object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.82rem] font-semibold text-navy-800">{value.fileName}</p>
            <p className="text-[0.75rem] text-navy-400">
              {(value.sizeBytes / 1024).toFixed(0)} KB · attached to this receipt as evidence, not as confirmation
            </p>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => onChange(null)}>
            Remove
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[0.82rem] font-semibold text-navy-700">Attach proof of payment</p>
            <p className="text-[0.75rem] text-navy-400">A photo of the Airtel/MTN SMS or the deposit slip. JPG or PNG up to {Math.round(maxBytes / 1000)} KB.</p>
          </div>
          <div className="flex items-center gap-2">
            {state === 'reading' ? <Loader2 size={14} className="animate-spin text-navy-400" /> : null}
            <button type="button" className="btn-secondary btn-sm" onClick={() => input.current?.click()}>
              Choose file
            </button>
          </div>
        </div>
      )}
      {message ? <p className="mt-2 text-[0.75rem] font-medium text-st-cancelled">{message}</p> : null}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > maxBytes) {
            setState('error');
            setMessage(`That image is ${(file.size / 1024).toFixed(0)} KB — proof is stored inline with the receipt, so it is capped at ${Math.round(maxBytes / 1000)} KB.`);
            return;
          }
          setState('reading');
          setMessage(null);
          const reader = new FileReader();
          reader.onload = () => {
            onChange({ fileName: file.name, mimeType: file.type, dataUrl: String(reader.result), sizeBytes: file.size });
            setState('idle');
          };
          reader.onerror = () => {
            setState('error');
            setMessage('The file could not be read. Try another photo.');
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
