# Deploying to Vercel

Everything the app reads from `process.env`, what happens when each one is missing,
and the order to set them in. Read section 1 before anything else: on Vercel one of
these is not advisable to skip.

Set variables in **Vercel → Project → Settings → Environment Variables**, for all of
Production, Preview and Development unless a row says otherwise. Changing a
`NEXT_PUBLIC_*` value requires a redeploy; server-only values are picked up on the
next request.

---

## 1. The one that matters: Firebase Admin

**Do not deploy without `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and
`FIREBASE_PRIVATE_KEY`.**

Without them the app does not fall back to a database. It falls back to a JSON file on
the server's local disk (`src/lib/db/store.ts` → `resolveDataDir`). On Vercel that
directory is:

- **read-only** in the deployment image, so it silently moves to `/tmp/lemma-data`, and
- **ephemeral**, so it is wiped whenever the function cold-starts or lands on a
  different instance.

The failure is silent because registration still returns `200`:

```
1. register a guest                                    -> 200 OK
2. cold start (or any other lambda instance)           -> /tmp cleared
3. sign in with the account that was just created      -> 401 Invalid email or password
```

Every account, booking, payment and setting written between cold starts is lost the
same way. With the three Firebase Admin variables set, the store hydrates from and
writes to Cloud Firestore instead, which is the only supported production backend.

| Variable | Where to get it |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase console → Project settings → General → Project ID |
| `FIREBASE_CLIENT_EMAIL` | Project settings → Service accounts → Generate new private key → `client_email` |
| `FIREBASE_PRIVATE_KEY` | The `private_key` field of that same JSON file |

**Pasting `FIREBASE_PRIVATE_KEY`.** It is a multi-line PEM. Keep the `-----BEGIN
PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines, and paste it one of two ways:

- **As-is, with real newlines.** The Vercel UI accepts a paste containing line breaks.
  This is the least error-prone option.
- **Escaped, as a single line** with literal `\n` sequences. The loader converts them
  (`firebase/admin.ts` does `.replace(/\\n/g, '\n')`), so this works too.

Either way, do not wrap it in extra quotes and do not strip the header and footer.

Verify it took: sign in as an admin, open **Admin → Settings**. The integrations panel
reports `firebaseAdminConfigured`. If it is false, the key did not parse.

### After the first deploy

1. Deploy the security rules and indexes from this repo, once, against the same project:

   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

   Without the rules the collections are governed by whatever the project default is;
   `firestore.rules` and `firestore.indexes.json` are both in the repo root.

2. Appoint the first administrator. There is no bootstrap token and no setup screen by
   design. Two routes work; **use the second one**, because it needs no Firebase Auth
   account and therefore none of the `NEXT_PUBLIC_FIREBASE_*` variables:

   **Route A, a Firebase Auth account.** Create the user in **Firebase Console →
   Authentication**, sign in at `/login`. That path runs through the Firebase web SDK
   and `/api/auth/firebase-session`, so it requires both the Admin credentials above
   *and* the six web SDK variables from section 4.

   **Route B, an ordinary account (recommended).** Register at `/register`, which
   creates the profile in Firestore with `role: 'guest'`. Then open **Firestore →
   `users` → that account's document** and change `role` to `admin`.

   Either way the promotion is read from Firestore on the next request, with no
   redeploy: `getSession()` calls `syncRoleFromFirestore()`, which compares the
   document against the cached row and applies `applyConsoleRoleChange()` when they
   differ (`src/lib/auth/session.ts`).

   Verified end to end here: a fresh registration was refused at `/admin`
   (redirected to `/account`), its `role` was changed to `admin` in the store, and
   the same session then loaded the dashboard without a new sign-in.

---

## 2. Required before real traffic

