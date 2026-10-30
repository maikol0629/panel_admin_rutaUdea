/**
 * /api/questions/[id]
 *
 * GET    — Pregunta normalizada del banco v2 (o legacy con `?banco=legacy`,
 *          solo lectura).
 * PUT    — Actualiza campos con lista blanca o ejecuta una acción de
 *          revisión (`aprobar`, `pendiente`, `rechazar`, `cuarentena`).
 * DELETE — Borrado lógico con motivo obligatorio (nunca borra el documento).
 *
 * Reglas de la Fase 7:
 * - La edición nunca borra campos desconocidos: solo se escriben las claves
 *   enviadas (`set(..., { merge: true })`).
 * - Aprobar exige contrato completo (taxonomía, opciones, respuesta,
 *   verificación e imágenes con URL) y firma `revisado_por` + fecha.
 * - El banco legacy `questions` no se puede modificar desde el panel.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_QUESTIONS,
  COLECCION_QUESTIONS_LEGACY,
  getAdminDb,
  requireAdmin,
  type AdminIdentity,
} from '@/lib/firebase-admin';
import {
  faltantesParaPublicar,
  normalizarImagenes,
  normalizarOpciones,
  normalizarPregunta,
} from '@/lib/bank';

function getId(req: NextApiRequest): string {
  const v = req.query['id'];
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function bancoDeQuery(req: NextApiRequest): 'v2' | 'legacy' {
  const v = req.query['banco'];
  const raw = Array.isArray(v) ? v[0] : v;
  return raw === 'legacy' ? 'legacy' : 'v2';
}

function leerCuerpo(req: NextApiRequest): Record<string, unknown> {
  return typeof req.body === 'string'
    ? (JSON.parse(req.body) as Record<string, unknown>)
    : ((req.body ?? {}) as Record<string, unknown>);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function coleccionDe(banco: 'v2' | 'legacy'): string {
  return banco === 'legacy' ? COLECCION_QUESTIONS_LEGACY : COLECCION_QUESTIONS;
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'ID requerido' });
  const banco = bancoDeQuery(req);

  const snap = await getAdminDb().collection(coleccionDe(banco)).doc(id).get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Pregunta no encontrada' });
  }
  const pregunta = normalizarPregunta(snap.id, snap.data() as Record<string, unknown>);
  return res.status(200).json({
    success: true,
    banco,
    soloLectura: banco === 'legacy',
    pregunta,
  });
}

/** Campos editables del contrato v2 (lista blanca). */
const CAMPOS_EDITABLES = [
  'area',
  'componente',
  'subtema',
  'subtema_origen',
  'dificultad',
  'tipo',
  'tarea',
  'numero',
  'pregunta',
  'opciones',
  'respuesta_correcta',
  'explicacion',
  'texto_base',
  'contexto',
  'contexto_ids',
  'fuente',
  'tipo_fuente',
  'imagen_url',
  'imagenes',
  'requiere_imagen',
  'opciones_en_imagen',
  'verificada',
  'confianza_modelo',
  'modelo_extraccion',
  'revisado_por',
  'fecha_revision',
  'notas',
  'duplicado',
  'metadatos',
] as const;

function limpiarTexto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio ? limpio : null;
}

function combinarNotas(actuales: unknown, motivo: string): string {
  const previas = asString(actuales).trim();
  const firma = `[panel ${new Date().toISOString()}] ${motivo}`;
  return previas ? `${previas} | ${firma}` : firma;
}

