/**
 * /api/contexts/[id]
 *
 * GET    — Detalle de un contexto de `contexts_v2`.
 * PUT    — Actualiza el contexto (merge; conserva campos desconocidos).
 * DELETE — Elimina el contexto solo si ninguna pregunta lo referencia.
 *
 * Un contexto en uso no se puede borrar: dejaría preguntas aprobadas sin
 * imagen de contexto (D-05). Primero hay que reasignar o despublicar.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  adminErrorStatus,
  COLECCION_CONTEXTS,
  COLECCION_QUESTIONS,
  getAdminDb,
  requireAdmin,
} from '@/lib/firebase-admin';

function getId(req: NextApiRequest): string {
  const v = req.query['id'];
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function leerCuerpo(req: NextApiRequest): Record<string, unknown> {
  return typeof req.body === 'string'
    ? (JSON.parse(req.body) as Record<string, unknown>)
    : ((req.body ?? {}) as Record<string, unknown>);
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'ID requerido' });

  const snap = await getAdminDb().collection(COLECCION_CONTEXTS).doc(id).get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Contexto no encontrado' });
  }

  const referencias = await getAdminDb()
    .collection(COLECCION_QUESTIONS)
    .where('contexto_ids', 'array-contains', id)
    .limit(200)
    .get();

  return res.status(200).json({
    success: true,
    contexto: { id: snap.id, ...(snap.data() as Record<string, unknown>) },
    preguntas: referencias.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      estado: asString((doc.data() as Record<string, unknown>)['estado'], 'pendiente'),
      pregunta: asString((doc.data() as Record<string, unknown>)['pregunta']),
    })),
  });
}

async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'ID requerido' });

  const ref = getAdminDb().collection(COLECCION_CONTEXTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Contexto no encontrado' });
  }

  const body = leerCuerpo(req);
  const actual = (snap.data() ?? {}) as Record<string, unknown>;
  const cambios: Record<string, unknown> = {};

  const CAMPOS = [
    'area',
    'componente',
    'subtema',
    'texto',
    'titulo',
    'imagenes',
    'preguntas_ids',
    'notas',
    'rango_declarado',
    'pagina',
    'recortes',
    'bank_version',
    'schema_version',
  ] as const;

  for (const campo of CAMPOS) {
    if (!(campo in body)) continue;
    cambios[campo] = body[campo];
  }

  if (typeof cambios['texto'] === 'string' && !cambios['texto'].trim()) {
    return res
      .status(400)
      .json({ error: 'El texto del contexto no puede quedar vacío.' });
  }
  if ('imagenes' in cambios && !Array.isArray(cambios['imagenes'])) {
    return res.status(400).json({ error: 'imagenes debe ser una lista' });
  }

  cambios['updated_at'] = new Date().toISOString();
  cambios['metadatos'] = {
    ...((actual['metadatos'] as Record<string, unknown> | undefined) ?? {}),
    fechaActualizacion: cambios['updated_at'],
  };

  await ref.set(cambios, { merge: true });
  const actualizado = await ref.get();
  return res.status(200).json({
    success: true,
    contexto: {
      id: actualizado.id,
      ...(actualizado.data() as Record<string, unknown>),
    },
  });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'ID requerido' });

  const referencias = await getAdminDb()
    .collection(COLECCION_QUESTIONS)
    .where('contexto_ids', 'array-contains', id)
    .limit(1)
    .get();

  if (!referencias.empty) {
    return res.status(409).json({
      error:
        'El contexto está en uso por al menos una pregunta. ' +
        'Reasígnela o despublíquela antes de borrar el contexto.',
      pregunta: referencias.docs[0]?.id ?? null,
    });
  }

  const ref = getAdminDb().collection(COLECCION_CONTEXTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Contexto no encontrado' });
  }
  await ref.delete();
  return res.status(200).json({ success: true, mensaje: 'Contexto eliminado.' });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdmin(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de autenticación';
    return res.status(adminErrorStatus(error)).json({ error: message });
  }

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'PUT') return await handlePut(req, res);
    if (req.method === 'DELETE') return await handleDelete(req, res);
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('Error en /api/contexts/[id]:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return res.status(500).json({ error: message });
  }
}
