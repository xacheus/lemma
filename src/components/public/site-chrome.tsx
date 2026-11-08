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
import { brandMonogram } from './brand-mark';
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
    { href: '/policies', label: 'Booking Info' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ];

  useEffect(() => {
    setMenuOpen(false);
  }, [activePath]);

  const brandTitle = property.name || 'Lemma Apartments';
  const subline = [property.addressLine || property.city, property.city && property.addressLine ? property.city : property.country]
    .filter(Boolean)
    .join(', ');

  const monogram = brandMonogram(brandTitle);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-swdl-navy shadow-swdl-nav">
      <div
        className={`relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-all duration-300 ease-smooth sm:px-6 lg:px-8 ${
          scrolled ? 'py-2.5' : 'py-3.5'
        }`}
      >
        <Link href="/" className="group flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-swdl-gold to-swdl-goldDark font-heading text-[0.8rem] font-extrabold tracking-[0.06em] text-swdl-navy shadow-[0_4px_14px_rgba(201,161,90,0.28)] transition-transform duration-300 ease-smooth group-hover:-translate-y-0.5">
            {monogram}
          </span>
          <div className="min-w-0">
            <span className="block truncate font-heading text-[1.15rem] font-extrabold uppercase tracking-[0.15em] text-white">
              {brandTitle}
            </span>
            <span className="block truncate font-heading text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-swdl-gold">
              {subline || 'Lusaka, Zambia'}
            </span>
          </div>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-1.5 md:flex">
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
                className={`rounded-lg px-3.5 py-2 font-heading text-[0.85rem] font-semibold transition-all duration-200 ease-smooth ${
                  active
                    ? 'bg-swdl-gold text-swdl-navy'
                    : 'text-[#D7DEE6] hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 font-heading text-[0.78rem] font-semibold text-white transition-all duration-200 ease-smooth hover:border-swdl-gold hover:bg-swdl-gold hover:text-swdl-navy lg:inline-flex"
            >
              <MessageCircle size={14} />
              WhatsApp
            </a>
          ) : null}

          {session ? (
            <Link
              href={defaultDashboardForRole(session.user.role)}
              className="btn btn-gold py-1.5 text-[0.8rem]"
            >
              <User size={14} />
              {session.user.role === 'guest' ? 'My Account' : 'Workspace'}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-lg px-3 py-1.5 font-heading text-[0.82rem] font-semibold text-[#D7DEE6] transition-colors duration-200 hover:bg-white/10 hover:text-white sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/apartments"
                className="btn btn-gold hidden py-1.5 text-[0.8rem] sm:inline-flex"
              >
                Check Dates
              </Link>
            </>
          )}

          {session && unreadCount > 0 ? (
            <Link
              href={session.user.role === 'guest' ? '/account#notifications' : '/admin/notifications'}
              className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/20 bg-white/10 text-white transition-colors duration-200 hover:bg-white/20"
              aria-label={`Notifications, ${unreadCount} unread`}
            >
              <Bell size={15} />
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-swdl-gold px-1 text-[0.6rem] font-bold text-swdl-navy">
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
            className={`flex h-9 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 font-heading text-white transition-colors duration-200 hover:bg-white/20 ${
              session ? '' : 'md:hidden'
            }`}
          >
            <Menu size={16} />
            <span className="hidden text-[0.8rem] font-semibold sm:inline">Menu</span>
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
  const brandTitle = property.name || 'Lemma Apartments';

  return (
    <footer className="border-t border-white/10 bg-swdl-navyDeep text-[#B9C5D1]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-14 sm:px-6 md:grid-cols-12 lg:px-8">
        <div className="md:col-span-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-swdl-gold to-swdl-goldDark font-heading text-[0.8rem] font-extrabold tracking-[0.06em] text-swdl-navy">
              {brandMonogram(brandTitle)}
            </span>
            <div>
              <p className="font-heading text-[1.15rem] font-extrabold uppercase tracking-[0.15em] text-white">
                {brandTitle}
              </p>
              <p className="font-heading text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-swdl-gold">
                {property.addressLine ? `${property.addressLine}, ` : ''}
                {property.city}, {property.country}
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-[0.88rem] leading-relaxed text-[#B9C5D1]">
            {property.tagline ||
              `Self-catering furnished apartments in ${property.city}, priced per night in Zambian Kwacha with direct front-desk support.`}
          </p>
        </div>

        <div className="md:col-span-3">
          <p className="font-heading text-[0.8rem] font-bold uppercase tracking-[0.1em] text-white">
            For Guests
          </p>
          <ul className="mt-4 space-y-2.5 text-[0.86rem] text-[#B9C5D1]">
            <li>
              <Link href="/apartments" className="transition-colors duration-200 hover:text-swdl-gold">
                Apartments &amp; ZMW Rates
              </Link>
            </li>
            <li>
              <Link href="/booking/access" className="transition-colors duration-200 hover:text-swdl-gold">
                Find a Booking by Reference
              </Link>
            </li>
            <li>
              <Link href="/account" className="transition-colors duration-200 hover:text-swdl-gold">
                Guest Account &amp; Receipts
              </Link>
            </li>
            <li>
              <Link href="/policies" className="transition-colors duration-200 hover:text-swdl-gold">
                Deposit, Cancellation &amp; House Rules
              </Link>
            </li>
            <li>
              <Link href="/about" className="transition-colors duration-200 hover:text-swdl-gold">
                About the Property
              </Link>
            </li>
            <li>
              <Link href="/contact" className="transition-colors duration-200 hover:text-swdl-gold">
                Location &amp; Contact
              </Link>
            </li>
          </ul>
        </div>

        <div className="md:col-span-4">
          <p className="font-heading text-[0.8rem] font-bold uppercase tracking-[0.1em] text-white">
            Front Desk &amp; Location
          </p>
          <ul className="mt-4 space-y-2.5 text-[0.86rem] text-[#B9C5D1]">
            <li className="flex items-start gap-2.5">
              <MapPin size={15} className="mt-0.5 shrink-0 text-swdl-gold" />
              <span>
                {property.addressLine}
                {property.city ? `, ${property.city}` : ''}
                {property.country ? `, ${property.country}` : ''}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <Phone size={15} className="shrink-0 text-swdl-gold" />
              <a href={`tel:${property.phone.replace(/\s/g, '')}`} className="transition-colors duration-200 hover:text-swdl-gold">
                {property.phone}
              </a>
            </li>
            {waDigits ? (
              <li className="flex items-center gap-2.5">
                <MessageCircle size={15} className="shrink-0 text-swdl-gold" />
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors duration-200 hover:text-swdl-gold"
                >
                  WhatsApp Reception ({property.whatsapp})
                </a>
              </li>
            ) : null}
            <li className="flex items-center gap-2.5">
              <Mail size={15} className="shrink-0 text-swdl-gold" />
              <a href={`mailto:${property.email}`} className="transition-colors duration-200 hover:text-swdl-gold">
                {property.email}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <Clock size={15} className="mt-0.5 shrink-0 text-swdl-gold" />
              <span>{property.receptionHours}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-[0.82rem] text-[#8FA0B0] sm:flex-row sm:px-6 lg:px-8">
          <p className="flex items-center gap-1.5">
            <Building2 size={13} className="text-swdl-gold" />{' '}
            <strong className="font-semibold text-swdl-gold">{property.legalName || property.name}</strong>
            {property.taxPayerId ? ` · TPIN ${property.taxPayerId}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span>Rates quoted in Zambian Kwacha (ZMW)</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <Link href="/login" className="hover:text-swdl-gold">
              Staff sign-in
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
