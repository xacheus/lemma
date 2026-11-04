# Lemma Apartments

Apartment booking and property administration for Lemma Apartments in Lusaka:
public availability enquiries, a guest account, reservations, payment claims,
receipts, housekeeping and staff operations in one application.

## What a new install contains

- **Local development** includes three editable **example listings**, each with six
  licensed Pexels stock photographs. They remain public as requested, but the site
  labels the listings and photographs as representative. They are not verified
  property inventory, and guests are asked to confirm the unit and final price
  with reception. Example enquiries do **not** display payment instructions until
  staff confirm the stay. See [photography provenance](docs/PHOTOGRAPHY.md).
- **A new Firestore project** starts with no apartments, accounts or bookings. Existing
  Firestore documents, including earlier example units, remain in place and their
  untouched example galleries gain the additional photographs. Staff should create
  and verify real inventory as it becomes available.

## Run locally

```bash
npm ci
npm run dev               # binds 0.0.0.0:3000
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

Local data and locally uploaded media are saved under ignored `.data/`. Do not put a
real property's records there for a production deployment. To exercise HTTP booking
and staff flows against a **disposable local dataset**, use:

```bash
export LEMMA_DATA_DIR="$PWD/.data/e2e"
npx tsx scripts/prepare-e2e.ts
npm run dev
# in a separate terminal with the same LEMMA_DATA_DIR:
npm run test:e2e
```

The fixture uses test credentials and must never be deployed. The E2E script creates
accounts, bookings and payments. Delete only that disposable `.data/e2e` directory
when finished (never a real property database).

## Production setup

Read [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before going live. Production requires
Firebase Admin/Firestore credentials and a stable session secret; it deliberately
fails rather than writing bookings to a serverless temporary disk. Signed Cloudinary
credentials are required to upload new photos in production. No credentials are
included in this repository or the example environment file.

The first administrator is appointed in the Firebase Console: register or sign in
once as a normal user, then change that user's `users/{uid}.role` to `admin` or
`super_admin`. There is no public bootstrap endpoint. Staff can then manage
apartments, guest records, prices, photographs, and policy settings. Direct
Firestore browser reads are governed by `firestore.rules`; the server enforces its
own permission checks independently.

Bookings and payment claims are different from paid reservations: an enquiry does
not hold a date until confirmed, and a reported payment does not affect the balance
until staff verify it. Guests cannot access earlier visitor bookings just by
registering with the same email; email ownership must be verified first. Outbound
SMS, WhatsApp, bank reconciliation and email require separate providers.

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for what remains manual and what
requires verification against a live Firebase project.