| Variable | Required | Purpose and failure mode |
| --- | --- | --- |
| `LEMMA_SESSION_SECRET` | **Yes** | Signs the `lemma_session` cookie. Falls back to a hard-coded string in `src/lib/auth/session.ts`, which means anyone who reads this repository can forge a session cookie. Generate once and keep it stable; rotating it signs every user out. |

```bash
openssl rand -hex 32
```

---

## 2b. What happens when Firestore is unreachable

Worth knowing before you enable the Admin credentials, because the failure looks like a
broken sign-up form rather than a database problem.

Every write is a local write followed by a Firestore batch, and every request hydrates
the local copy from Firestore once. Both were unbounded, so when Firestore could not be
reached the SDK retried for about two minutes and a registration request never answered.
Vercel kills the function first, so the guest saw a form that appeared to submit and then
failed, or hung. There is now a bounded wait (4s for a batch of reads or a write, 3s for
the per-request role read) and a 30s cooldown after a timeout, so the first request
discovers the problem and the rest are served from the local copy immediately.

Measured on a project with valid but unauthorised credentials, which reproduces the
outage path:

| | Before | After |
| --- | --- | --- |
| Registration | never completed (120s timeout) | succeeds |
| First request after outage | 120s | 4.2s |
| Later requests | 120s each | 60 to 70ms |

Two limits remain and are not bugs:

- **The local copy does not survive a cold start on Vercel.** The working directory is
  read only, so `resolveDataDir` falls back to `/tmp`, which is per instance. Firestore is
  the durable store; if it is unreachable, changes made during the outage are lost when
  the instance recycles. The app warns on every such write.
- **A change made while Firestore is down is still shown to the user.** The local write
  has already succeeded, so reporting failure would be inaccurate. The cloud sync is
  deferred and retried by the next successful mutation, since every write is a full
  diff-aware snapshot rather than a delta.

---

## 3. Required for features to work

Each of these degrades to a stated behaviour rather than crashing, so they are safe to
add after the first deploy, but the feature is off until you do.

| Variable | Feature | Without it |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical/OG metadata | Falls back to `http://localhost:3000` for `metadataBase`, so shared links get the wrong canonical URL. Set it to the real origin, e.g. `https://lemma-apartments.vercel.app` or your domain. |
| `CLOUDINARY_CLOUD_NAME` | Image and document uploads | Uploads fall back to local disk, which does not survive a cold start. Set alongside the two below. |
| `CLOUDINARY_API_KEY` | Signed uploads | `isCloudinaryConfigured()` is false, so the admin media screen reports that signed uploads are not ready. |
| `CLOUDINARY_API_SECRET` | Signed uploads | Same as above. **Server-only: never prefix with `NEXT_PUBLIC_`.** The app throws a hard error if it finds `NEXT_PUBLIC_CLOUDINARY_API_SECRET` set. |
| `CLOUDINARY_UPLOAD_PRESET` | Signed uploads | Defaults to `lemma_uploads` in code. Only set it if your preset is named differently. |
| `CRON_SECRET` | Automatic reminders | `/api/cron/reminders` refuses every call, by design. See section 5 for the wrinkle. |
| `RESEND_API_KEY` | Transactional email | Registration succeeds but `emailSent: false` and no verification email goes out. Notifications are still stored in-app for staff to act on. |
| `EMAIL_FROM` | Sender address | Defaults to `Lemma Apartments <lemmaheights@gmail.com>`. Must be on a domain you have verified in Resend, or delivery fails. |

---

## 4. Optional: the Firebase web SDK

| Variable | Without it |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | The login form skips Firebase Auth entirely and uses the built-in email + password path. Both the header and the footer say so; nothing breaks. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Same. These two are the on/off switch (`isFirebaseClientConfigured()`). |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Only needed if you enable the web SDK above. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Only needed if you enable the web SDK above. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Only needed if you enable the web SDK above. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Only needed if you enable the web SDK above. |

The safest choice today is to leave all six unset. The app is designed to run on the
server-side password path, and enabling the web SDK adds a second way in that the login
form has to reconcile.

