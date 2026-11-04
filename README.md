# Lemma Apartments

Apartment booking and property administration for Lemma Apartments in Lusaka:
public availability enquiries, a guest account, reservations, payment claims,
receipts, housekeeping and staff operations in one application.

## What a new install contains

- **Zero fake data by default:** Both local development and a new Cloud Firestore
  project start with **zero pre-seeded apartments, zero stock photographs, and zero
  placeholder bookings**. Until an administrator publishes real apartments under
  `/admin/apartments`, the public website displays clean Barlaston Park direct-contact
  and enquiry cards rather than fabricated listings.
- **Hospitality-first UI:** Public, guest, and staff interfaces never expose backend
  storage mechanics, environment variable names, or third-party infrastructure providers.

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

### Responsive browser regression

With the disposable fixture prepared as above, set a stable local session secret
(e.g. `LEMMA_SESSION_SECRET=local-test-secret`) when starting the development
server. Install Chromium/Chrome separately, then run:

```bash
CHROMIUM_PATH=/path/to/chromium npm run test:responsive
```

The test signs in as the local fixture administrator, checks the major routes at
320–1440px, and exercises the mobile calendar, navigation and booking dialog.
It checks document width as well as visible elements extending beyond the viewport;
it does not replace visual checks of zoom, text size or real-device interactions.

To test Settings' network-failure handling and manual recovery against the same
fixture and Chromium installation, run:

```bash
CHROMIUM_PATH=/path/to/chromium npm run test:settings-network
```
