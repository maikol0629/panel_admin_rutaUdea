/**
 * /api/questions/[id]
 *
 * GET    — Obtener una pregunta por ID.
 * PUT    — Actualizar campos (merge con lista blanca). Si el estado
 *          resultante es "aprobado", exige pregunta completa: enunciado,
 *          4 opciones y respuesta A–D. Los estados "pendiente" y
 *          "deshabilitado" admiten registros incompletos (borradores).
 * DELETE — Borrado lógico: cambia el estado a "deshabilitado".
 *          Nunca se elimina físicamente para proteger el banco.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_QUESTIONS,
  getAdminDb,
  requireAdmin,
} from '@/lib/firebase-admin';

const ESTADOS = ['aprobado', 'pendiente', 'deshabilitado'] as const;
type Estado = (typeof ESTADOS)[number];

function esEstado(v: unknown): v is Estado {
  return v === 'aprobado' || v === 'pendiente' || v === 'deshabilitado';
}

function getId(req: NextApiRequest): string {
  const v = req.query['id'];
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function normalizarOpciones(raw: unknown): {
  A: string;
  B: string;
  C: string;
  D: string;
} {
  const vacias = { A: '', B: '', C: '', D: '' };
  if (Array.isArray(raw)) {
    const letras = ['A', 'B', 'C', 'D'] as const;
    for (let i = 0; i < 4; i++) {
      const letra = letras[i];
      if (letra) vacias[letra] = asString(raw[i]);
    }
    return vacias;
  }
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    return {
      A: asString(o['A']),
      B: asString(o['B']),
      C: asString(o['C']),
      D: asString(o['D']),
    };
  }
  return vacias;
}

/** Shape de UI para las respuestas de este endpoint. */
function aRespuesta(id: string, data: Record<string, unknown>) {
  return { id, ...data, opciones: normalizarOpciones(data['opciones']) };
}

/** Campos que faltan para poder marcar la pregunta como aprobada. */
function faltantesParaAprobar(doc: Record<string, unknown>): string[] {
  const faltantes: string[] = [];
  if (!asString(doc['pregunta']).trim()) faltantes.push('pregunta');
  const o = normalizarOpciones(doc['opciones']);
  const letras = ['A', 'B', 'C', 'D'] as const;
  for (const l of letras) {
    if (!o[l].trim()) faltantes.push(`opcion_${l.toLowerCase()}`);
  }
  const resp = asString(doc['respuesta_correcta']).trim().toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(resp)) {
    faltantes.push('respuesta_correcta');
  }
  return faltantes;
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'ID requerido' });

  const snap = await getAdminDb().collection(COLECCION_QUESTIONS).doc(id).get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Pregunta no encontrada' });
  }
  return res.status(200).json({
    success: true,
    pregunta: aRespuesta(snap.id, snap.data() as Record<string, unknown>),
  });
}

const CAMPOS_EDITABLES = [
  'area',
  'subtema',
  'dificultad',
  'pregunta',
  'opciones',
  'respuesta_correcta',
  'explicacion',
  'competencia',
  'contexto',
  'texto_base',
  'tipo_texto',
  'fuente',
  'tipo_fuente',
  'es_original',
  'verificada',
  'estado',
] as const;

async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'ID requerido' });

  const ref = getAdminDb().collection(COLECCION_QUESTIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Pregunta no encontrada' });
  }

  const body =
    typeof req.body === 'string'
      ? (JSON.parse(req.body) as Record<string, unknown>)
      : (req.body as Record<string, unknown>);

  const actual = { ...(snap.data() as Record<string, unknown>) };
  const cambios: Record<string, unknown> = {};

  for (const campo of CAMPOS_EDITABLES) {
    if (!(campo in body)) continue;
    const valor = body[campo];
    switch (campo) {
      case 'opciones': {
        if (typeof valor !== 'object' || valor === null) {
          return res.status(400).json({ error: 'opciones debe ser un objeto' });
        }
        const o = normalizarOpciones(valor);
        // Firestore guarda lista [A, B, C, D] (así la lee la app móvil).
        cambios['opciones'] = [o.A, o.B, o.C, o.D];
        break;
      }
      case 'respuesta_correcta': {
        if (valor === null || valor === '') {
          cambios['respuesta_correcta'] = null;
        } else if (typeof valor === 'string') {
          cambios['respuesta_correcta'] = valor.trim().toUpperCase();
        } else {
          return res.status(400).json({ error: 'respuesta_correcta inválida' });
        }
        break;
      }
      case 'dificultad': {
        if (typeof valor !== 'string') {
          return res.status(400).json({ error: 'dificultad inválida' });
        }
        cambios['dificultad'] = valor.trim().toLowerCase();
        break;
      }
      case 'es_original':
      case 'verificada': {
        cambios[campo] = valor === true;
        break;
      }
      case 'estado': {
        if (!esEstado(valor)) {
          return res.status(400).json({
            error: 'estado debe ser aprobado, pendiente o deshabilitado',
          });
        }
        cambios['estado'] = valor;
        break;
      }
      default: {
        cambios[campo] = typeof valor === 'string' ? valor : valor;
      }
    }
  }

  const resultante = { ...actual, ...cambios };
  const estadoFinal = resultante['estado'];
  if (estadoFinal === 'aprobado') {
    const faltantes = faltantesParaAprobar(resultante);
    if (faltantes.length > 0) {
      return res.status(400).json({
        error: `No se puede aprobar: faltan ${faltantes.join(', ')}`,
        faltantes,
      });
    }
  }

  cambios['metadatos'] = {
    ...((actual['metadatos'] as Record<string, unknown> | undefined) ?? {}),
    fechaActualizacion: new Date().toISOString(),
    actualizadoPor: 'admin-panel',
  };

  await ref.set(cambios, { merge: true });
  const actualizado = await ref.get();
  const datos = actualizado.data() as Record<string, unknown> | undefined;
  return res.status(200).json({
    success: true,
    mensaje: 'Pregunta actualizada correctamente.',
    pregunta: aRespuesta(actualizado.id, datos ?? {}),
  });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'ID requerido' });

  const ref = getAdminDb().collection(COLECCION_QUESTIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Pregunta no encontrada' });
  }

  await ref.set(
    {
      estado: 'deshabilitado',
      metadatos: {
        ...((snap.data()?.['metadatos'] as Record<string, unknown> | undefined) ?? {}),
        fechaActualizacion: new Date().toISOString(),
        actualizadoPor: 'admin-panel',
      },
    },
    { merge: true },
  );
  const actualizado = await ref.get();
  const datos = actualizado.data() as Record<string, unknown> | undefined;
  return res.status(200).json({
    success: true,
    mensaje: 'Pregunta deshabilitada (borrado lógico).',
    pregunta: aRespuesta(actualizado.id, datos ?? {}),
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
    if (req.method === 'PUT') return await handlePut(req, res);
    if (req.method === 'DELETE') return await handleDelete(req, res);
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('Error en /api/questions/[id]:', error);
    const message =
      error instanceof Error ? error.message : 'Error interno';
    return res.status(500).json({ error: message });
  }
}
