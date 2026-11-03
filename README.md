# Lemma Heights Apartments — Booking & Property Management

A working apartment-booking system for **Lemma Heights Apartments** (Plot 2144, Chainama Lands, Great East Road, Lusaka, Zambia): a public-facing booking flow on the same register as a full back office — reservations, a booking calendar, the apartment catalogue, guest records, Kwacha payments with a verification step, a housekeeping board with its own cleaner app, notifications, reports, staff permissions and settings.

This is a **functional demo, not a mock-up**. Bookings, payments, cancellations, check-ins, cleaning jobs and reminders all write to a real database, the availability engine refuses double-bookings, and every figure on the dashboard is derived from the records rather than typed into the page. What is *not* real — mobile-money APIs, SMS/WhatsApp gateways, SMTP, card payments — is labelled as such throughout the product and listed in [docs/DEMO-LIMITATIONS.md](docs/DEMO-LIMITATIONS.md).

## Running it

```bash
npm install
npm run dev          # http://localhost:3000  (binds 0.0.0.0)
```

The demo database is generated on first use and stored at `.data/lemma-db.json`.

| Command | What it does |
| --- | --- |
| `npm run seed:reset` | Rebuild the demo dataset from the generator (discards local edits) |
| `npx tsx scripts/check-seed.ts` | Assert the dataset's internal consistency — 24 checks on occupancy, folios, overlaps, money |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run build && npm start` | Production build |

## Signing in

All demo accounts share the password `lemma2026`.

| Handle | Person | Role | Sees |
| --- | --- | --- | --- |
| `alice` | Alice Chanda | Admin / owner | Everything, including verification, staff and settings |
| `joseph` | Joseph Mwansa | Receptionist | Bookings, guests, payments, calendar — no staff management, no verification |
| `ruth` | Ruth Tembo | Receptionist | As above |
| `mary` | Mary Gondwe | Cleaner | Only the housekeeping assigned to her, on a phone-first screen (`/portal/cleaning`) |
| `peter`, `linda` | Peter Phiri, Linda Banda | Cleaner | As above |

A cleaner who tries to open `/admin` is redirected to their own task list. Financial figures and guest identity documents never enter a cleaner's payload — the projection happens server-side in `src/lib/api/snapshot.ts`, so the data is absent from the response, not hidden with CSS.

## What the demo data contains

Business date **today**, recalculated whenever the store is rebuilt (dates shift with the calendar so the demo never goes stale):

- **12 apartments** — Standard, Deluxe ×2, Executive ×3, Family ×4, Premium ×1, Studio ×1 and a Penthouse, each with rate, capacity, amenities, house notes and photo slots
- **18 guests**, **231 reservations** and **222 payment records** across Airtel Money, MTN Mobile Money, bank transfer and cash
- Tonight: **8 occupied, 3 available, 1 needing cleaning**, **3 arrivals**, **2 departures**, **K48,500** banked this month, **70%** occupancy (252 of 360 available room-nights)
- The worked example from the brief, exactly as specified: **John Banda, Apt 2 Deluxe Suite, 3 nights × K1,200 = K3,600, K1,800 deposit verified by Airtel Money, K1,800 outstanding**

## How the pieces fit

```
src/lib/domain/      pure business rules — availability, folios, permissions, status metadata
src/lib/db/          deterministic seed generator + JSON store (getDb / mutate / resetDemoData)
src/lib/api/         HTTP route wrappers, zod schemas, role projection into a snapshot
src/lib/auth/        salted password hashes, HMAC session cookie
src/app/api/**       22 route handlers; every mutation re-runs the availability check
src/app/admin/**     the eleven back-office screens
src/app/portal/**    the cleaner's own view
src/app/print/**     receipt + folio documents (print / Save as PDF)
src/components/ui    design-system primitives used by every screen
```

Reads go through one snapshot object built per request, so a screen cannot show a number the engine disagrees with. Writes go through `mutate()`, which re-derives the affected folios before the response is sent.

### Two rules that shape the whole product

1. **A confirmed booking holds the night; nothing else does.** `reserved`, `fully_paid`, `checked_in` and `checked_out` occupy inventory per apartment. `inquiry` and `cancelled` do not — an enquiry can be quoted and re-quoted without freezing stock, and a cancelled stay frees its dates for resale immediately.
2. **Money is only money when a person signs for it.** Recording a receipt with proof attached leaves the guest's balance untouched and files it in the verification queue. Only `payments.verify` staff can move a folio, and the confirmation carries their name and timestamp.

## Design notes

- Type and layout: system UI stack (no external font request — the demo runs offline), navy chrome, warm sand surfaces, gold/teal accents, tabular figures for money.
- Icons are [Lucide](https://lucide.dev). No emoji, no decorative animation.
- **Photographs are placeholders by design.** The image slots, aspect ratios and file conventions are wired up; the actual shots are supplied separately — see [docs/PHOTOGRAPHY.md](docs/PHOTOGRAPHY.md).
- Currency renders as `K1,200` / `K48,500` (whole Kwacha, no decimals) everywhere, including printed receipts.

## Documentation

- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — entities, relations and the invariants the code enforces
- [docs/DEMO-LIMITATIONS.md](docs/DEMO-LIMITATIONS.md) — what is simulated, what is real, and what a production build must change
- [docs/PHOTOGRAPHY.md](docs/PHOTOGRAPHY.md) — naming, sizes and how to attach images to a unit

## Build status

Shipped on this branch: the eleven back-office screens, the cleaner's phone app, the printed receipt and folio, the role-projected API and the seeded demo database. `npm run build`, `npm run lint` and `npx tsx scripts/check-seed.ts` all pass.

Next milestone: the public booking site (`/`, `/apartments`, `/search`, `/book`, `/booking/[reference]`, `/contact`, `/about`). The availability and booking-request endpoints it needs (`/api/public/availability`, `/api/public/reservations`, with rate limiting and a honeypot) are already live and are the same ones the admin register writes through, so a website request lands as an `inquiry` on the identical calendar. Until those pages ship, `/` sends visitors to the sign-in screen — see the comment in `src/app/page.tsx`.

Built by Seedwel for Lemma Heights Apartments.
