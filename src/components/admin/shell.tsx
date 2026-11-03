'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BedDouble,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  SprayCan,
  Users,
  X,
} from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/components/providers/app';
import { NAV_SECTIONS } from '@/lib/domain/permissions';
import { formatLongDate } from '@/lib/domain/dates';
import { ROLE_META } from '@/lib/domain/status';
import { ReservationFormDialog } from '@/components/admin/reservation-form';
import type { BookingSource } from '@/lib/domain/types';

/* --------------------------------------------------------------------- shell context */

interface ShellActions {
  openBooking: (prefill?: {
    apartmentId?: string;
    checkIn?: string;
    checkOut?: string;
    guests?: number;
    source?: BookingSource;
    guestId?: string;
  }) => void;
  openLogin: () => void;
}

const ShellCtx = createContext<ShellActions>({ openBooking: () => {}, openLogin: () => {} });
export const useShell = () => useContext(ShellCtx);

const ICONS = {
  '/admin': LayoutDashboard,
  '/admin/reservations': CalendarDays,
  '/admin/calendar': CalendarDays,
  '/admin/apartments': BedDouble,
  '/admin/media': ImageIcon,
  '/admin/guests': Users,
  '/admin/payments': CreditCard,
  '/admin/quotations': FileText,
  '/admin/invoices': Receipt,
  '/admin/housekeeping': SprayCan,
  '/admin/reports': BarChart3,
  '/admin/notifications': Bell,
  '/admin/staff': ShieldCheck,
  '/admin/audit-logs': ClipboardList,
  '/admin/settings': SettingsIcon,
} as const;

const GROUP_LABELS: Record<string, string> = {
  operations: 'Operations',
  property: 'Property',
  commercial: 'Commercial',
  system: 'System',
};

