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

2. Appoint the first administrator. There is no bootstrap token by design: set `role`
   to `admin` on the account's `users/{uid}` document in the Firebase console. The
   session resolver reads that document, so it applies on the next request.

---

## 2. Required before real traffic

| Variable | Required | Purpose and failure mode |
| --- | --- | --- |
| `LEMMA_SESSION_SECRET` | **Yes** | Signs the `lemma_session` cookie. Falls back to a hard-coded string in `src/lib/auth/session.ts`, which means anyone who reads this repository can forge a session cookie. Generate once and keep it stable; rotating it signs every user out. |

```bash
openssl rand -hex 32
```

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
