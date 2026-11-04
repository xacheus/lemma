'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Info,
  SprayCan,
  User,
  UserRound,
  X,
} from 'lucide-react';
import type { Settings } from '@/lib/domain/types';
import type { Session } from '@/lib/auth/session';
import { defaultDashboardForRole, NAV_SECTIONS, permissionsFor } from '@/lib/domain/permissions';
import { BrandMark } from './brand-mark';

/**
 * Full-screen site menu.
 *
 * A real overlay rather than a dropdown: it covers the viewport, locks the page
 * behind it, traps focus between the first and last control, closes on Escape, on any
 * link, and on a tap outside the panel column. It animates in on a short
 * opacity/translate transition and respects `prefers-reduced-motion`.
 *
 * It is rendered through a portal into `document.body` on purpose. The trigger lives
 * inside the public header, and that header is `position: sticky`, which makes it the
 * containing block for any `position: fixed` descendant — left in place the overlay is
 * clipped to the header's 68px strip, and everything below the title bar is unreachable.
 * Portalling keeps the overlay anchored to the viewport.
 *
 * What it contains depends on the verified role read from the session on the server —
 * a guest never receives the staff entries in the HTML at all, so there is nothing to
 * unhide in devtools.
 */

interface MenuLink {
  href: string;
  label: string;
  icon: typeof Home;
  note?: string;
}

const PUBLIC_LINKS: MenuLink[] = [
  { href: '/', label: 'Home', icon: Home, note: 'Overview, rates and how booking works' },
  { href: '/apartments', label: 'Apartments', icon: Building2, note: 'Compare layouts and ZMW rates' },
  { href: '/apartments#availability', label: 'Check availability', icon: CalendarDays, note: 'Search by arrival and departure dates' },
  { href: '/booking/access', label: 'Find a guest booking', icon: CalendarCheck, note: 'Look up a stay with your reference' },
  { href: '/policies', label: 'Booking info & policies', icon: ShieldCheck, note: 'Deposit, cancellation and house rules' },
  { href: '/about', label: 'About the property', icon: Info },
  { href: '/contact', label: 'Contact & location', icon: MapPin, note: 'Barlaston Park, Lusaka' },
];

const GUEST_EXTRA: MenuLink[] = [
  { href: '/account', label: 'My bookings & receipts', icon: CalendarCheck, note: 'Stays, PDF receipts and balances' },
  { href: '/account#payments', label: 'Pay for a stay', icon: CreditCard, note: 'Mobile money, transfer or cash' },
  { href: '/account#notifications', label: 'Notifications', icon: Bell },
];

