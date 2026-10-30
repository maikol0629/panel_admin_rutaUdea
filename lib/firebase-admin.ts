/**
 * Firebase Admin SDK — SOLO para uso en el servidor (API Routes).
 *
 * Inicialización perezosa: las credenciales se leen de las variables de
 * entorno `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y
 * `FIREBASE_PRIVATE_KEY` únicamente cuando un handler las necesita.
 * Así el `import` nunca rompe el build del cliente ni exige env vars
 * en tiempo de compilación.
 *
 * NO importar este módulo desde componentes o páginas (navegador).
 * Para el cliente usar `@/lib/firebase`.
 */

import { cert, getApps, initializeApp, type App as AdminApp } from 'firebase-admin/app';
import { getAuth, type Auth as AdminAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore';

function getAdminApp(): AdminApp {
  const existentes = getApps();
  const actual = existentes[0];
  if (actual) return actual;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Faltan variables de entorno de Firebase Admin. ' +
        'Configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.',
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

export function getAdminDb(): AdminFirestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): AdminAuth {
  return getAuth(getAdminApp());
}

// Nombres de colecciones Firestore (contrato v2 con la app móvil rutaUdea).
export const COLECCION_USERS = 'users';
/** Banco legacy (congelado para rollback, solo lectura en el panel). */
export const COLECCION_QUESTIONS_LEGACY = 'questions';
/** Colección canónica del contrato v2 (Fase 6). */
export const COLECCION_QUESTIONS = 'questions_v2';
export const COLECCION_CONTEXTS = 'contexts_v2';
export const COLECCION_BANK_MANIFEST = 'bank_manifest';
export const COLECCION_SETTINGS = 'settings';

export interface AdminIdentity {
  uid: string;
  rol: unknown;
  nombre: unknown;
}

/**
 * Verifica el header `Authorization: Bearer <idToken>` y exige el
 * custom claim `rol === 'admin'`.
 * Lanza un error con `status` HTTP asociado si la verificación falla.
 */
export async function requireAdmin(req: {
  headers: { authorization?: string | null };
}): Promise<AdminIdentity> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    const error = new Error('Token de autorización requerido') as Error & {
      status?: number;
    };
    error.status = 401;
    throw error;
  }

  const idToken = header.slice('Bearer '.length).trim();
  if (!idToken) {
    const error = new Error('Token de autorización requerido') as Error & {
      status?: number;
    };
    error.status = 401;
    throw error;
  }

  let uid: string;
  let claims: Record<string, unknown>;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
    claims = decoded as unknown as Record<string, unknown>;
  } catch {
    const error = new Error('Token inválido o expirado') as Error & {
      status?: number;
    };
    error.status = 401;
    throw error;
  }

  // En firebase-admin los custom claims van en el nivel superior del token.
  const rol = claims['rol'];
  const rolesValidos = ['admin', 'superadmin'];
  if (!rolesValidos.includes(rol as string)) {
    const error = new Error(
      'Acceso no autorizado. Se requieren permisos de administrador.',
    ) as Error & { status?: number };
    error.status = 403;
    throw error;
  }

  return { uid, rol, nombre: claims['nombre'] ?? null };
}

/**
 * Como [requireAdmin], pero exige específicamente el rol `superadmin`.
 * Solo el superadmin puede gestionar usuarios y roles de otros administradores.
 */
export async function requireSuperadmin(req: {
  headers: { authorization?: string | null };
}): Promise<AdminIdentity> {
  const identidad = await requireAdmin(req);
  if (identidad.rol !== 'superadmin') {
    const error = new Error(
      'Acceso no autorizado. Se requieren permisos de superadministrador.',
    ) as Error & { status?: number };
    error.status = 403;
    throw error;
  }
  return identidad;
}

/** Extrae el código de estado HTTP de los errores lanzados por requireAdmin. */
export function adminErrorStatus(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }
  return 500;
}
