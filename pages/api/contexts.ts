/**
 * /api/contexts
 *
 * GET  — Lista los contextos compartidos de `contexts_v2` (D-05).
 * POST — Crea o actualiza un contexto; los campos desconocidos se conservan.
 *
 * Los contextos no tienen estado propio: acompañan a una o varias preguntas.
 * Lo que se publica o no es la pregunta, pero una pregunta aprobada debe
 * poder resolver su `contexto_ids`.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_CONTEXTS,
  getAdminDb,
  requireAdmin,
} from '@/lib/firebase-admin';
import { BANK_VERSION_DEFAULT, SCHEMA_VERSION } from '@/lib/bank';

const MAX_DOCS = 2000;

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function queryParam(query: NextApiRequest['query'], nombre: string): string {
  const v = query[nombre];
  if (Array.isArray(v)) return asString(v[0]);
  return asString(v);
}

function leerCuerpo(req: NextApiRequest): Record<string, unknown> {
  return typeof req.body === 'string'
    ? (JSON.parse(req.body) as Record<string, unknown>)
    : ((req.body ?? {}) as Record<string, unknown>);
}

function normalizarContexto(
  id: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const imagenes = Array.isArray(data['imagenes'])
    ? data['imagenes']
        .filter((img): img is Record<string, unknown> => typeof img === 'object' && img !== null)
        .map((img, index) => ({
          url: typeof img['url'] === 'string' && img['url'].trim() ? img['url'].trim() : null,
          rol: 'contexto',
          orden: typeof img['orden'] === 'number' ? img['orden'] : index + 1,
          alt: typeof img['alt'] === 'string' && img['alt'].trim() ? img['alt'] : null,
          path_origen:
            typeof img['path_origen'] === 'string' && img['path_origen'].trim()
              ? img['path_origen']
              : null,
          sha256: typeof img['sha256'] === 'string' ? img['sha256'] : null,
        }))
    : [];

  return {
    ...data,
    id,
    bank_version: asString(data['bank_version'], BANK_VERSION_DEFAULT),
    schema_version:
      typeof data['schema_version'] === 'number' ? data['schema_version'] : SCHEMA_VERSION,
    area: asString(data['area']),
    componente: asString(data['componente']),
    subtema: asString(data['subtema']),
    texto: asString(data['texto']),
    titulo: asString(data['titulo']) || null,
    imagenes,
    preguntas_ids: Array.isArray(data['preguntas_ids'])
      ? (data['preguntas_ids'] as unknown[]).filter(
          (x): x is string => typeof x === 'string' && x.length > 0,
        )
      : [],
  };
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const area = queryParam(req.query, 'area');
  const bankVersion = queryParam(req.query, 'bank_version');
  const search = queryParam(req.query, 'search').trim().toLowerCase();

  const snapshot = await getAdminDb()
    .collection(COLECCION_CONTEXTS)
    .limit(MAX_DOCS)
    .get();

  let contextos = snapshot.docs.map((doc) =>
    normalizarContexto(doc.id, doc.data() as Record<string, unknown>),
  );

  if (area) contextos = contextos.filter((c) => c['area'] === area);
  if (bankVersion) contextos = contextos.filter((c) => c['bank_version'] === bankVersion);
  if (search) {
    contextos = contextos.filter((c) => {
      const texto = `${asString(c['id'])} ${asString(c['titulo'])} ${asString(c['texto'])} ${asString(c['subtema'])}`.toLowerCase();
      return texto.includes(search);
    });
  }

  contextos.sort((a, b) =>
    asString(a['id']).localeCompare(asString(b['id']), 'es', { numeric: true }),
  );

  const conImagen = contextos.filter(
    (c) => Array.isArray(c['imagenes']) && (c['imagenes'] as unknown[]).length > 0,
  ).length;
  const conMultiples = contextos.filter(
    (c) => Array.isArray(c['imagenes']) && (c['imagenes'] as unknown[]).length > 1,
  ).length;

  return res.status(200).json({
    success: true,
    contextos,
    total: contextos.length,
    resumen: {
      total: contextos.length,
      conImagen,
      conMultiples,
      razonamiento_logico: contextos.filter((c) => c['area'] === 'razonamiento_logico').length,
      competencia_lectora: contextos.filter((c) => c['area'] === 'competencia_lectora').length,
    },
  });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const body = leerCuerpo(req);
  const id = asString(body['id']).trim();
  if (!id) return res.status(400).json({ error: 'El contexto necesita un id.' });
  if (!asString(body['texto']).trim()) {
    return res.status(400).json({ error: 'El contexto necesita un texto.' });
  }
  if (!asString(body['area']).trim()) {
    return res.status(400).json({ error: 'El contexto necesita un área.' });
  }

  const ahora = new Date().toISOString();
  const documento = normalizarContexto(id, body);
  documento['created_at'] = asString(body['created_at']) || ahora;
  documento['updated_at'] = ahora;

  await getAdminDb().collection(COLECCION_CONTEXTS).doc(id).set(documento, {
    merge: true,
  });

  return res.status(200).json({
    success: true,
    mensaje: 'Contexto guardado en contexts_v2.',
    contexto: documento,
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await requireAdmin(req);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error de autenticación';
    return res.status(adminErrorStatus(error)).json({ error: message });
  }

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('Error en /api/contexts:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return res.status(500).json({ error: message });
  }
}
