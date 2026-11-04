import { runAtomicTransaction } from '../src/lib/db/store';
import { hashPassword } from '../src/lib/auth/passwords';

// Local-only development fixture. Never run against a Firebase-configured project.
if (process.env.FIREBASE_PROJECT_ID || process.env.VERCEL || !process.env.LEMMA_DATA_DIR) {
  throw new Error('Set LEMMA_DATA_DIR to a disposable local directory; Firebase and Vercel are not supported.');
}

const email = process.env.E2E_ADMIN_EMAIL || 'chanda@lemma.test';
const password = process.env.E2E_ADMIN_PASSWORD || 'LemmaAdmin2026!';

async function main() {
  const now = new Date().toISOString();
  await runAtomicTransaction((db) => {
    db.users = db.users ?? [];
    if (db.users.some((u) => u.email === email)) return;
    db.users.push({
      uid: 'usr-local-e2e-admin',
      fullName: 'Local Test Administrator',
      email,
      phoneNumber: '+260970000000',
      profilePhoto: '',
      role: 'admin',
      accountStatus: 'active',
      emailVerified: true,
      passwordHash: hashPassword(password),
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    });
  });
  console.log('Disposable local administrator ready. Start the server with the same LEMMA_DATA_DIR.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