async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  identidad: AdminIdentity,
) {
  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'ID requerido' });
  if (bancoDeQuery(req) === 'legacy') {
    return res.status(403).json({
      error: 'El banco legacy está congelado y es solo lectura. Use questions_v2.',
    });
  }

  const ref = getAdminDb().collection(COLECCION_QUESTIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Pregunta no encontrada' });
  }

  const body = leerCuerpo(req);
  const actual = (snap.data() ?? {}) as Record<string, unknown>;
  const cambios: Record<string, unknown> = {};
  let accion = asString(body['accion']).toLowerCase();
  // Una acción explícita (botón Aprobar/Deshabilitar) implica que la persona
  // firma la revisión; el formulario, en cambio, envía `verificada` y no debe
  // forzarse.
  const accionExplicita = Boolean(accion);
  const ahora = new Date().toISOString();

  // Desde el formulario el estado llega como campo, no como acción. Se
  // traduce a la acción equivalente para no saltarse las validaciones, pero
  // solo si el estado cambia: guardar otros campos de una pregunta ya
  // deshabilitada no debe exigir un motivo nuevo.
  const estadoSolicitado = asString(body['estado']).toLowerCase();
  const estadoActual = asString(actual['estado'], 'pendiente').toLowerCase();
  if (!accion && estadoSolicitado && estadoSolicitado !== estadoActual) {
    if (estadoSolicitado === 'aprobado' || estadoSolicitado === 'aprobado_con_imagen') {
      accion = 'aprobar';
    } else if (estadoSolicitado === 'pendiente') {
      accion = 'pendiente';
    } else if (estadoSolicitado === 'deshabilitado') {
      accion = 'deshabilitar';
    } else {
      return res.status(400).json({ error: `Estado desconocido: ${estadoSolicitado}` });
    }
  }
  const revisor =
    limpiarTexto(body['revisado_por']) ?? limpiarTexto(identidad.nombre) ?? 'admin-panel';

  for (const campo of CAMPOS_EDITABLES) {
    if (!(campo in body)) continue;
    const valor = body[campo];
    switch (campo) {
      case 'opciones': {
        if (typeof valor !== 'object' || valor === null) {
          return res.status(400).json({ error: 'opciones debe ser un objeto' });
        }
        cambios['opciones'] = normalizarOpciones(valor);
        break;
      }
      case 'imagenes': {
        if (!Array.isArray(valor)) {
          return res.status(400).json({ error: 'imagenes debe ser una lista' });
        }
        cambios['imagenes'] = normalizarImagenes(valor);
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
      case 'numero': {
        cambios['numero'] = typeof valor === 'number' ? valor : null;
        break;
      }
      case 'verificada':
      case 'requiere_imagen':
      case 'opciones_en_imagen':
      case 'duplicado': {
        cambios[campo] = valor === true;
        break;
      }
      case 'contexto_ids': {
        cambios['contexto_ids'] = Array.isArray(valor)
          ? valor.filter((x): x is string => typeof x === 'string' && x.length > 0)
          : [];
        break;
      }
      case 'metadatos': {
        cambios['metadatos'] = {
          ...((actual['metadatos'] as Record<string, unknown> | undefined) ?? {}),
          ...(typeof valor === 'object' && valor !== null
            ? (valor as Record<string, unknown>)
            : {}),
        };
        break;
      }
      default: {
        cambios[campo] = typeof valor === 'string' ? valor : valor;
      }
    }
  }

  // Acciones explícitas de revisión (cola del panel).
  if (accion) {
    const motivo = limpiarTexto(body['motivo']);
    if (accion === 'aprobar') {
      cambios['estado'] =
        body['estado'] === 'aprobado_con_imagen' ? 'aprobado_con_imagen' : 'aprobado';
      if (accionExplicita) cambios['verificada'] = true;
      cambios['revisado_por'] = revisor;
      cambios['fecha_revision'] = ahora;
    } else if (accion === 'pendiente') {
      cambios['estado'] = 'pendiente';
      cambios['revisado_por'] = revisor;
      cambios['fecha_revision'] = ahora;
    } else if (
      accion === 'rechazar' ||
      accion === 'cuarentena' ||
      accion === 'deshabilitar'
    ) {
      if (!motivo) {
        return res.status(400).json({
          error:
            'El motivo es obligatorio para rechazar, poner en cuarentena o deshabilitar.',
        });
      }
      cambios['estado'] = 'deshabilitado';
      cambios['notas'] = combinarNotas(actual['notas'], motivo);
      cambios['revisado_por'] = revisor;
      cambios['fecha_revision'] = ahora;
    } else {
      return res.status(400).json({ error: `Acción desconocida: ${accion}` });
    }
  }

  const resultante = { ...actual, ...cambios };
  const estadoFinal = asString(resultante['estado']);
  if (estadoFinal === 'aprobado' || estadoFinal === 'aprobado_con_imagen') {
    const validada = normalizarPregunta(id, resultante);
    const faltantes = faltantesParaPublicar({ ...validada, estado: estadoFinal });
    if (faltantes.length > 0) {
      return res.status(400).json({
        error: `No se puede publicar: faltan ${faltantes.join(', ')}`,
        faltantes,
      });
    }
    // La promoción automática refleja si la pregunta requiere figura.
    if (validada.requiere_imagen || validada.imagenes.length > 0) {
      cambios['estado'] = 'aprobado_con_imagen';
    } else if (!accion) {
      cambios['estado'] = 'aprobado';
    }
  }

  cambios['updated_at'] = ahora;
  cambios['metadatos'] = {
    ...((resultante['metadatos'] as Record<string, unknown> | undefined) ?? {}),
    fechaActualizacion: ahora,
    actualizadoPor: revisor,
  };

  // Merge: las claves no enviadas (incluidas las desconocidas) se conservan.
  await ref.set(cambios, { merge: true });
  const actualizado = await ref.get();
  const datos = (actualizado.data() ?? {}) as Record<string, unknown>;
  return res.status(200).json({
    success: true,
    mensaje: accion
      ? `Acción "${accion}" aplicada.`
      : 'Pregunta actualizada correctamente.',
    pregunta: normalizarPregunta(actualizado.id, datos),
  });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  identidad: AdminIdentity,
) {
  const id = getId(req);
  if (!id) return res.status(400).json({ error: 'ID requerido' });
  if (bancoDeQuery(req) === 'legacy') {
    return res.status(403).json({
      error: 'El banco legacy está congelado y es solo lectura.',
    });
  }

  const body = leerCuerpo(req);
  const motivo = limpiarTexto(body['motivo']);
  if (!motivo) {
    return res.status(400).json({
      error: 'El motivo es obligatorio para deshabilitar una pregunta.',
    });
  }

  const ref = getAdminDb().collection(COLECCION_QUESTIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Pregunta no encontrada' });
  }

  const actual = (snap.data() ?? {}) as Record<string, unknown>;
  const ahora = new Date().toISOString();
  const revisor = limpiarTexto(identidad.nombre) ?? 'admin-panel';
  await ref.set(
    {
      estado: 'deshabilitado',
      notas: combinarNotas(actual['notas'], motivo),
      revisado_por: revisor,
      fecha_revision: ahora,
      updated_at: ahora,
      metadatos: {
        ...((actual['metadatos'] as Record<string, unknown> | undefined) ?? {}),
        fechaActualizacion: ahora,
        actualizadoPor: revisor,
      },
    },
    { merge: true },
  );
  const actualizado = await ref.get();
  return res.status(200).json({
    success: true,
    mensaje: 'Pregunta deshabilitada (borrado lógico).',
    pregunta: normalizarPregunta(
      actualizado.id,
      (actualizado.data() ?? {}) as Record<string, unknown>,
    ),
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let identidad: AdminIdentity;
  try {
    identidad = await requireAdmin(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de autenticación';
    return res.status(adminErrorStatus(error)).json({ error: message });
  }

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'PUT') return await handlePut(req, res, identidad);
    if (req.method === 'DELETE') return await handleDelete(req, res, identidad);
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('Error en /api/questions/[id]:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return res.status(500).json({ error: message });
  }
}
