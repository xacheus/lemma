# Deploying Lemma Apartments

This repository cannot configure a Firebase or Vercel project on its own. Set the
secrets in **Vercel → Project → Settings → Environment Variables**, for the intended
Production and Preview environments, then redeploy. Do not paste secrets into source,
issues, logs, or chat. A fresh Firestore project contains **no example listings**;
existing Firestore apartment documents remain in place.

## 1. Required for a production deployment

| Variable | Purpose |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase project containing the Firestore database. |
| `FIREBASE_CLIENT_EMAIL` | Service-account `client_email` for the same project. |
| `FIREBASE_PRIVATE_KEY` | Service-account `private_key` (PEM, actual newlines or escaped `\n`). |
| `LEMMA_SESSION_SECRET` | One stable, random value of at least 32 characters for all server instances. Generate with `openssl rand -hex 32`. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name for signed apartment uploads. |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Server-only Cloudinary key pair. |
| `CLOUDINARY_UPLOAD_PRESET` | Signed upload preset; defaults to `lemma_uploads`. |
| `NEXT_PUBLIC_SITE_URL` | Preferred site origin for canonical links and email links. |

The first four connect durable, cross-instance persistence and stable sessions.
When Firebase Admin is not yet configured (or if Cloud Firestore has not been enabled
yet), the site remains live and serves the labelled starter catalogue using a fallback
store (`.data/` locally or `os.tmpdir()` on serverless platforms) with a bounded 4s
timeout and 30s cooldown. Because serverless temporary storage resets on cold starts,
configure Cloud Firestore and `LEMMA_SESSION_SECRET` before accepting real production
bookings so accounts and reservations persist permanently across instances.
Cloudinary is required for new production photo uploads; without it, checked-in
representative stock photos and existing Cloudinary photographs continue to display.

`FIREBASE_PRIVATE_KEY` comes from **Firebase Console → Project settings → Service
accounts → Generate new private key**. Keep its BEGIN/END PRIVATE KEY lines. A
literal `\n` in one-line values is converted to a newline by the server. Never prefix
server secrets with `NEXT_PUBLIC_`. The code refuses
`NEXT_PUBLIC_FIREBASE_PRIVATE_KEY` and `NEXT_PUBLIC_CLOUDINARY_API_SECRET`.

## 2. Prepare Firestore and the first administrator

1. Enable **Cloud Firestore** in the selected Firebase project. If using Firebase
   Authentication for sign-in, enable **Email/Password** there too.
2. Deploy the checked-in `firestore.rules` and `firestore.indexes.json` to this
   project, with a Firebase CLI session that the property owner controls:

   ```bash
   npx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
   ```

   The server's Admin SDK bypasses these rules; they still protect direct browser SDK
   access. Rules use `users/{uid}` for current roles and status, not stale token claims.
3. Register a normal account at `/register`, or create a Firebase Authentication user
   and sign in once. In **Firestore → `users` → the exact UID document**, set `role`
   to `admin` (or `super_admin`) and leave `accountStatus` as `active`. Only a trusted
   project operator should perform this first appointment. Promotion or suspension
   is read from Firestore on the next authenticated request. There is no public
   setup-admin endpoint and no bootstrap token.
4. Sign in and check **Admin → Settings**, then **Admin → Apartments**. In a new
   cloud project, add the real apartment inventory and prices before expecting a
   catalogue. If the three prior example listings already exist in Firestore, they
   remain public as marked examples; update them only after confirming the actual
   apartment, rates, amenities, and photographs with the property.

Local development without Firebase uses `.data/lemma-db.json`, includes the three
labelled example listings and uses a randomly generated local session secret. It is
**not** an alternative production database. Existing local data is not automatically
migrated to Firestore; export and reconcile it explicitly before switching backends.
Back up any data before changing project credentials.

## 3. Optional integrations and limitations

- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
  `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`,
  `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, and
  `NEXT_PUBLIC_FIREBASE_APP_ID` enable browser-side Firebase Auth. Set them all
  for the **same** project as the Admin credentials, or leave them unset and use
  the server-side account/password sign-in. Existing local accounts are **not**
  linked to Firebase Auth accounts just because their emails match; this prevents
  somebody from claiming a staff account by creating an unverified Firebase user.
- `RESEND_API_KEY` and a verified `EMAIL_FROM` sender enable verification and
  password-reset emails. Without delivery, newly registered guests can sign in and
  see bookings they make while signed in but cannot claim older visitor bookings
  merely by typing the same email; those require email verification. Password
  recovery cannot send a link without an email provider. Staff can help guests by
  following the property's identity-verification process.
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `SMS_WEBHOOK_URL` and
  `SMS_API_KEY` enable outbound delivery providers. Without them, messages are
  stored as drafts or marked not connected; delivery is not falsely reported.
- `CRON_SECRET` protects `/api/cron/reminders`. Schedule a GET with
  `x-cron-secret: <value>` (or Authorization: Bearer) using a trusted external
  scheduler. Do not put the secret in a URL or public logs.
- Payment methods are **manual**: submitting proof records a claim, not a bank
  credit. Staff verifies it before a receipt is issued. Proof files attached to a
  claim must be under 500 KB because they are stored inside a Firestore document;
  a transaction reference may be submitted without an attachment.

## 4. Checking cloud storage connectivity

Sign in as an administrator and inspect the integration status in **Admin → Settings**
(or inspect `integrations.firebaseAdminConfigured` from `/api/session` when signed in).
If `firebaseAdminConfigured` is `false` after setting credentials in **Vercel →
Settings → Environment Variables**, check that:

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` (or a
  service-account JSON in `FIREBASE_SERVICE_ACCOUNT`) are set for **Production** (and
  **Preview** if desired).
- `FIREBASE_PRIVATE_KEY` contains the full `BEGIN PRIVATE KEY` / `END PRIVATE KEY`
  block (real newlines, escaped `\n`, or base64-encoded PEM) from the same Firebase
  project, and Cloud Firestore is enabled in that project.
- You have triggered a **Redeploy** after saving environment variable changes. Never
  paste private keys in chat, a PR, or an issue.

## 5. Verification checklist

After setting the variables, redeploy and, with test accounts only:

1. Confirm `/`, `/apartments`, and an apartment detail page render without broken
   images; the three sample units and stock photos must be clearly identified.
2. Register a new guest; sign out, restart/redeploy and sign in again. If the account
   disappears, the wrong Firestore project or credentials were used.
3. Create an enquiry, confirm it as staff, check that overlapping confirmed stays
   are rejected, and cancel a test booking. Verify the data survives a new instance.
4. Upload a small photo from Admin, reload the page in a fresh browser, and verify
   it persists. If uploads fail, check Cloudinary keys, cloud name, signed preset,
   and permission to manage apartment media. Remove test assets afterward.
5. Suspend a test account in Firestore, then confirm its next request is refused;
   re-enable it only after testing.

The local unit and HTTP tests do not replace this **live-project** check. This
workspace has no Firebase service-account credentials and could not access the
connected Vercel project, so production persistence and external uploads must be
verified by an authorised operator after deployment.
