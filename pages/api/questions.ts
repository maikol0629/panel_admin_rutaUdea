/**
 * /api/questions
 *
 * GET  — Listado del banco v2 (`questions_v2`) con filtros por versión,
 *        estado, área, subtema, dificultad, confianza, tarea, imágenes,
 *        búsqueda y paginación. `?banco=legacy` lee el banco viejo
 *        (`questions`) en modo solo lectura para rollback.
 * POST — Crea una pregunta en `questions_v2` con estado "pendiente".
 *
 * El filtrado/orden se hace en memoria (máximo 2000 docs) para no exigir
 * índices compuestos. El contrato vive en `lib/bank.ts`.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_QUESTIONS,
  COLECCION_QUESTIONS_LEGACY,
  getAdminDb,
  requireAdmin,
} from '@/lib/firebase-admin';
import {
  BANK_VERSION_DEFAULT,
  SCHEMA_VERSION,
  esComponenteValido,
  normalizarPregunta,
  resumenBanco,
  type PreguntaV2,
} from '@/lib/bank';

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

function esIncompleta(p: PreguntaV2): boolean {
  if (!p.pregunta.trim()) return true;
  const letras = ['A', 'B', 'C', 'D'] as const;
  if (letras.some((l) => !p.opciones[l].trim())) return true;
  return !['A', 'B', 'C', 'D'].includes(p.respuesta_correcta ?? '');
}

function bancoDeQuery(req: NextApiRequest): 'v2' | 'legacy' {
  return queryParam(req.query, 'banco') === 'legacy' ? 'legacy' : 'v2';
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const banco = bancoDeQuery(req);
  const coleccion = banco === 'legacy' ? COLECCION_QUESTIONS_LEGACY : COLECCION_QUESTIONS;

  const area = queryParam(req.query, 'area');
  const subtema = queryParam(req.query, 'subtema');
  const dificultad = queryParam(req.query, 'dificultad');
  const estado = queryParam(req.query, 'estado');
  const bankVersion = queryParam(req.query, 'bank_version');
  const confianza = queryParam(req.query, 'confianza');
  const tarea = queryParam(req.query, 'tarea');
  const search = queryParam(req.query, 'search').trim().toLowerCase();
  const idFiltro = queryParam(req.query, 'id').trim().toLowerCase();
  const incompletas = queryParam(req.query, 'incompletas') === 'true';
  const conImagen = queryParam(req.query, 'con_imagen') === 'true';
  const opcionesEnImagen = queryParam(req.query, 'opciones_en_imagen') === 'true';
  const orderBy = queryParam(req.query, 'orderBy') || 'id';
  const orderDir = queryParam(req.query, 'orderDir') === 'desc' ? 'desc' : 'asc';
  const limitRaw = parseInt(queryParam(req.query, 'limit') || '20', 10);
  const pageRaw = parseInt(queryParam(req.query, 'page') || '1', 10);
  const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 20 : limitRaw, 1), 100);
  const page = Math.max(Number.isNaN(pageRaw) ? 1 : pageRaw, 1);

  const snapshot = await getAdminDb().collection(coleccion).limit(MAX_DOCS).get();

  let preguntas = snapshot.docs
    .map((doc) => normalizarPregunta(doc.id, doc.data() as Record<string, unknown>))
    // Descarta documentos sin la forma mínima (los rechazos del banco sucio).
    .filter((p) => Boolean(p.area) && Boolean(p.pregunta));

  if (area) preguntas = preguntas.filter((p) => p.area === area);
  if (subtema) preguntas = preguntas.filter((p) => p.subtema === subtema);
  if (dificultad) preguntas = preguntas.filter((p) => p.dificultad === dificultad);
  if (estado) preguntas = preguntas.filter((p) => p.estado === estado);
  if (bankVersion) {
    preguntas = preguntas.filter((p) => p.bank_version === bankVersion);
  }
  if (confianza) {
    preguntas = preguntas.filter(
      (p) => (p.confianza_modelo ?? 'sin_definir') === confianza,
    );
  }
  if (tarea) preguntas = preguntas.filter((p) => p.tarea === tarea);
  if (conImagen) {
    preguntas = preguntas.filter((p) => p.imagenes.length > 0 || Boolean(p.imagen_url));
  }
  if (opcionesEnImagen) {
    preguntas = preguntas.filter((p) => p.opciones_en_imagen);
  }
  if (search) {
    preguntas = preguntas.filter(
      (p) =>
        p.pregunta.toLowerCase().includes(search) || p.id.toLowerCase().includes(search),
    );
  }
  if (idFiltro) {
    preguntas = preguntas.filter((p) => p.id.toLowerCase().includes(idFiltro));
  }

  const totalIncompletas = preguntas.filter(esIncompleta).length;
  if (incompletas) preguntas = preguntas.filter(esIncompleta);

  const ordenables = new Set([
    'id',
    'area',
    'componente',
    'subtema',
    'dificultad',
    'pregunta',
    'estado',
    'bank_version',
    'tarea',
    'numero',
    'confianza_modelo',
  ]);
  const campo = ordenables.has(orderBy) ? orderBy : 'id';
  preguntas.sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[campo] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[campo] ?? '');
    const cmp = aVal.localeCompare(bVal, 'es', { numeric: true });
    return orderDir === 'asc' ? cmp : -cmp;
  });

  const total = preguntas.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pagina = Math.min(page, totalPages);
  const inicio = (pagina - 1) * limit;
  const lote = preguntas.slice(inicio, inicio + limit);

  const resumen = resumenBanco(preguntas);

  return res.status(200).json({
    success: true,
    banco,
    soloLectura: banco === 'legacy',
    preguntas: lote,
    total,
    totalIncompletas,
    resumen,
    page: pagina,
    pageSize: limit,
    totalPages,
    hasMore: pagina < totalPages,
    orderBy: campo,
    orderDir,
    nextCursor: pagina < totalPages ? String(pagina + 1) : null,
  });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const body = leerCuerpo(req);
  const p = normalizarPregunta(asString(body['id']) || `T9-P${Date.now()}`, body);

  if (!p.area || !p.pregunta.trim()) {
    return res.status(400).json({
      error: 'Estructura de pregunta inválida: faltan área o enunciado.',
    });
  }
  if (p.subtema && !esComponenteValido(p.subtema)) {
    return res.status(400).json({
      error: 'Subtema inválido: use la taxonomía oficial RL01–RL18 / CL01–CL14.',
    });
  }

  const ahora = new Date().toISOString();
  const version = p.bank_version || BANK_VERSION_DEFAULT;
  const documento = {
    ...body,
    id: p.id,
    bank_version: version,
    schema_version: SCHEMA_VERSION,
    area: p.area,
    componente: p.componente,
    subtema: p.subtema,
    dificultad: p.dificultad,
    pregunta: p.pregunta,
    // El contrato canónico guarda opciones como objeto.
    opciones: p.opciones,
    respuesta_correcta: p.respuesta_correcta,
    explicacion: p.explicacion,
    texto_base: p.texto_base,
    contexto: p.contexto,
    contexto_ids: p.contexto_ids,
    fuente: p.fuente,
    tipo_fuente: p.tipo_fuente,
    imagen_url: p.imagen_url,
    imagenes: p.imagenes,
    requiere_imagen: p.requiere_imagen,
    opciones_en_imagen: p.opciones_en_imagen,
    // Toda pregunta nueva entra pendiente de revisión (D-08).
    estado: 'pendiente',
    verificada: false,
    confianza_modelo: p.confianza_modelo,
    tarea: p.tarea,
    numero: p.numero,
    created_at: asString(body['created_at']) || ahora,
    updated_at: ahora,
  };

  await getAdminDb().collection(COLECCION_QUESTIONS).doc(p.id).set(documento, {
    merge: true,
  });

  return res.status(200).json({
    success: true,
    pregunta: normalizarPregunta(p.id, documento),
    mensaje: 'Pregunta creada en questions_v2 con estado "pendiente".',
  });
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
    if (req.method === 'POST') return await handlePost(req, res);
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('Error en /api/questions:', error);
    const message =
      error instanceof Error ? error.message : 'Error interno al procesar preguntas';
    return res.status(500).json({ error: message });
  }
}
