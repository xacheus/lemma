'use client';

import Link from 'next/link';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';



export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-navy-400">
      <Loader2 size={size} className="animate-spin" />
      {label ? <span className="text-[0.8rem]">{label}</span> : null}
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-sand-200/70 ${className}`} />;
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClass = '',
  icon: Icon,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
  icon?: LucideIcon;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sand-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold text-navy-800">
              {Icon ? <Icon size={15} className="text-gold-500" /> : null}
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-[0.78rem] leading-snug text-navy-400">{subtitle}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={bodyClass || 'p-4 sm:p-5'}>{children}</div>
    </section>
  );
}

export function StatusChip({ className = '', children, dot }: { className?: string; children: React.ReactNode; dot?: string }) {
  return (
    <span className={`chip ${className}`}>
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /> : null}
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-sand-300 bg-sand-50/60 px-6 py-10 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-navy-300 ring-1 ring-sand-300">
        <Icon size={18} />
      </span>
      <p className="text-[0.9rem] font-semibold text-navy-700">{title}</p>
      {body ? <p className="max-w-sm text-[0.82rem] leading-relaxed text-navy-400">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const styles = {
    info: 'border-navy-100 bg-navy-50/70 text-navy-700',
    warn: 'border-gold-200 bg-gold-50 text-gold-700',
    error: 'border-st-cancelled/30 bg-st-cancelledBg text-st-cancelled',
    success: 'border-st-available/30 bg-st-availableBg text-st-available',
  }[tone];
  return (
    <div className={`flex flex-wrap items-start gap-3 rounded-lg border px-3 py-2.5 text-[0.82rem] leading-relaxed ${styles}`}>
      <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${tone === 'info' ? 'text-navy-400' : ''}`} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : ''}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  size = 'md',
}: {
  tabs: { value: T; label: string; count?: number; href?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-sand-100/80 p-1 ring-1 ring-sand-200">
      {tabs.map((tab) => {
        const active = tab.value === value;
        const inner = (
          <>
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span className={`ml-1.5 rounded px-1 text-[0.68rem] font-semibold ${active ? 'bg-navy-700/10 text-navy-600' : 'bg-sand-200/70 text-navy-500'}`}>
                {tab.count}
              </span>
            ) : null}
          </>
        );
        const className = `inline-flex items-center rounded-md font-semibold transition ${
          size === 'sm' ? 'px-2.5 py-1 text-[0.76rem]' : 'px-3 py-1.5 text-[0.82rem]'
        } ${active ? 'bg-white text-navy-800 shadow-sm ring-1 ring-sand-300' : 'text-navy-500 hover:text-navy-700'}`;
        return tab.href ? (
          <Link key={tab.value} href={tab.href} className={className}>
            {inner}
          </Link>
        ) : (
          <button key={tab.value} type="button" onClick={() => onChange(tab.value)} className={className}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
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
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-teal-500' : 'bg-sand-300'}`}
      >
        <span className={`block h-4 w-4 translate-y-[2px] rounded-full bg-white shadow transition ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
      </button>
      <span className="min-w-0">
        <span className="block text-[0.85rem] font-medium text-navy-800">{label}</span>
        {hint ? <span className="mt-0.5 block text-[0.78rem] leading-snug text-navy-400">{hint}</span> : null}
      </span>
    </label>
  );
}

export function Pagination({
  page,
  pages,
  total,
  perPage,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  perPage: number;
  onPage: (p: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 px-4 py-3 text-[0.78rem] text-navy-400">
      <p>
        Showing <span className="font-semibold text-navy-700">{from}</span>–<span className="font-semibold text-navy-700">{to}</span> of{' '}
        <span className="font-semibold text-navy-700">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button type="button" className="btn-secondary h-8 w-8 p-0" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft size={15} />
        </button>
        <span className="px-2 tabular-nums">
          {page} / {Math.max(1, pages)}
        </span>
        <button type="button" className="btn-secondary h-8 w-8 p-0" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages} aria-label="Next page">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

export function DataTable({ head, children, className = '' }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={`scroll-slim w-full overflow-x-auto ${className}`}>
      <table className="w-full min-w-[46rem] border-collapse">
        <thead className="bg-sand-50/80">
          <tr className="border-b border-sand-200">
            {head.map((cell, i) => (
              <th key={i} className={`th ${typeof cell === 'string' && /total|amount|balance|K$/i.test(cell) ? 'text-right' : ''}`}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Avatar({ name, size = 32, tone = 'navy' }: { name: string; size?: number; tone?: 'navy' | 'gold' | 'teal' }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const bg = tone === 'gold' ? 'bg-gold-100 text-gold-700' : tone === 'teal' ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-700';
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${bg}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials || '—'}
    </span>
  );
}

export function Progress({ value, tone = 'teal' }: { value: number; tone?: 'teal' | 'gold' | 'navy' }) {
  const bg = tone === 'gold' ? 'bg-gold-400' : tone === 'navy' ? 'bg-navy-700' : 'bg-teal-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand-200">
      <div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
