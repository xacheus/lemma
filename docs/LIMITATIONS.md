# Operational boundaries

- **Photographs and apartment details:** The three original units are examples, not
  independently verified inventory. Their 18 Pexels images are representative stock
  photographs, not photographs of Lemma Apartments. Confirm layouts, amenities,
  availability and final prices with reception. Example enquiries require staff
  confirmation before a guest is shown payment instructions. Replace the examples
  with verified inventory and property photos when available; see
  [PHOTOGRAPHY.md](PHOTOGRAPHY.md).
- **Persistence:** Firestore is the supported production store. If it cannot be read
  or a transaction cannot commit, requests fail instead of claiming that disposable
  local data was saved. Local development uses an atomic JSON file in one process;
  it is not a multi-instance database. Cloud reads cache for up to three seconds;
  mutations re-read inside a Firestore transaction. Firestore transactions still have
  document and size limits; the current approach reads the property's collections
  together, so very large portfolios would need a more targeted data model.
- **Live verification:** Unit tests cover document diffs, local rollback/serialization,
  account ownership, sample status and signature inputs. The local HTTP suite exercises
  booking, staff and payment flows. No service-account credentials or accessible Vercel
  project were supplied in this workspace, so transaction behaviour on the **actual**
  Firestore project and live Cloudinary uploads have **not** been verified here.
  Follow the [deployment checklist](DEPLOYMENT.md) with an authorised operator.
- **Email and account recovery:** Registering creates an account even without an email
  provider, but an unverified email cannot claim historical visitor bookings or
  documents. Verification and password-reset links require a configured delivery
  provider. An existing local account is never linked to a Firebase Auth user merely
  because the email matches.
- **Payments:** Airtel Money, MTN MoMo, bank transfers and cash are recorded as
  guest claims or staff entries; none is an automatic provider settlement. A person
  compares the reference or receipt with the provider statement and verifies it.
  Attached payment proof must be under 500 KB to fit in one Firestore document; a
  text-only reference can be submitted. No bank callback or automatic refund transfer
  is implemented.
- **Messages and reminders:** Delivery is only reported after a configured provider
  confirms it. Reminders require a separate scheduler plus `CRON_SECRET`. Without
  external gateways, drafts remain in the app and do not masquerade as delivered.
- **Media:** Production uploads require signed Cloudinary credentials; without them
  uploads are rejected rather than saved to temporary serverless storage. Local
  development may use `.data/media`. Restrict access to private media; a claim's
  embedded proof is visible only to its owner and authorised staff through the app.
- **Scope:** One property, Zambian Kwacha, English-language interface. A confirmed
  booking holds the night; an enquiry does not. Real fiscalisation, bank provider
  settlement, and a multi-property data model are outside this release.
