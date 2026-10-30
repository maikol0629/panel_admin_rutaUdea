/**
 * Asigna el custom claim `rol: 'admin'` a un usuario de Firebase Auth.
 *
 * Uso:
 *   node scripts/set-admin-claim.js <correo> [nombre]
 *
 * Lee las credenciales del Admin SDK desde `.env.local`
 * (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).
 *
 * El panel verifica este claim en dos lugares:
 * - Cliente: `user.getIdTokenResult()` → `claims['rol']`
 * - Servidor: `requireAdmin()` en `lib/firebase-admin.ts`
 *
 * Después de ejecutarlo, el usuario debe cerrar sesión y volver a entrar
 * para que el claim aparezca en su ID token.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Definir __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cargarEnv() {
  const ruta = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(ruta)) {
    console.error('No existe .env.local. Cópialo desde .env.example primero.');
    process.exit(1);
  }
  for (const linea of fs.readFileSync(ruta, 'utf-8').split('\n')) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, clave, valor] = m;
    if (process.env[clave]) continue;
    process.env[clave] = valor.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  }
}

async function main() {
  const correo = process.argv[2];
  const nombre = process.argv[3];
  if (!correo) {
    console.error('Uso: node scripts/set-admin-claim.js <correo> [nombre]');
    process.exit(1);
  }

  cargarEnv();

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  }

  const auth = getAuth();
  const usuario = await auth.getUserByEmail(correo);
  const claimsActuales = usuario.customClaims || {};
  await auth.setCustomUserClaims(usuario.uid, {
    ...claimsActuales,
    rol: 'admin',
    ...(nombre ? { nombre } : {}),
  });

  console.log(`OK: ${correo} (uid ${usuario.uid}) ahora tiene rol 'admin'.`);
  console.log('El usuario debe cerrar sesión y volver a entrar.');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
