'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

/**
 * Firebase Client SDK Configuration
 *
 * Activates automatically whenever `NEXT_PUBLIC_FIREBASE_API_KEY` and
 * `NEXT_PUBLIC_FIREBASE_PROJECT_ID` are set in the deployment environment.
 * Enables IndexedDB offline persistence (`persistentLocalCache`) across tabs
 * to minimize repeated Firestore document reads (Section 14B).
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseClientConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

export function getFirebaseClientApp(): FirebaseApp | null {
  if (!isFirebaseClientConfigured()) return null;
  if (cachedApp) return cachedApp;
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return cachedApp;
}

export function getFirebaseClientAuth(): Auth | null {
  const app = getFirebaseClientApp();
  if (!app) return null;
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(app);
  if (typeof window !== 'undefined') {
    void setPersistence(cachedAuth, browserLocalPersistence).catch(() => {});
  }
  return cachedAuth;
}

export function getFirebaseClientDb(): Firestore | null {
  const app = getFirebaseClientApp();
  if (!app) return null;
  if (cachedDb) return cachedDb;
  try {
    if (typeof window !== 'undefined') {
      cachedDb = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } else {
      cachedDb = getFirestore(app);
    }
  } catch {
    cachedDb = getFirestore(app);
  }
  return cachedDb;
}
