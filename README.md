# Lemma Heights Apartments — Booking & Property Management

A working apartment-booking system for **Lemma Heights Apartments** (Plot 2144, Chainama Lands, Great East Road, Lusaka, Zambia): a public booking site on the same register as a full back office — reservations, a booking calendar, the apartment catalogue, guest records, Kwacha payments with a verification step, a housekeeping board with its own cleaner app, notifications, reports, staff permissions and settings.

**There is no sample data in this build.** A fresh install is an empty property: no apartments, no guests, no reservations, no payments, no staff logins. The store is never seeded, and no button regenerates records — every figure on every screen comes from something a person entered or a guest booked. (Earlier builds of this repo shipped a generated demo dataset; it has been removed, and any file written by that build is discarded on first read rather than migrated.)

What *is* simulated — mobile-money APIs, SMS/WhatsApp gateways, SMTP — is labelled as such throughout the product and listed in [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Running it

```bash
npm install
npm run dev          # http://localhost:3000  (binds 0.0.0.0)
```

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run build && npm start` | Production build |

## Getting started: your own account

The property starts with no users at all, including no administrator.

1. Set `FIRST_ADMIN_SETUP_TOKEN` (and `LEMMA_SESSION_SECRET`) in the environment — see `.env.example`.
2. Open `/setup-admin`, enter the token, your name, email and a password. This is the only public bootstrap route, it works exactly once, and it locks permanently as soon as one active Super Administrator exists.
3. Sign in at `/login` with that email and password. Additional admins, receptionists and cleaners are created in **Admin → Staff & Users**, each with its own password.

Then, in this order: add the apartments (**Admin → Apartments**), confirm the phone, WhatsApp, check-in times and deposit rules (**Admin → Settings**), and publish the units you want the website to sell.

## First-run checklist

| Step | Screen | Why it matters |
| --- | --- | --- |
| Add apartments | `/admin/apartments` | The booking engine sells only what is in this list. Rate, capacity and photos are read by the public pages. |
| Create staff accounts | `/admin/staff` | Receptionists can take bookings; cleaners see only their own turnover list. Each account needs a password. |
| Confirm property details | `/admin/settings` | Phone, WhatsApp, address and check-in times are printed on the public site and on receipts. |
| Add photography | `/admin/media`, or edit a unit's photo paths | No stock or invented imagery ships in this repo — empty frames read as "photograph to be supplied". See [docs/PHOTOGRAPHY.md](docs/PHOTOGRAPHY.md). |
| Set payment policy | `/admin/settings` | Deposit percentage and whether a receipt needs a second person to verify it. |

## How it behaves with an empty property

- `/` and `/apartments` show a contact card (phone, WhatsApp, front desk) instead of a catalogue until at least one apartment is published.
- `/admin` shows a three-step setup panel: apartments, staff accounts, property details.
- Counts, charts and revenue read `0` / `K0` because they are computed from records, not placeholders.

## How the pieces fit

```
src/lib/domain/      pure business rules — availability, folios, permissions, status metadata
src/lib/db/          empty-by-default JSON store (getDb / mutate) + dashboard aggregation
src/lib/api/         HTTP route wrappers, zod schemas, role projection into a snapshot
src/lib/auth/        scrypt password hashes, HMAC session cookie
src/app/api/**       route handlers; every mutation re-runs the availability check
src/app/admin/**     the eleven back-office screens
src/app/portal/**    the cleaner's own view
src/app/print/**     receipt + folio documents (print / Save as PDF)
src/components/ui    design-system primitives used by every screen
```

Reads go through one snapshot object built per request, so a screen cannot show a number the engine disagrees with. Writes go through `mutate()`, which re-derives the affected folios before the response is sent.

### Two rules that shape the whole product

1. **A confirmed booking holds the night; nothing else does.** `reserved`, `fully_paid`, `checked_in` and `checked_out` occupy inventory per apartment. `inquiry` and `cancelled` do not — an enquiry can be quoted and re-quoted without freezing stock, and a cancelled stay frees its dates for resale immediately.
2. **Money is only money when a person signs for it.** Recording a receipt with proof attached leaves the guest's balance untouched and files it in the verification queue. Only `payments.verify` staff can move a folio, and the confirmation carries their name and timestamp.

## Storage

Records are written to Cloud Firestore when `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` are set; otherwise to `.data/lemma-db.json` (or `LEMMA_DATA_DIR`). Both paths use the same `getDb()` / `mutate()` API, so moving to Postgres later is one module, not a refactor. There is no reset command: deleting the file is deleting the property's records, so treat it like a database.

## Design notes

- Type and layout: system UI stack, navy chrome, warm sand surfaces, gold/teal accents, tabular figures for money.
- Icons are [Lucide](https://lucide.dev). No emoji, no decorative animation.
- **Photographs are placeholders by design.** The image slots, aspect ratios and file conventions are wired up; the actual shots are supplied separately — see [docs/PHOTOGRAPHY.md](docs/PHOTOGRAPHY.md).
- Currency renders as `K1,200` / `K48,500` (whole Kwacha, no decimals) everywhere, including printed receipts.

## Documentation

- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — entities, relations and the invariants the code enforces
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — what is simulated, what is real, and what a production build must change
- [docs/PHOTOGRAPHY.md](docs/PHOTOGRAPHY.md) — naming, sizes and how to attach images to a unit

Built by Seedwel for Lemma Heights Apartments.
