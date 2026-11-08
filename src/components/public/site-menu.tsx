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
import { brandMonogram } from './brand-mark';

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

  const monogram = brandMonogram(property.name || 'Lemma Apartments');
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
        className="absolute inset-0 h-full w-full cursor-default bg-[#05101b]/70 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        // Full-screen on phones, a side column from `sm` up. The height cap is declared on
        // `.menu-panel` in globals.css so it is measured against the viewport: `max-h-full`
        // here resolves against the full-height overlay instead, which leaves the panel
        // with no scroll container of its own.
        className={`menu-panel swdl-menu absolute inset-x-0 top-0 flex flex-col overflow-y-auto shadow-[0_24px_80px_rgba(5,15,26,.45)] transition-transform duration-300 ease-smooth sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[27rem] ${
          open ? 'translate-y-0 sm:translate-x-0' : '-translate-y-3 sm:translate-y-0 sm:translate-x-6'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0c2338]/95 px-4 py-3.5 backdrop-blur-sm sm:px-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#c9a15a] to-[#a8823f] font-heading text-[0.82rem] font-extrabold tracking-[0.04em] text-[#0f2b46]">
              {monogram}
            </span>
            <div>
              <p className="menu-brand-name">{property.name || 'Lemma Apartments'}</p>
              <p className="menu-brand-sub">
                {property.city || 'Lusaka'} · Menu
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="menu-close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 px-4 py-4 sm:px-5">
          {session ? (
            <div className="menu-card mb-4 flex items-center gap-3">
              <span className="menu-avatar">
                <UserRound size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-heading text-[0.88rem] font-bold text-white">{session.user.name}</p>
                <p className="truncate text-[0.74rem] text-[#8fa0b0]">
                  {session.user.jobTitle || (role === 'guest' ? 'Registered guest' : role)}
                  {role && role !== 'guest' ? ' · staff account' : ''}
                </p>
              </div>
              <Link
                href={dashboardHref}
                onClick={onClose}
                className="inline-flex items-center gap-1 rounded-md border border-white/30 px-2.5 py-1.5 text-[0.74rem] font-semibold text-white transition-colors hover:border-[#c9a15a] hover:text-[#c9a15a]"
              >
                {role === 'cleaner' ? 'Open' : role === 'guest' ? 'Account' : 'Dashboard'}
                <ArrowRight size={12} />
              </Link>
            </div>
          ) : (
            <div className="menu-card mb-4">
              <p className="menu-card-title">Sign in to see your bookings</p>
              <p className="menu-card-copy">
                Receipts, balances and payment status live in your account.
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/login" onClick={onClose} className="menu-btn-gold flex-1">
                  <User size={13} /> Sign in
                </Link>
                <Link href="/register" onClick={onClose} className="menu-btn-outline flex-1">
                  Create account
                </Link>
              </div>
            </div>
          )}

          {groups.map((group) => (
            <nav key={group.title} aria-label={group.title} className="mb-4">
              <p className="menu-label mb-2 px-1">
                {group.title}
              </p>
              <ul className="menu-list">
                {group.links.map((link) => {
                  const active =
                    link.href === '/' ? activePath === '/' : activePath.startsWith(link.href.split('#')[0]);
                  const Icon = link.icon;
                  const showBadge =
                    unreadCount > 0 && link.label.toLowerCase().includes('notification');
                  return (
                    <li key={`${link.href}-${link.label}`} className="menu-item">
                      <Link
                        href={link.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className="menu-link"
                      >
                        <Icon size={16} className="menu-link-icon" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="menu-link-label">{link.label}</span>
                          {link.note ? (
                            <span className="menu-link-note">{link.note}</span>
                          ) : null}
                        </span>
                        {showBadge ? (
                          <span className="menu-badge">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        ) : (
                          <ArrowRight size={13} className="menu-link-arrow" aria-hidden="true" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}

          <div className="menu-card">
            <p className="menu-label">
              Reception
            </p>
            <ul className="mt-2.5 space-y-2">
              <li className="menu-contact-item">
                <Phone size={13} className="menu-link-icon" />
                <a href={`tel:${property.phone.replace(/\s/g, '')}`}>
                  {property.phone}
                </a>
              </li>
              {waDigits ? (
                <li className="menu-contact-item">
                  <MessageCircle size={13} className="menu-link-icon" />
                  <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer">
                    WhatsApp {property.whatsapp}
                  </a>
                </li>
              ) : null}
              <li className="menu-contact-item">
                <Mail size={13} className="menu-link-icon shrink-0" />
                <a href={`mailto:${property.email}`} className="truncate">
                  {property.email}
                </a>
              </li>
              <li className="menu-contact-item items-start">
                <MapPin size={13} className="menu-link-icon mt-0.5" />
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
                className="menu-signout"
              >
                <LogOut size={14} /> Sign out
              </button>
            </form>
          ) : (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[0.72rem] text-[#7d90a1]">
              <ShieldCheck size={12} /> Staff roles are assigned by management
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return portalTarget ? createPortal(overlay, portalTarget) : null;
}