export function SiteMenu({
  open,
  onClose,
  property,
  session,
  activePath,
  unreadCount = 0,
}: {
  open: boolean;
  onClose: () => void;
  property: Settings['property'];
  session: Session | null;
  activePath: string;
  unreadCount?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // `document` does not exist while the server renders this component, so the portal
  // target is only read once we are on the client.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setPortalTarget(document.body), []);

  // Lock background scroll while open, and restore whatever was there before.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 60);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  // Escape closes; Tab cycles inside the panel so a keyboard user cannot wander into
  // the page behind the overlay.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const role = session?.user.role ?? null;
  const permissions = session ? session.permissions : null;
  const dashboardHref = role ? defaultDashboardForRole(role) : '/login';

  const staffLinks: MenuLink[] = [];
  if (session && role && role !== 'guest') {
    const perms = permissions ?? permissionsFor(session.user);
    if (role === 'cleaner') {
      staffLinks.push({
        href: '/portal/cleaning',
        label: 'Cleaning dashboard',
        icon: SprayCan,
        note: 'Your turnovers for today',
      });
    } else {
      staffLinks.push({
        href: '/admin',
        label: 'Operations dashboard',
        icon: LayoutDashboard,
        note: 'Today at a glance',
      });
      for (const item of NAV_SECTIONS) {
        if (item.href === '/admin') continue;
        if (!perms.has(item.permission)) continue;
        staffLinks.push({ href: item.href, label: item.label, icon: Building2 });
      }
    }
  }

  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');
  const groups: { title: string; links: MenuLink[] }[] = [
    { title: 'Explore', links: PUBLIC_LINKS },
  ];
  if (session && role === 'guest') {
    groups.push({ title: 'Your account', links: GUEST_EXTRA });
  }
  if (staffLinks.length) {
    groups.push({
      title: role === 'cleaner' ? 'Housekeeping' : 'Workspace',
      links: staffLinks,
    });
  }

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      // Kept in the tree so the transition can run both ways; `invisible` removes it
      // from hit-testing and from the accessibility tree when closed.
      className={`fixed inset-0 z-[90] transition-opacity duration-300 ease-smooth ${
        open ? 'visible opacity-100' : 'invisible opacity-0'
      }`}
    >
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-charcoal-950/60 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        // Full-screen on phones, a side column from `sm` up. The height cap is declared on
        // `.menu-panel` in globals.css so it is measured against the viewport: `max-h-full`
        // here resolves against the full-height overlay instead, which leaves the panel
        // with no scroll container of its own.
        className={`menu-panel absolute inset-x-0 top-0 flex flex-col overflow-y-auto bg-sand-50 shadow-pop transition-transform duration-300 ease-smooth sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[27rem] ${
          open ? 'translate-y-0 sm:translate-x-0' : '-translate-y-3 sm:translate-y-0 sm:translate-x-6'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-sand-200 bg-sand-50/95 px-4 py-3 backdrop-blur-sm sm:px-5">
          <div className="flex items-center gap-2.5">
            <BrandMark tone="light" size="sm" />
            <div>
              <p className="font-display text-[0.95rem] font-semibold text-navy-900">
                {property.name || 'Lemma Apartments'}
              </p>
              <p className="text-[0.68rem] text-sand-600">
                {property.city || 'Lusaka'} · Navigation
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-sand-300 bg-white text-navy-700 transition-colors hover:border-navy-900 hover:text-navy-900"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 px-4 py-4 sm:px-5">
          {session ? (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-sand-200 bg-white p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-900 text-white">
                <UserRound size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.88rem] font-semibold text-navy-900">{session.user.name}</p>
                <p className="truncate text-[0.74rem] text-navy-500">
                  {session.user.jobTitle || (role === 'guest' ? 'Registered guest' : role)}
                  {role && role !== 'guest' ? ' · staff account' : ''}
                </p>
              </div>
              <Link
                href={dashboardHref}
                onClick={onClose}
                className="inline-flex items-center gap-1 rounded-md border border-sand-300 px-2.5 py-1.5 text-[0.74rem] font-medium text-navy-800 hover:border-navy-900"
              >
                {role === 'cleaner' ? 'Open' : role === 'guest' ? 'Account' : 'Dashboard'}
                <ArrowRight size={12} />
              </Link>
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-sand-200 bg-white p-3">
              <p className="text-[0.84rem] font-medium text-navy-900">Sign in to see your bookings</p>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-navy-500">
                Receipts, balances and payment status live in your account.
              </p>
              <div className="mt-2.5 flex gap-2">
                <Link href="/login" onClick={onClose} className="btn btn-primary flex-1 justify-center py-1.5 text-[0.78rem]">
                  <User size={13} /> Sign in
                </Link>
                <Link href="/register" onClick={onClose} className="btn btn-secondary flex-1 justify-center py-1.5 text-[0.78rem]">
                  Create account
                </Link>
              </div>
            </div>
          )}

          {groups.map((group) => (
            <nav key={group.title} aria-label={group.title} className="mb-4">
              <p className="mb-1.5 px-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-navy-400">
                {group.title}
              </p>
              <ul className="overflow-hidden rounded-lg border border-sand-200 bg-white">
                {group.links.map((link, index) => {
                  const active =
                    link.href === '/' ? activePath === '/' : activePath.startsWith(link.href.split('#')[0]);
                  const Icon = link.icon;
                  const showBadge =
                    unreadCount > 0 && link.label.toLowerCase().includes('notification');
                  return (
                    <li key={`${link.href}-${link.label}`} className={index ? 'border-t border-sand-100' : ''}>
                      <Link
                        href={link.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                          active ? 'bg-sand-50' : 'hover:bg-sand-50'
                        }`}
                      >
                        <Icon size={16} className="shrink-0 text-lemma-dark" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-[0.88rem] ${
                              active ? 'font-semibold text-navy-900' : 'text-navy-800'
                            }`}
                          >
                            {link.label}
                          </span>
                          {link.note ? (
                            <span className="block truncate text-[0.72rem] text-navy-500">{link.note}</span>
                          ) : null}
                        </span>
                        {showBadge ? (
                          <span className="rounded-full bg-lemma-dark px-1.5 py-0.5 text-[0.66rem] font-semibold text-white">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        ) : (
                          <ArrowRight size={13} className="shrink-0 text-navy-300" aria-hidden="true" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}

          <div className="rounded-lg border border-sand-200 bg-white p-3">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-navy-400">
              Reception
            </p>
            <ul className="mt-1.5 space-y-1.5 text-[0.8rem] text-navy-700">
              <li className="flex items-center gap-2">
                <Phone size={13} className="shrink-0 text-lemma-dark" />
                <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="hover:underline">
                  {property.phone}
                </a>
              </li>
              {waDigits ? (
                <li className="flex items-center gap-2">
                  <MessageCircle size={13} className="shrink-0 text-lemma-dark" />
                  <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" className="hover:underline">
                    WhatsApp {property.whatsapp}
                  </a>
                </li>
              ) : null}
              <li className="flex items-center gap-2">
                <Mail size={13} className="shrink-0 text-lemma-dark" />
                <a href={`mailto:${property.email}`} className="truncate hover:underline">
                  {property.email}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin size={13} className="mt-0.5 shrink-0 text-lemma-dark" />
                <span>
                  {property.addressLine}
                  {property.city ? `, ${property.city}` : ''}
                </span>
              </li>
            </ul>
          </div>

          {session ? (
            <form action="/api/auth/logout" method="post" className="mt-3">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-sand-300 bg-white px-3 py-2 text-[0.82rem] font-medium text-navy-700 transition-colors hover:border-navy-900 hover:text-navy-900"
              >
                <LogOut size={14} /> Sign out
              </button>
            </form>
          ) : (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[0.72rem] text-navy-400">
              <ShieldCheck size={12} /> Staff roles are assigned by management
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return portalTarget ? createPortal(overlay, portalTarget) : null;
}
