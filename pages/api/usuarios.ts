/**
 * /api/usuarios
 *
 * Gestión de usuarios y roles del panel (solo superadmin).
 *
 * GET    — Listar usuarios (Firestore `users` + Firebase Auth).
 * POST   — Crear/asignar un usuario como admin o superadmin por correo.
 * PATCH  — Actualizar rol o estado de un usuario existente.
 * DELETE — Deshabilitar un usuario (soft delete: estado = 'deshabilitado').
 *
 * El cuerpo usa `uid` para identificar al usuario objetivo (PATCH/DELETE)
 * o `correo` para buscarlo/crearlo (POST).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_USERS,
  getAdminAuth,
  getAdminDb,
  requireSuperadmin,
} from '@/lib/firebase-admin';

interface UsuarioResumen {
  uid: string;
  correo: string | null;
  nombre: string | null;
  rol: string;
  estado: string;
  fechaCreacion?: string;
  proveedor?: string;
}

async function listarUsuarios(): Promise<UsuarioResumen[]> {
  const db = getAdminDb();
  const auth = getAdminAuth();

  // Leer documentos de users en Firestore.
  const usersSnap = await db.collection(COLECCION_USERS).get();
  const porUid = new Map<string, UsuarioResumen>();
  for (const doc of usersSnap.docs) {
    const data = doc.data() ?? {};
    porUid.set(doc.id, {
      uid: doc.id,
      correo: data['correo'] ?? null,
      nombre: data['nombre'] ?? null,
      rol: (data['rol'] as string) ?? 'aspirante',
      estado: (data['estado'] as string) ?? 'activo',
      fechaCreacion: data['fechaCreacion'] as string | undefined,
      proveedor: data['proveedor'] as string | undefined,
    });
  }

  // Complementar con Auth para emails y proveedores que falten.
  const list = await auth.listUsers(1000);
  for (const userRecord of list.users) {
    const existente = porUid.get(userRecord.uid);
    if (existente) {
      if (!existente.correo) existente.correo = userRecord.email ?? null;
      if (!existente.proveedor) {
        existente.proveedor =
          userRecord.providerData.length > 0 && userRecord.providerData[0]
            ? userRecord.providerData[0]!.providerId
            : 'contraseña';
      }
    } else {
      // Usuario en Auth sin documento en Firestore: se asume aspirante.
      porUid.set(userRecord.uid, {
        uid: userRecord.uid,
        correo: userRecord.email ?? null,
        nombre: userRecord.displayName ?? null,
        rol: 'aspirante',
        estado: userRecord.disabled ? 'deshabilitado' : 'activo',
        proveedor:
          userRecord.providerData.length > 0 && userRecord.providerData[0]
            ? userRecord.providerData[0]!.providerId
            : 'contraseña',
      });
    }
  }

  return Array.from(porUid.values()).sort((a, b) =>
    (a.correo ?? '').localeCompare(b.correo ?? ''),
  );
}

async function handleGet(_req: NextApiRequest, res: NextApiResponse) {
  const usuarios = await listarUsuarios();
  return res.status(200).json({ success: true, usuarios });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  const body =
    typeof req.body === 'string'
      ? (JSON.parse(req.body) as Record<string, unknown>)
      : (req.body as Record<string, unknown>);

  const correo = typeof body['correo'] === 'string' ? body['correo'].trim() : '';
  const rol = typeof body['rol'] === 'string' ? body['rol'] : 'admin';
  const nombre = typeof body['nombre'] === 'string' ? body['nombre'] : null;

  if (!correo) {
    return res.status(400).json({ error: 'El correo es requerido.' });
  }
  if (!['admin', 'superadmin'].includes(rol)) {
    return res.status(400).json({ error: 'El rol debe ser "admin" o "superadmin".' });
  }

  // Buscar el usuario en Auth por correo.
  let usuarioPorCorreo: import('firebase-admin/auth').UserRecord | null = null;
  try {
    usuarioPorCorreo = await auth.getUserByEmail(correo);
  } catch {
    usuarioPorCorreo = null;
  }

  if (!usuarioPorCorreo) {
    return res
      .status(404)
      .json({ error: 'No existe un usuario de Firebase Auth con ese correo.' });
  }
  const uid = usuarioPorCorreo.uid;

  // Actualizar custom claim y documento de Firestore.
  await auth.setCustomUserClaims(uid, { rol, nombre });
  await db.collection(COLECCION_USERS).doc(uid).set(
    {
      rol,
      correo,
      nombre,
      estado: 'activo',
      fechaActualizacion: new Date().toISOString(),
    },
    { merge: true },
  );

  return res.status(200).json({
    success: true,
    mensaje: `Usuario ${correo} asignado como ${rol}.`,
    usuario: { uid, correo, rol, estado: 'activo' },
  });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  identidad: { uid: string; rol: string },
) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  const body =
    typeof req.body === 'string'
      ? (JSON.parse(req.body) as Record<string, unknown>)
      : (req.body as Record<string, unknown>);

  const uidObjetivo = typeof body['uid'] === 'string' ? body['uid'] : '';
  const rolNuevo = typeof body['rol'] === 'string' ? body['rol'] : undefined;
  const estadoNuevo = typeof body['estado'] === 'string' ? body['estado'] : undefined;

  if (!uidObjetivo) {
    return res.status(400).json({ error: 'El uid es requerido.' });
  }

  // No se permite autodeshabilitarse ni autodegradarse.
  if (uidObjetivo === identidad.uid) {
    if (rolNuevo && rolNuevo !== identidad.rol) {
      return res.status(400).json({ error: 'No puedes cambiar tu propio rol.' });
    }
    if (estadoNuevo === 'deshabilitado') {
      return res.status(400).json({ error: 'No puedes deshabilitar tu propia cuenta.' });
    }
  }

  // Cargar el documento actual para validar último superadmin.
  const docRef = db.collection(COLECCION_USERS).doc(uidObjetivo);
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado en Firestore.' });
  }
  const actual = snap.data() ?? {};
  const rolActual = (actual['rol'] as string) ?? 'aspirante';

  // Validar último superadmin: no se puede degradar ni deshabilitar al único superadmin.
  if (rolActual === 'superadmin') {
    const superadmins = await db
      .collection(COLECCION_USERS)
      .where('rol', '==', 'superadmin')
      .get();
    if (superadmins.size <= 1) {
      if ((rolNuevo && rolNuevo !== 'superadmin') || estadoNuevo === 'deshabilitado') {
        return res.status(400).json({
          error: 'No se puede deshabilitar ni degradar al último superadministrador.',
        });
      }
    }
  }

  const actualizaciones: Record<string, unknown> = {
    fechaActualizacion: new Date().toISOString(),
  };
  if (rolNuevo && ['admin', 'superadmin', 'aspirante'].includes(rolNuevo)) {
    actualizaciones['rol'] = rolNuevo;
  }
  if (estadoNuevo && ['activo', 'deshabilitado'].includes(estadoNuevo)) {
    actualizaciones['estado'] = estadoNuevo;
  }

  if (Object.keys(actualizaciones).length > 1) {
    await docRef.set(actualizaciones, { merge: true });
  }

  // Sincronizar custom claim si cambió el rol.
  if (rolNuevo && rolNuevo !== rolActual) {
    await auth.setCustomUserClaims(uidObjetivo, {
      rol: rolNuevo,
      nombre: actual['nombre'] ?? null,
    });
  }

  return res.status(200).json({
    success: true,
    mensaje: 'Usuario actualizado correctamente.',
    usuario: { uid: uidObjetivo, ...actualizaciones },
  });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  identidad: { uid: string; rol: string },
) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  const body =
    typeof req.body === 'string'
      ? (JSON.parse(req.body) as Record<string, unknown>)
      : (req.body as Record<string, unknown>);

  const uidObjetivo = typeof body['uid'] === 'string' ? body['uid'] : '';

  if (!uidObjetivo) {
    return res.status(400).json({ error: 'El uid es requerido.' });
  }
  if (uidObjetivo === identidad.uid) {
    return res.status(400).json({ error: 'No puedes deshabilitar tu propia cuenta.' });
  }

  const docRef = db.collection(COLECCION_USERS).doc(uidObjetivo);
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado en Firestore.' });
  }
  const actual = snap.data() ?? {};
  const rolActual = (actual['rol'] as string) ?? 'aspirante';

  // Último superadmin no se puede deshabilitar.
  if (rolActual === 'superadmin') {
    const superadmins = await db
      .collection(COLECCION_USERS)
      .where('rol', '==', 'superadmin')
      .get();
    if (superadmins.size <= 1) {
      return res.status(400).json({
        error: 'No se puede deshabilitar al último superadministrador.',
      });
    }
  }

  await docRef.set(
    { estado: 'deshabilitado', fechaActualizacion: new Date().toISOString() },
    { merge: true },
  );
  await auth.updateUser(uidObjetivo, { disabled: true });

  return res.status(200).json({
    success: true,
    mensaje: 'Usuario deshabilitado.',
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let identidad: { uid: string; rol: string };
  try {
    const admin = await requireSuperadmin(req);
    identidad = { uid: admin.uid, rol: admin.rol as string };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de autenticación';
    return res.status(adminErrorStatus(error)).json({ error: message });
  }

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res, identidad);
    if (req.method === 'DELETE') return await handleDelete(req, res, identidad);
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('Error en /api/usuarios:', error);
    const message = error instanceof Error ? error.message : 'Error interno de usuarios';
    return res.status(500).json({ error: message });
  }
}
