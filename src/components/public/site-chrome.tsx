'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  Clock,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  User,
} from 'lucide-react';
import type { Settings } from '@/lib/domain/types';
import type { Session } from '@/lib/auth/session';
import { defaultDashboardForRole } from '@/lib/domain/permissions';
import { useScrolled } from '@/components/ui/motion';
import { SiteMenu } from './site-menu';

export function PublicHeader({
  property,
  session,
  activePath = '/',
  unreadCount = 0,
}: {
  property: Settings['property'];
  session: Session | null;
  activePath?: string;
  unreadCount?: number;
}) {
  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');
  const scrolled = useScrolled(10);
  const [menuOpen, setMenuOpen] = useState(false);
  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/apartments', label: 'Apartments' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ];

  useEffect(() => {
    setMenuOpen(false);
  }, [activePath]);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-all duration-300 ease-smooth ${
        scrolled
          ? 'header-solid border-sand-200 bg-white/92 backdrop-blur-md'
          : 'border-transparent bg-white/80 backdrop-blur-sm'
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-all duration-300 ease-smooth sm:px-6 lg:px-8 ${
          scrolled ? 'py-2.5' : 'py-3.5'
        }`}
      >
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo.jpg"
            alt={property.name}
            className="h-10 w-10 rounded-md object-cover ring-1 ring-sand-300"
          />
          <div>
            <span className="block text-[0.95rem] font-bold tracking-[0.12em] text-navy-900">
              LEMMA APARTMENTS
            </span>
            <span className="block text-[0.65rem] uppercase tracking-[0.16em] text-navy-500">
              {property.addressLine || property.city} · {property.country}
            </span>
          </div>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">
          {navLinks.map((item) => {
            const active =
              item.href === '/'
                ? activePath === '/'
                : activePath.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active ? 'true' : 'false'}
                className={`underline-sweep text-[0.86rem] font-medium transition-colors duration-200 ${
                  active ? 'font-semibold text-navy-900' : 'text-navy-600 hover:text-navy-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-md border border-sand-300 px-3 py-1.5 text-[0.8rem] font-medium text-navy-700 transition-colors duration-200 hover:border-brand-400 hover:bg-sand-50 sm:inline-flex"
            >
              <MessageCircle size={14} className="text-lemma-dark" />
              WhatsApp
            </a>
          ) : null}

          {session ? (
            <Link
              href={defaultDashboardForRole(session.user.role)}
              className="btn btn-primary py-1.5 text-[0.8rem]"
            >
              <User size={14} />
              {session.user.role === 'guest' ? 'My Account' : 'Workspace'}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-md px-3 py-1.5 text-[0.82rem] font-medium text-navy-700 transition-colors hover:bg-sand-100 sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/apartments"
                className="btn btn-primary shine hidden py-1.5 text-[0.8rem] transition-transform duration-300 ease-smooth hover:-translate-y-0.5 sm:inline-flex"
              >
                Book a Stay
              </Link>
            </>
          )}

          {session && unreadCount > 0 ? (
            <Link
              href={session.user.role === 'guest' ? '/account#notifications' : '/admin/notifications'}
              className="relative grid h-9 w-9 place-items-center rounded-md border border-sand-300 text-navy-700 transition-colors hover:bg-sand-100"
              aria-label={`Notifications, ${unreadCount} unread`}
            >
              <Bell size={15} />
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-lemma-dark px-1 text-[0.6rem] font-semibold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </Link>
          ) : null}

          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-md border border-sand-300 px-2.5 text-navy-700 transition-colors hover:bg-sand-100"
          >
            <Menu size={16} />
            <span className="hidden text-[0.8rem] font-medium sm:inline">Menu</span>
          </button>
        </div>
      </div>

      <SiteMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        property={property}
        session={session}
        activePath={activePath}
        unreadCount={unreadCount}
      />
    </header>
  );
}

export function PublicFooter({ property }: { property: Settings['property'] }) {
  const waDigits = property.whatsapp.replace(/[^0-9]/g, '');
  return (
    <footer className="border-t border-sand-200 bg-navy-900 text-navy-200">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.jpg"
              alt={property.name}
              className="h-10 w-10 rounded-md object-cover ring-1 ring-white/20"
            />
            <div>
              <p className="text-[0.95rem] font-bold tracking-[0.14em] text-white">
                LEMMA APARTMENTS
              </p>
              <p className="text-[0.68rem] uppercase tracking-[0.18em] text-navy-300">
                {property.city}, {property.country}
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-md text-[0.86rem] leading-relaxed text-navy-300">
            {property.tagline ||
              'Furnished apartments at Barlaston Park, Lusaka. Booked night by night in Zambian Kwacha, with housekeeping, secure parking and someone on the phone when you need them.'}
          </p>
        </div>

        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white">
            Navigation
          </p>
          <ul className="mt-3 space-y-2 text-[0.84rem]">
            <li>
              <Link href="/apartments" className="hover:text-white">
                Apartments &amp; ZMW Rates
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-white">
                About the Property
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-white">
                Location &amp; Contact
              </Link>
            </li>
            <li>
              <Link href="/account" className="hover:text-white">
                Guest Portal &amp; Receipts
              </Link>
            </li>
            <li>
              <Link href="/policies" className="hover:text-white">
                Booking Terms &amp; Policies
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-white">
                Staff &amp; Management Login
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white">
            Reception &amp; Location
          </p>
          <ul className="mt-3 space-y-2.5 text-[0.83rem] text-navy-300">
            <li className="flex items-start gap-2">
              <MapPin size={15} className="mt-0.5 shrink-0 text-lemma-light" />
              <span>
                {property.addressLine}
              {property.city ? `, ${property.city}` : ''}
              {property.country ? `, ${property.country}` : ''}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Phone size={15} className="shrink-0 text-lemma-light" />
              <a href={`tel:${property.phone}`} className="hover:text-white">
                {property.phone}
              </a>
            </li>
            {waDigits ? (
              <li className="flex items-center gap-2">
                <MessageCircle size={15} className="shrink-0 text-lemma-light" />
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white"
                >
                  WhatsApp Front Desk
                </a>
              </li>
            ) : null}
            <li className="flex items-center gap-2">
              <Mail size={15} className="shrink-0 text-lemma-light" />
              <a href={`mailto:${property.email}`} className="hover:text-white">
                {property.email}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Clock size={15} className="shrink-0 text-lemma-light" />
              <span>{property.receptionHours}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-[0.76rem] text-navy-400 sm:flex-row sm:px-6 lg:px-8">
          <p className="flex items-center gap-1.5">
            <Building2 size={13} /> {property.legalName || property.name}
            {property.taxPayerId ? ` · TPIN ${property.taxPayerId}` : ''}
          </p>
          <p>All rates quoted in Zambian Kwacha (ZMW).</p>
        </div>
      </div>
    </footer>
  );
}
