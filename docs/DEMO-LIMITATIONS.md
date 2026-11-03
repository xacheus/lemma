# What is real, what is simulated

Written so nobody is surprised in a client meeting. Everything below is also stated inside the product where it matters, not only here.

## Real — implemented and working

| Capability | Where |
| --- | --- |
| Date-range availability engine, per apartment, with overlap refusal | `src/lib/domain/availability.ts`, checked on quote *and* again on save |
| Reservation create / edit / cancel / status changes with audit history | `/api/reservations/**` |
| Folio arithmetic: nights, total, deposit, balance, refunds | `src/lib/domain/selectors.ts` |
| Payment recording, verification, rejection, refunds | `/api/payments/**` |
| Proof-of-payment upload (kept with the record it belongs to) | `ProofUploader` → `payment.proof` |
| Housekeeping queue, assignment, start/complete, maintenance holds | `/api/housekeeping/**` |
| Cleaner's own task list, filtered by assignment | `/portal/cleaning` |
| Guest register with lifetime value, outstanding balances, notes | `/admin/guests/**` |
| Role permissions, enforced server-side on every route and in the payload projection | `src/lib/domain/permissions.ts`, `src/lib/api/snapshot.ts` |
| Sessions: signed cookie, 12-hour expiry, salted password hashes | `src/lib/auth/` |
| Reports with date filters and CSV download | `/admin/reports`, `/api/reports` |
| Printable receipt and folio documents (browser print → Save as PDF) | `/print/receipt/[id]`, `/print/folio/[id]` |
| Validation with zod on every write endpoint | `src/lib/api/schemas.ts` |
| Rate limiting + honeypot on public booking submissions | `src/lib/api/rate-limit.ts` |
| Persistent demo data written to a file, and its reset | `.data/lemma-db.json`, `npm run seed:reset` |

## Simulated — deliberately, and labelled in the UI

| Area | What actually happens | Why it is not faked further |
| --- | --- | --- |
| **Mobile money** (Airtel Money `*181#`, MTN MoMo `*158#`) | Staff key in the amount, method and the transaction reference the guest read out; uploads go into the verification queue. | No merchant API is wired up. There is no callback that could confirm a payment, so the product never claims one. Real integration = provider API + IPN endpoint + reconciliation job. |
| **Bank transfer** | Reception checks its own statement and verifies the receipt by hand. | Same reason. In production this becomes a bank feed/MT940 import. |
| **Cash** | Counted at the desk; auto-banked only when the person entering it already holds `payments.verify` and `requireVerification` is off. | Mirrors an honest till process; a drawer reconciliation screen is the production next step. |
| **WhatsApp / SMS / email** | Drafts are composed in the app, opened in the staff member's own handset via a `wa.me` link, and a person marks them sent. | No Twilio/Meta Business account exists for this demo. Delivery state is `not_connected` for drafts and `delivered_manually` only after a staff claim — the timestamp is labelled as the staff member's word, not a carrier receipt. One seeded record shows a `failed` handset rejection so the state is visible. |
| **Photographs** | Correct frames, ratios and captions, empty until supplied. | Invented property imagery would misrepresent the building. See [PHOTOGRAPHY.md](PHOTOGRAPHY.md). |
| **"Email a copy" / "Notify guest"** | Creates a notification record and shows where it will be delivered. | Same provider constraint; nothing sends silently. |
| **Payment receipt matching** | A human compares the entered reference with the statement. | There is no bank API to match against. Auto-matching is the first production integration. |

## Known limits of the demo build (not bugs to hide)

- **Store** — a JSON file with an atomic write, single-process, fine for one laptop. Production moves to Postgres; every read/write already goes through `getDb()` / `mutate()`.
- **Auth** — demo passwords are `lemma2026` for all accounts, hashes are salted SHA-256 (fast, therefore unsuitable for real credentials), and there is no password change, recovery, CSRF token or MFA. Cookies are `httpOnly` + `sameSite=lax`; add `secure` behind TLS.
- **Public website** — the availability API and the booking endpoint exist and are guarded (zod, honeypot, 8 requests/minute token bucket), and the root route currently sends visitors to the workspace. The eight guest-facing pages (home, apartments, detail, search, booking form, confirmation, contact, about) are the next milestone, not yet in this build.
- **Taxes and invoicing** — `taxesIncluded` is stored and printed as policy copy; no VAT/property-levy line is computed. ZRA fiscalisation is out of scope.
- **Some policy fields are copy, not enforcement** — minimum weekend nights, cancellation window hours, pre-arrival inspection minutes, turnaround minutes, sender name. The settings screen marks each field as *enforced* or as policy text so nothing overstates itself.
- **Multi-property** — one property is modelled; `Settings.property` is a singleton, not a collection.
- **No concurrency control** beyond read-modify-write on the whole document; two people editing the same folio simultaneously is unresolved by design at this stage.
- **Occupancy** on the dashboard is *on the books* for the current month (confirmed room-nights ÷ available room-nights) and is labelled as such; it is not a revenue-per-available-night calculation, and RevPAR is not computed anywhere.
- **No multi-language** — English only; `locale.dateStyle` is fixed at day-month-year.
- **Testing** — `scripts/check-seed.ts` asserts the dataset's internal consistency (24 checks: counts, folio arithmetic, overlap refusal, re-bookability of freed dates, revenue reconciliation). UI tests are not written; the flows were exercised by hand.

## If you want to see a specific gap closed

The seams are: `src/lib/api/*` for provider callbacks, `src/lib/db/store.ts` for a Postgres driver, `src/lib/domain/operations.ts` for extra business rules (auto-verify rules, tax lines), and `src/lib/auth/` for a real session store. Each is one module, not a refactor.