/* ---------------------------------------------------------------------------- shell */

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { snapshot, can, signOut } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [booking, setBooking] = useState<{ open: boolean; prefill?: Record<string, string | number> }>({ open: false });

  useEffect(() => setMobileOpen(false), [pathname]);

  const actions = useMemo<ShellActions>(
    () => ({
      openBooking: (prefill) => setBooking({ open: true, prefill: prefill as Record<string, string | number> | undefined }),
      openLogin: () => router.push('/login'),
    }),
    [router],
  );

  if (!snapshot) return null;
  const unread = snapshot.notifications?.filter((n) => !n.readAt).length ?? 0;

  const nav = (
    <nav aria-label="Sections" className="flex flex-1 flex-col gap-5 overflow-y-auto scroll-slim px-3 py-4">
      {(['operations', 'property', 'commercial', 'system'] as const).map((group) => {
        const items = NAV_SECTIONS.filter((s) => s.group === group && can(s.permission));
        if (!items.length) return null;
        return (
          <div key={group}>
            <p className="px-3 pb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-navy-300">{GROUP_LABELS[group]}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
                const Icon = ICONS[item.href as keyof typeof ICONS] ?? LayoutDashboard;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.84rem] font-medium transition ${
                        active ? 'bg-white/[0.07] text-white' : 'text-navy-200 hover:bg-white/[0.045] hover:text-white'
                      }`}
                    >
                      {active ? <span className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-r bg-gold-400" /> : null}
                      <Icon size={16} className={active ? 'text-gold-300' : 'text-navy-300 group-hover:text-navy-100'} />
                      <span className="truncate">{item.label}</span>
                      {item.href === '/admin/notifications' && unread > 0 ? (
                        <span className="ml-auto rounded-full bg-gold-400 px-1.5 py-px text-[0.62rem] font-bold text-navy-900 tabular-nums">{unread}</span>
                      ) : null}
                      {item.href === '/admin/housekeeping' && (snapshot.metrics?.openMaintenance ?? 0) > 0 ? (
                        <span className="ml-auto grid h-4 w-4 place-items-center rounded-full bg-st-cancelled/90 text-white" title="Open maintenance">
                          <AlertTriangle size={9} />
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const sidebarHeader = (
    <Link href="/admin" className="flex items-center gap-2.5 border-b border-white/10 px-4 py-4">
      <span className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.jpg" alt="Lemma Heights Apartments" className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/15" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[0.9rem] leading-none tracking-[0.14em] text-white">LEMMA HEIGHTS</span>
        <span className="mt-1 block truncate text-[0.62rem] uppercase tracking-[0.16em] text-navy-300">Property management</span>
      </span>
    </Link>
  );

  return (
    <ShellCtx.Provider value={actions}>
      <div className="app-shell min-h-screen bg-sand-50 lg:grid lg:grid-cols-[15.5rem_1fr]">
        {/* desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen flex-col bg-navy-900 lg:flex">
          {sidebarHeader}
          {nav}
          <SidebarFooter signOut={signOut} />
        </aside>

        {/* mobile sidebar */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-[60] flex lg:hidden no-print">
            <button className="absolute inset-0 bg-navy-950/50" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
            <aside className="relative flex h-full w-[17rem] flex-col bg-navy-900 shadow-pop">
              <div className="flex items-center justify-between">
                {sidebarHeader}
                <button onClick={() => setMobileOpen(false)} className="mr-3 rounded-lg p-2 text-navy-200 hover:bg-white/10" aria-label="Close navigation">
                  <X size={17} />
                </button>
              </div>
              {nav}
              <SidebarFooter signOut={signOut} />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col">
          <Topbar onMenu={() => setMobileOpen(true)} onNewBooking={() => actions.openBooking()} />
          <main className="px-4 py-5 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>

      <ReservationFormDialog open={booking.open} prefill={booking.prefill} onClose={() => setBooking({ open: false })} />
    </ShellCtx.Provider>
  );
}

function SidebarFooter({ signOut }: { signOut: () => Promise<void> }) {
  return (
    <div className="space-y-2 border-t border-white/10 px-3 py-3">
      <Link
        href="/"
        target="_blank"
        className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[0.78rem] font-medium text-navy-200 hover:bg-white/[0.05] hover:text-white"
      >
        View public booking site
        <ArrowRight size={13} className="text-navy-400" />
      </Link>
      <button
        onClick={() => void signOut()}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[0.78rem] font-medium text-navy-200 hover:bg-white/[0.05] hover:text-white"
      >
        <LogOut size={14} className="text-navy-400" /> Sign out
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------------- topbar */

function Topbar({ onMenu, onNewBooking }: { onMenu: () => void; onNewBooking: () => void }) {
  const { snapshot, signOut } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (shellRef.current && !shellRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
        setBellOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !snapshot) return null;
    const reservations = (snapshot.reservations ?? [])
      .filter(
        (r) =>
          r.reference.toLowerCase().includes(q) ||
          (r.guest?.fullName ?? '').toLowerCase().includes(q) ||
          (r.guest?.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
          `apt ${r.apartment?.number}`.includes(q) ||
          (r.apartment?.name ?? '').toLowerCase().includes(q),
      )
      .slice(0, 5);
    const guests = (snapshot.guests ?? [])
      .filter((g) => g.fullName.toLowerCase().includes(q) || g.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) || g.email.toLowerCase().includes(q))
      .slice(0, 4);
    const apartments = snapshot.apartments.filter(
      (a) => a.name.toLowerCase().includes(q) || `apartment ${a.number}`.includes(q) || a.code.toLowerCase().includes(q),
    ).slice(0, 3);
    return { reservations, guests, apartments, total: reservations.length + guests.length + apartments.length };
  }, [query, snapshot]);

  const notifications = snapshot?.notifications ?? [];
  const unread = notifications.filter((n) => !n.readAt);
  const user = snapshot?.user;

  return (
    <div ref={shellRef} className="sticky top-0 z-40 border-b border-sand-200 bg-white/92 backdrop-blur print:hidden">
      <header className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <button onClick={onMenu} className="btn-ghost h-9 w-9 rounded-lg p-0 lg:hidden" aria-label="Open navigation">
          <Menu size={18} />
        </button>

        <div className="hidden min-w-0 flex-col md:flex">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-navy-400">Today</span>
          <span className="truncate text-[0.84rem] font-medium text-navy-700">{snapshot ? formatLongDate(snapshot.today) : ''}</span>
        </div>

        <div className="relative ml-auto w-full max-w-[22rem]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reservations, guests, apartments"
            aria-label="Search the property system"
            className="field h-9 pl-9 pr-14 text-[0.84rem]"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-sand-300 bg-sand-100 px-1.5 py-0.5 text-[0.62rem] font-semibold text-navy-400 sm:block">
            ⌘K
          </kbd>
          {results ? (
            <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-pop">
              {results.total === 0 ? (
                <p className="px-4 py-6 text-center text-[0.82rem] text-navy-400">
                  Nothing matches “{query}”. Try a reference like LHA-2026 or a phone number.
                </p>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto scroll-slim py-1.5">
                  <ResultGroup label="Reservations">
                    {results.reservations.map((r) => (
                      <ResultRow
                        key={r.id}
                        onClick={() => {
                          setQuery('');
                          router.push(`/admin/reservations/${r.id}`);
                        }}
                        title={r.guest?.fullName ?? r.reference}
                        meta={`${r.reference} · Apt ${r.apartment?.number} ${r.apartment?.name ?? ''} · ${r.checkIn} → ${r.checkOut}`}
                        status={r.status}
                      />
                    ))}
                  </ResultGroup>
                  <ResultGroup label="Guests">
                    {results.guests.map((g) => (
                      <ResultRow
                        key={g.id}
                        onClick={() => {
                          setQuery('');
                          router.push(`/admin/guests/${g.id}`);
                        }}
                        title={g.fullName}
                        meta={`${g.phone}${g.company ? ` · ${g.company}` : ''}`}
                      />
                    ))}
                  </ResultGroup>
                  <ResultGroup label="Apartments">
                    {results.apartments.map((a) => (
                      <ResultRow
                        key={a.id}
                        onClick={() => {
                          setQuery('');
                          router.push(`/admin/apartments/${a.id}`);
                        }}
                        title={`Apt ${a.number} — ${a.name}`}
                        meta={`${a.code} · K${a.nightlyRate.toLocaleString('en-US')} per night · sleeps ${a.maxGuests}`}
                      />
                    ))}
                  </ResultGroup>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            onClick={() => {
              setBellOpen((v) => !v);
              setProfileOpen(false);
            }}
            className="btn-ghost relative h-9 w-9 rounded-lg p-0"
            aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`}
          >
            <Bell size={17} />
            {unread.length ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gold-400 ring-2 ring-white" /> : null}
          </button>
          {bellOpen ? (
            <div className="absolute right-0 top-11 z-50 w-[22rem] overflow-hidden rounded-xl border border-sand-200 bg-white shadow-pop">
              <div className="flex items-center justify-between border-b border-sand-200 px-3.5 py-2.5">
                <p className="text-[0.82rem] font-semibold text-navy-800">Notifications</p>
                <Link href="/admin/notifications" onClick={() => setBellOpen(false)} className="text-[0.74rem] font-semibold text-teal-600 hover:underline">
                  Open inbox
                </Link>
              </div>
              <ul className="max-h-[24rem] divide-y divide-sand-100 overflow-y-auto scroll-slim">
                {(unread.length ? unread : notifications).slice(0, 6).map((n) => (
                  <li key={n.id}>
                    <Link href={`/admin/notifications?focus=${n.id}`} onClick={() => setBellOpen(false)} className="block px-3.5 py-2.5 hover:bg-sand-50">
                      <p className="text-[0.8rem] font-semibold text-navy-800">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[0.74rem] leading-snug text-navy-500">{n.body}</p>
                      <p className="mt-1 text-[0.68rem] uppercase tracking-wide text-navy-400">
                        {n.channel.replace(/_/g, ' ')} · {n.deliveryStatus.replace(/_/g, ' ')}
                      </p>
                    </Link>
                  </li>
                ))}
                {!notifications.length ? <li className="px-3.5 py-6 text-center text-[0.78rem] text-navy-400">No notifications yet.</li> : null}
              </ul>
            </div>
          ) : null}
        </div>

        <button onClick={onNewBooking} className="btn-gold h-9 shrink-0 px-3 text-[0.8rem]">
          <Plus size={15} />
          <span className="hidden sm:inline">New booking</span>
        </button>

        <div className="relative">
          <button
            onClick={() => {
              setProfileOpen((v) => !v);
              setBellOpen(false);
            }}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 hover:bg-sand-100"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-800 text-[0.72rem] font-semibold text-white">
              {user?.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
            </span>
            <span className="hidden min-w-0 text-left xl:block">
              <span className="block truncate text-[0.78rem] font-semibold leading-none text-navy-800">{user?.name}</span>
              <span className="mt-0.5 block truncate text-[0.68rem] leading-none text-navy-400">{user?.jobTitle}</span>
            </span>
            <ChevronDown size={14} className="hidden text-navy-400 xl:block" />
          </button>
          {profileOpen ? (
            <div className="absolute right-0 top-12 z-50 w-[16rem] overflow-hidden rounded-xl border border-sand-200 bg-white shadow-pop" role="menu">
              <div className="border-b border-sand-200 bg-sand-50/70 px-3.5 py-3">
                <p className="text-[0.84rem] font-semibold text-navy-800">{user?.name}</p>
                <p className="mt-0.5 text-[0.74rem] text-navy-500">{user?.email}</p>
                <span className={`chip mt-2 ${ROLE_META[user?.role ?? 'receptionist'].chip}`}>{ROLE_META[user?.role ?? 'receptionist'].label}</span>
              </div>
              <div className="px-1.5 py-1.5">
                <MenuItem href="/admin/settings" label="Property settings" icon={<SettingsIcon size={14} />} show={!!user && user.role === 'admin'} />
                <MenuItem href="/admin/staff" label="Staff & permissions" icon={<ShieldCheck size={14} />} show={!!user && user.role === 'admin'} />
                <MenuItem href="/portal/cleaning" label="Cleaner portal (mobile view)" icon={<SprayCan size={14} />} show />
                <MenuItem href="/" label="Open public site" icon={<ArrowRight size={14} />} show external />
                <MenuItem href="/login" label="Switch account" icon={<Users size={14} />} show />
              </div>
              <div className="border-t border-sand-200 p-1.5">
                <button onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8rem] font-medium text-st-cancelled hover:bg-st-cancelledBg">
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>
    </div>
  );
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(rows) && rows.length === 0) return null;
  return (
    <div className="py-1">
      <p className="px-3.5 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-navy-400">{label}</p>
      {children}
    </div>
  );
}

function ResultRow({ title, meta, onClick, status }: { title: string; meta: string; onClick: () => void; status?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-sand-50">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.82rem] font-semibold text-navy-800">{title}</span>
        <span className="block truncate text-[0.72rem] text-navy-400">{meta}</span>
      </span>
      {status ? <span className="chip shrink-0 bg-sand-100 text-navy-500">{status.replace(/_/g, ' ')}</span> : null}
    </button>
  );
}

function MenuItem({ href, label, icon, show, external }: { href: string; label: string; icon: React.ReactNode; show: boolean; external?: boolean }) {
  if (!show) return null;
  return (
    <Link
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8rem] font-medium text-navy-600 hover:bg-sand-100 hover:text-navy-900"
    >
      <span className="text-navy-400">{icon}</span>
      {label}
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-[0.72rem] text-navy-400">
            {crumbs.map((c, i) => (
              <span key={c.label} className="flex items-center gap-1.5">
                {i > 0 ? <span aria-hidden>/</span> : null}
                {c.href ? (
                  <Link href={c.href} className="hover:text-navy-700 hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-navy-500">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="font-display text-[1.35rem] leading-tight text-navy-800">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-[0.82rem] leading-relaxed text-navy-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
