'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useDismiss(open, onClose);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size];
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-navy-950/45 p-4 backdrop-blur-[2px] sm:p-6 no-print" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" aria-label="Close dialog" onClick={onClose} tabIndex={-1} />
      <div
        ref={panel}
        tabIndex={-1}
        className={`relative my-auto w-full ${width} overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-pop outline-none`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-sand-200 bg-sand-50/60 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[1rem] font-semibold text-navy-800">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[0.8rem] leading-snug text-navy-400">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="-mr-1 -mt-1 rounded-lg p-1.5 text-navy-400 hover:bg-sand-200/60 hover:text-navy-700" aria-label="Close">
            <X size={17} />
          </button>
        </header>
        <div className="scroll-slim max-h-[calc(100vh-16rem)] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-sand-200 bg-sand-50/60 px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Right-hand sheet used for reservation detail so the list stays in context. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useDismiss(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-navy-950/40 no-print" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" aria-label="Close panel" onClick={onClose} tabIndex={-1} />
      <aside className={`relative flex h-full w-full ${width} flex-col border-l border-sand-200 bg-white shadow-pop`}>
        <header className="flex items-start justify-between gap-4 border-b border-sand-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[1rem] font-semibold text-navy-800">{title}</h2>
            {subtitle ? <div className="mt-1 text-[0.8rem] text-navy-400">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="-mr-1 rounded-lg p-1.5 text-navy-400 hover:bg-sand-100 hover:text-navy-700" aria-label="Close panel">
            <X size={17} />
          </button>
        </header>
        <div className="scroll-slim flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center gap-2 border-t border-sand-200 bg-sand-50/70 px-5 py-3">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  tone = 'primary',
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger' | 'gold';
  busy?: boolean;
}) {
  const buttonClass = tone === 'danger' ? 'btn-danger h-10 px-4' : tone === 'gold' ? 'btn-gold h-10 px-4' : 'btn-primary h-10 px-4';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary h-10 px-4" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={buttonClass} onClick={onConfirm} disabled={busy}>
            {busy ? <LoaderSpinner /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[0.88rem] leading-relaxed text-navy-600">{body}</div>
    </Modal>
  );
}

function LoaderSpinner() {
  return (
    <span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white align-[-2px]" aria-hidden />
  );
}