**If you do enable it, set all six in the same change as the Admin credentials.** There
is a specific failure waiting otherwise. With `NEXT_PUBLIC_FIREBASE_API_KEY` and
`NEXT_PUBLIC_FIREBASE_PROJECT_ID` set but Admin missing, an account that exists in
Firebase Auth but has no local password cannot sign in at all:

1. The web SDK signs in and posts the ID token to `/api/auth/firebase-session`
2. That route returns `501 firebase_not_configured`, because it needs the Admin SDK
3. `login-form.tsx` falls through to `/api/auth/login`, which has no local hash
4. Firebase rejects it as `auth/invalid-credential`, which the form treats as a wrong
   password and stops, so the fall-through to the local path never happens

`measurementId` / `G-` IDs have no counterpart in this codebase. Nothing reads them and
`getAnalytics` is never called, so leaving them out loses nothing.

---

## 5. Optional: outbound messaging

Every provider is **honest about failure**: a notification is only marked `sent` when a
configured provider returns 2xx. Otherwise it is stored in-app and marked
`not_connected`. Nothing pretends a message went out.

| Variable | Provider |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Business Cloud API token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID |
| `SMS_WEBHOOK_URL` | Your SMS gateway endpoint |
| `SMS_API_KEY` | Its bearer token |

> **Known inconsistency.** The integrations panel in **Admin → Settings** checks
> `WHATSAPP_CLOUD_ACCESS_TOKEN` (`src/lib/api/snapshot.ts`), but the sender reads
> `WHATSAPP_ACCESS_TOKEN` (`src/lib/notifications/providers.ts`). Setting only the
> documented `WHATSAPP_ACCESS_TOKEN` makes sending work while the panel still reports
> WhatsApp as unconfigured. Set both to the same value to keep the panel honest.

### Vercel Cron

`/api/cron/reminders` accepts the secret as `x-cron-secret`, as `Authorization:
Bearer`, or as `?key=`. Vercel Cron always issues a `GET` and cannot be given custom
headers, so a `vercel.json`-driven cron has to use the query-string form:

```json
{
  "crons": [
    { "path": "/api/cron/reminders?key=<CRON_SECRET>", "schedule": "0 6 * * *" }
  ]
}
```

That puts the secret in the URL, where it lands in Vercel's request logs. If that is
not acceptable, either point an external scheduler at the endpoint with the
`x-cron-secret` header (README documents this, and it is the better option), or leave
reminders to the in-app notification list, which needs no scheduler at all.

---

## 6. Set these the same value, or not at all

These pairs are read by different modules. Half-setting either one produces a status
panel that disagrees with the behaviour.

| Names | Read by |
| --- | --- |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_CLOUD_NAME` | The browser URL builder reads the public one; the server falls back to it, so the server-only one is optional if the public one is set. |
| `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_CLOUD_ACCESS_TOKEN` | See the warning in section 5. |

---

## 7. Never set these

The app throws a deliberate security error if it finds either, because they would ship
a server secret into the browser bundle:

- `NEXT_PUBLIC_FIREBASE_PRIVATE_KEY`
- `NEXT_PUBLIC_CLOUDINARY_API_SECRET`

Also do not set `LEMMA_DATA_DIR` on Vercel. It points the local JSON fallback at a
different directory, which only changes *where* the data is lost.

---

## 8. Final checklist

Minimum viable production deployment:

```
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
LEMMA_SESSION_SECRET
NEXT_PUBLIC_SITE_URL
```

Add for a complete install:

```
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
RESEND_API_KEY
EMAIL_FROM
CRON_SECRET
```

After deploying: sign in as an admin, open **Admin → Settings**, and confirm the
integrations panel matches what you set. Then register one test guest, wait for a cold
start (or redeploy), and sign in again. If the sign-in fails, the Firebase Admin
variables are not being read and nothing else on the site can be trusted.
