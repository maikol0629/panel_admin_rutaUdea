/**
 * POST /api/auth/login
 *
 * Recibe el ID token del SDK cliente (`{ idToken }`), lo verifica con el
 * Admin SDK y exige el custom claim `rol === 'admin'`.
 * El login email/contraseña ocurre en el navegador; el servidor solo valida.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, requireAdmin } from '@/lib/firebase-admin';

interface LoginBody {
  idToken?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const body = (
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    ) as LoginBody;
    const idToken = body?.idToken;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken es obligatorio' });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const claims = decoded as unknown as Record<string, unknown>;
    if (claims['rol'] !== 'admin') {
      // Reutiliza el mensaje estándar de requireAdmin para consistencia.
      try {
        await requireAdmin({ headers: { authorization: `Bearer ${idToken}` } });
      } catch (err) {
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status: number }).status
            : 403;
        const message = err instanceof Error ? err.message : 'Acceso no autorizado';
        return res.status(status).json({ error: message });
      }
    }

    return res.status(200).json({
      success: true,
      user: {
        uid: decoded.uid,
        nombre: claims['nombre'] ?? decoded.name ?? '',
        correo: decoded.email ?? '',
        rol: claims['rol'],
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('user-not-found') ||
        error.message.includes('invalid-credential') ||
        error.message.includes('ID token has expired') ||
        error.message.includes('Decoding Firebase ID token failed'))
    ) {
      return res.status(401).json({ error: 'Credenciales o sesión inválidos' });
    }
    console.error('Error en /api/auth/login:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
