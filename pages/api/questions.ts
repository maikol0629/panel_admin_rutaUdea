/**
 * /api/questions
 *
 * GET  — Listado con filtros (area, subtema, dificultad, estado),
 *        búsqueda textual, ordenamiento y paginación por página.
 * POST — Crear una pregunta con estado "pendiente" para revisión admin.
 *
 * Nota: el filtrado/orden se hace en memoria sobre la colección para no
 * exigir índices compuestos de Firestore. Límite de lectura: 2000 docs.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_QUESTIONS,
  getAdminDb,
  requireAdmin,
} from '@/lib/firebase-admin';

const MAX_DOCS = 2000;

interface Opciones {
  A: string;
  B: string;
  C: string;
  D: string;
}

/**
 * Firestore guarda `opciones` como LISTA [A, B, C, D] (así la lee la app
 * móvil); el asset JSONL y la UI del panel la usan como OBJETO {A..D}.
 * Normaliza ambas formas a objeto para trabajar siempre con lo mismo.
 */
function normalizarOpciones(raw: unknown): Opciones {
  const vacias: Opciones = { A: '', B: '', C: '', D: '' };
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

/** Convierte el shape de UI (objeto) al shape de Firestore (lista). */
function aLista(opciones: Opciones): string[] {
  return [opciones.A, opciones.B, opciones.C, opciones.D];
}

interface PreguntaFirestore {
  id: string;
  area: string;
  componente: string;
  subtema: string;
  competencia?: string;
  tipo_texto?: string;
  dificultad: string;
  contexto?: string;
  pregunta: string;
  opciones: Opciones;
  /** null = sin definir (el banco real tiene casos así). */
  respuesta_correcta: string | null;
  explicacion?: string;
  fuente?: string;
  tipo_fuente?: string;
  es_original?: boolean;
  verificada?: boolean;
  duplicado?: boolean;
  estado: 'aprobado' | 'pendiente' | 'deshabilitado';
  metadatos?: {
    fechaCreacion: string;
    creadoPor: string;
  };
}

function esRespuestaValida(resp: unknown): resp is keyof Opciones {
  return resp === 'A' || resp === 'B' || resp === 'C' || resp === 'D';
}

/** Respuesta ausente (banco sucio): null, undefined o cadena vacía. */
function esRespuestaAusente(resp: unknown): boolean {
  return resp === null || resp === undefined || resp === '';
}

// Estructura mínima: admite registros incompletos del banco sucio
// (respuesta ausente, opciones vacías): existen en el banco pero no sirven
// para simulacros hasta completarlos. Lo que NO se admite es forma rota
// (sin id, sin opciones con 4 entradas, respuesta con valor inválido).
function esPreguntaValida(p: unknown): p is PreguntaFirestore {
  if (typeof p !== 'object' || p === null) return false;
  const q = p as Record<string, unknown>;
  if (
    typeof q['id'] !== 'string' ||
    typeof q['area'] !== 'string' ||
    typeof q['componente'] !== 'string' ||
    typeof q['subtema'] !== 'string' ||
    typeof q['dificultad'] !== 'string' ||
    typeof q['pregunta'] !== 'string' ||
    typeof q['opciones'] !== 'object' ||
    q['opciones'] === null ||
    (!esRespuestaValida(q['respuesta_correcta']) &&
      !esRespuestaAusente(q['respuesta_correcta'])) ||
    typeof q['estado'] !== 'string'
  ) {
    return false;
  }
  const opciones = q['opciones'];
  const formaOk =
    (Array.isArray(opciones) && opciones.length === 4) ||
    (typeof opciones === 'object' &&
      opciones !== null &&
      ['A', 'B', 'C', 'D'].every(
        (l) => l in (opciones as Record<string, unknown>),
      ));
  if (!formaOk) return false;
  return ['aprobado', 'pendiente', 'deshabilitado'].includes(
    q['estado'] as string,
  );
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function queryParam(
  query: NextApiRequest['query'],
  nombre: string,
): string {
  const v = query[nombre];
  if (Array.isArray(v)) return asString(v[0]);
  return asString(v);
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const area = queryParam(req.query, 'area');
  const subtema = queryParam(req.query, 'subtema');
  const dificultad = queryParam(req.query, 'dificultad');
  const estado = queryParam(req.query, 'estado');
  const search = queryParam(req.query, 'search').trim().toLowerCase();
  const idFiltro = queryParam(req.query, 'id').trim().toLowerCase();
  const incompletas = queryParam(req.query, 'incompletas') === 'true';
  const orderBy = queryParam(req.query, 'orderBy') || 'id';
  const orderDir = queryParam(req.query, 'orderDir') === 'desc' ? 'desc' : 'asc';
  const limitRaw = parseInt(queryParam(req.query, 'limit') || '20', 10);
  const pageRaw = parseInt(queryParam(req.query, 'page') || '1', 10);
  const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 20 : limitRaw, 1), 100);
  const page = Math.max(Number.isNaN(pageRaw) ? 1 : pageRaw, 1);

  const snapshot = await getAdminDb()
    .collection(COLECCION_QUESTIONS)
    .limit(MAX_DOCS)
    .get();

  // Normaliza opciones (lista Firestore ↔ objeto UI) ANTES de filtrar,
  // para que ningún shape rompa los filtros con `.trim()` sobre undefined.
  let preguntas = snapshot.docs
    .map((doc) => {
      const raw = { id: doc.id, ...doc.data() } as PreguntaFirestore & {
        opciones: unknown;
      };
      raw.opciones = normalizarOpciones(raw.opciones);
      return raw as PreguntaFirestore;
    })
    .filter(esPreguntaValida);

  if (area) preguntas = preguntas.filter((p) => p.area === area);
  if (subtema) preguntas = preguntas.filter((p) => p.subtema === subtema);
  if (dificultad) preguntas = preguntas.filter((p) => p.dificultad === dificultad);
  if (estado) preguntas = preguntas.filter((p) => p.estado === estado);
  if (search) {
    preguntas = preguntas.filter((p) =>
      p.pregunta.toLowerCase().includes(search),
    );
  }
  // Filtro por ID (coincidencia parcial, insensible a mayúsculas).
  if (idFiltro) {
    preguntas = preguntas.filter((p) =>
      p.id.toLowerCase().includes(idFiltro),
    );
  }

  // Incompleta = sin enunciado, alguna opción vacía o sin respuesta A–D.
  // (Aplica DESPUÉS del filtro de validez estructural: estos docs existen
  // en el banco pero no sirven para simulacros hasta completarlos.)
  const esIncompleta = (p: PreguntaFirestore): boolean => {
    if (!p.pregunta.trim()) return true;
    const letras = ['A', 'B', 'C', 'D'] as const;
    if (letras.some((l) => !p.opciones[l].trim())) return true;
    return p.respuesta_correcta === null || !['A', 'B', 'C', 'D'].includes(p.respuesta_correcta);
  };
  const totalIncompletas = preguntas.filter(esIncompleta).length;
  if (incompletas) {
    preguntas = preguntas.filter(esIncompleta);
  }

  const ordenables = new Set(['id', 'area', 'componente', 'subtema', 'dificultad', 'pregunta', 'estado']);
  const campo = ordenables.has(orderBy) ? orderBy : 'id';
  preguntas.sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[campo] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[campo] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return orderDir === 'asc' ? cmp : -cmp;
  });

  const total = preguntas.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pagina = Math.min(page, totalPages);
  const inicio = (pagina - 1) * limit;
  const lote = preguntas.slice(inicio, inicio + limit);

  return res.status(200).json({
    success: true,
    preguntas: lote,
    total,
    totalIncompletas,
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
  const body =
    typeof req.body === 'string'
      ? (JSON.parse(req.body) as Record<string, unknown>)
      : (req.body as Record<string, unknown>);

  if (!esPreguntaValida(body)) {
    return res.status(400).json({
      error: 'Estructura de pregunta inválida. Revise los campos obligatorios.',
    });
  }

  const opcionesEntrada = body.opciones as unknown as Record<string, unknown>;
  const opcionesObj: Opciones = {
    A: asString(opcionesEntrada['A']),
    B: asString(opcionesEntrada['B']),
    C: asString(opcionesEntrada['C']),
    D: asString(opcionesEntrada['D']),
  };
  const respRaw = body.respuesta_correcta;
  const pregunta = {
    id:
      asString(body.id) ||
      `pregunta_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    area: asString(body.area),
    componente: asString(body.componente),
    subtema: asString(body.subtema),
    competencia: asString(body.competencia) || undefined,
    tipo_texto: asString(body.tipo_texto) || undefined,
    dificultad: asString(body.dificultad),
    contexto: asString(body.contexto) || undefined,
    pregunta: asString(body.pregunta),
    // Firestore guarda lista [A, B, C, D] (así la lee la app móvil).
    opciones: aLista(opcionesObj),
    respuesta_correcta:
      typeof respRaw === 'string' && respRaw.trim()
        ? respRaw.trim().toUpperCase()
        : null,
    explicacion: asString(body.explicacion) || undefined,
    fuente: asString(body.fuente) || undefined,
    tipo_fuente: asString(body.tipo_fuente) || undefined,
    es_original: body.es_original === true,
    verificada: body.verificada === true,
    duplicado: body.duplicado === true,
    estado: 'pendiente',
    metadatos: {
      fechaCreacion: new Date().toISOString(),
      creadoPor: 'admin-panel',
    },
  };

  await getAdminDb()
    .collection(COLECCION_QUESTIONS)
    .doc(pregunta.id)
    .set(pregunta);

  return res.status(200).json({
    success: true,
    // Respuesta en shape de UI (objeto); en Firestore quedó como lista.
    pregunta: { ...pregunta, opciones: opcionesObj },
    mensaje:
      'Pregunta creada con estado "pendiente" para revisión del administrador.',
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
    console.error('Error en /api/questions:', error);
    const message =
      error instanceof Error ? error.message : 'Error interno al procesar preguntas';
    return res.status(500).json({ error: message });
  }
}
