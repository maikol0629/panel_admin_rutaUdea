/**
 * POST /api/auth/verify
 *
 * Verifica que el token del header `Authorization: Bearer <idToken>`
 * pertenece a un usuario con custom claim `rol === 'admin'`.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { adminErrorStatus, requireAdmin } from '@/lib/firebase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const identity = await requireAdmin(req);
    return res.status(200).json({
      success: true,
      isAdmin: true,
      uid: identity.uid,
      nombre: identity.nombre,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al verificar sesión';
    return res.status(adminErrorStatus(error)).json({ error: message });
  }
}
