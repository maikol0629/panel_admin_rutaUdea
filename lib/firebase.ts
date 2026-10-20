/**
 * Firebase Client SDK — SOLO para uso en el navegador (componentes y páginas).
 *
 * Expone el objeto `auth` del SDK cliente (`firebase/auth`) para login,
 * sesión (`onAuthStateChanged`) y obtención del ID token con los
 * custom claims (`rol: 'admin'`).
 *
 * NO importar este módulo en API Routes. Para el servidor usar
 * `@/lib/firebase-admin`.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

function getClientApp(): FirebaseApp {
  const existentes = getApps();
  if (existentes.length > 0 && existentes[0]) {
    return existentes[0];
  }

  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  });
}

export const clientApp: FirebaseApp = getClientApp();
export const auth: Auth = getAuth(clientApp);
