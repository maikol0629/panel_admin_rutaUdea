/**
 * /api/reportesPreguntas
 *
 * Gestión general de los reportes de inconsistencia de preguntas que los
 * aspirantes envían desde la app móvil (simulacro o práctica).
 *
 * Los reportes viven en Firestore colección `reportesPreguntas` y llegan
 * con estado `pendiente`. Desde este endpoint el admin puede:
 *
 *   GET    — Listar reportes con filtros (estado, modo, motivo, búsqueda)
 *            y paginación. Ordenados por fecha descendente.
 *   PATCH  — Cambiar el estado de un reporte a `revisado` o `descartado`,
 *            opcionalmente con notas del admin. Registra quién lo revisó y
 *            cuándo.
 *
 * Requiere rol `admin` o `superadmin` (cualquier admin puede revisar
 * reportes; no hace falta ser superadmin).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { adminErrorStatus, getAdminDb, requireAdmin } from '@/lib/firebase-admin';

// Nombre de la colección de reportes (mismo contrato que la app móvil).
const COLECCION_REPORTES = 'reportesPreguntas';

interface ReportePregunta {
  id: string;
  uid: string;
  questionId: string;
  motivo: string;
  comentario: string;
  modo: 'simulacro' | 'practica';
  sesionId: string;
  area: string;
  subtema: string;
  bancoVersion?: string | null;
  respuestaUsuario?: string | null;
  respuestaCorrecta?: string | null;
  fechaMs: number;
  appVersionCode: number;
  estado: 'pendiente' | 'revisado' | 'descartado';
  revisadoPor?: string | null;
  fechaRevision?: string | null;
  notasAdmin?: string | null;
}

interface ListadoResponse {
  success: boolean;
  reportes?: ReportePregunta[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  error?: string;
}

const ESTADOS_VALIDOS = ['pendiente', 'revisado', 'descartado'] as const;
const MODOS_VALIDOS = ['simulacro', 'practica'] as const;

function esEstadoValido(e: string): e is 'pendiente' | 'revisado' | 'descartado' {
  return ESTADOS_VALIDOS.includes(e as 'pendiente' | 'revisado' | 'descartado');
}

/**
 * Trae todos los documentos de la colección y aplica filtros/orden/paginación
 * en memoria. El volumen de reportes de usuarios es bajo comparado con el
 * banco de preguntas, por lo que evita depender de índices compuestos de
 * Firestore que aún no se hayan desplegado.
 */
async function listarReportes(
  db: ReturnType<typeof getAdminDb>,
  filtros: {
    estado?: string;
    modo?: string;
    motivo?: string;
    q?: string;
    page: number;
    limit: number;
    orderBy?: string;
    orderDir?: 'asc' | 'desc';
  },
): Promise<{
  reportes: ReportePregunta[];
  total: number;
  totalPages: number;
}> {
  const snap = await db.collection(COLECCION_REPORTES).get();
  let reportes: ReportePregunta[] = snap.docs.map((doc) => {
    const data = doc.data() ?? {};
    return {
      id: doc.id,
      uid: typeof data.uid === 'string' ? data.uid : '',
      questionId: typeof data.questionId === 'string' ? data.questionId : '',
      motivo: typeof data.motivo === 'string' ? data.motivo : 'otra',
      comentario: typeof data.comentario === 'string' ? data.comentario : '',
      modo: MODOS_VALIDOS.includes(data.modo as 'simulacro' | 'practica')
        ? (data.modo as 'simulacro' | 'practica')
        : 'practica',
      sesionId: typeof data.sesionId === 'string' ? data.sesionId : '',
      area: typeof data.area === 'string' ? data.area : '',
      subtema: typeof data.subtema === 'string' ? data.subtema : '',
      bancoVersion: typeof data.bancoVersion === 'string' ? data.bancoVersion : null,
      respuestaUsuario:
        typeof data.respuestaUsuario === 'string' ? data.respuestaUsuario : null,
      respuestaCorrecta:
        typeof data.respuestaCorrecta === 'string' ? data.respuestaCorrecta : null,
      fechaMs: typeof data.fechaMs === 'number' ? data.fechaMs : 0,
      appVersionCode: typeof data.appVersionCode === 'number' ? data.appVersionCode : 0,
      estado: esEstadoValido(typeof data.estado === 'string' ? data.estado : 'pendiente')
        ? (data.estado as 'pendiente' | 'revisado' | 'descartado')
        : 'pendiente',
      revisadoPor: typeof data.revisadoPor === 'string' ? data.revisadoPor : null,
      fechaRevision: typeof data.fechaRevision === 'string' ? data.fechaRevision : null,
      notasAdmin: typeof data.notasAdmin === 'string' ? data.notasAdmin : null,
    };
  });

  // Filtros.
  if (filtros.estado) {
    reportes = reportes.filter((r) => r.estado === filtros.estado);
  }
  if (filtros.modo) {
    reportes = reportes.filter((r) => r.modo === filtros.modo);
  }
  if (filtros.motivo) {
    reportes = reportes.filter((r) => r.motivo === filtros.motivo);
  }
  if (filtros.q) {
    const termino = filtros.q.toLowerCase();
    reportes = reportes.filter(
      (r) =>
        r.questionId.toLowerCase().includes(termino) ||
        r.comentario.toLowerCase().includes(termino) ||
        r.uid.toLowerCase().includes(termino) ||
        r.area.toLowerCase().includes(termino) ||
        r.subtema.toLowerCase().includes(termino) ||
        r.sesionId.toLowerCase().includes(termino),
    );
  }

  const total = reportes.length;

  // Orden.
  reportes.sort((a, b) => {
    if (filtros.orderBy === 'fechaMs') {
      return filtros.orderDir === 'asc' ? a.fechaMs - b.fechaMs : b.fechaMs - a.fechaMs;
    }
    return b.fechaMs - a.fechaMs;
  });

  // Paginación.
  const page = Math.max(filtros.page, 1);
  const limit = Math.min(Math.max(filtros.limit, 1), 100);
  const totalPages = Math.ceil(total / limit) || 1;
  const paginaValidada = Math.min(page, totalPages);
  const inicio = (paginaValidada - 1) * limit;
  const paginados = reportes.slice(inicio, inicio + limit);

  return {
    reportes: paginados,
    total,
    totalPages,
  };
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<ListadoResponse>,
): Promise<void> {
  const db = getAdminDb();

  const filtros = {
    estado: typeof req.query.estado === 'string' ? req.query.estado : undefined,
    modo: typeof req.query.modo === 'string' ? req.query.modo : undefined,
    motivo: typeof req.query.motivo === 'string' ? req.query.motivo : undefined,
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    page: req.query.page ? Number(req.query.page) : 1,
    limit: req.query.limit ? Number(req.query.limit) : 20,
    orderBy: typeof req.query.orderBy === 'string' ? req.query.orderBy : 'fechaMs',
    orderDir: req.query.orderDir === 'asc' ? 'asc' : ('desc' as 'asc' | 'desc'),
  };

  const { reportes, total, totalPages } = await listarReportes(db, filtros);

  return res.status(200).json({
    success: true,
    reportes,
    total,
    page: Math.max(filtros.page, 1),
    limit: Math.min(Math.max(filtros.limit, 1), 100),
    totalPages,
  });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  identidad: { uid: string; rol: string },
): Promise<void> {
  const db = getAdminDb();
  const body =
    typeof req.body === 'string'
      ? (JSON.parse(req.body) as Record<string, unknown>)
      : (req.body as Record<string, unknown>);

  const reporteId = typeof body['reporteId'] === 'string' ? body['reporteId'] : '';
  const estadoNuevo = typeof body['estado'] === 'string' ? body['estado'] : undefined;
  const notasAdmin =
    typeof body['notasAdmin'] === 'string' ? body['notasAdmin'].trim() : undefined;

  if (!reporteId) {
    return res.status(400).json({ error: 'El ID del reporte es requerido.' });
  }
  if (!estadoNuevo || !esEstadoValido(estadoNuevo)) {
    return res.status(400).json({
      error: 'El estado debe ser "pendiente", "revisado" o "descartado".',
    });
  }

  const docRef = db.collection(COLECCION_REPORTES).doc(reporteId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ error: 'Reporte no encontrado.' });
  }

  const actual = snap.data() ?? {};
  const estadoActual = actual['estado'];

  // No tiene sentido cambiar a un estado que ya tiene.
  if (estadoActual === estadoNuevo && notasAdmin === undefined) {
    return res.status(200).json({
      success: true,
      mensaje: 'El reporte ya tiene ese estado.',
      reporte: { id: reporteId, estado: estadoNuevo },
    });
  }

  const actualizaciones: Record<string, unknown> = {
    estado: estadoNuevo,
    fechaActualizacion: new Date().toISOString(),
  };

  // Al pasar a revisado/descartado se registra quién y cuándo lo revisó.
  if (estadoNuevo === 'revisado' || estadoNuevo === 'descartado') {
    actualizaciones['revisadoPor'] = identidad.uid;
    actualizaciones['fechaRevision'] = new Date().toISOString();
  } else if (estadoNuevo === 'pendiente') {
    // Al reabrir se limpia la auditoría de revisión.
    actualizaciones['revisadoPor'] = null;
    actualizaciones['fechaRevision'] = null;
  }

  if (notasAdmin !== undefined) {
    actualizaciones['notasAdmin'] = notasAdmin || null;
  }

  await docRef.set(actualizaciones, { merge: true });

  return res.status(200).json({
    success: true,
    mensaje: `Reporte marcado como ${estadoNuevo}.`,
    reporte: {
      id: reporteId,
      estado: estadoNuevo,
      revisadoPor: estadoNuevo !== 'pendiente' ? identidad.uid : null,
      fechaRevision: estadoNuevo !== 'pendiente' ? new Date().toISOString() : null,
      notasAdmin: notasAdmin ?? actual['notasAdmin'] ?? null,
    },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  let identidad: { uid: string; rol: string };
  try {
    const admin = await requireAdmin(req);
    identidad = { uid: admin.uid, rol: admin.rol as string };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de autenticación';
    return res.status(adminErrorStatus(error)).json({ error: message });
  }

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res, identidad);

    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('Error en /api/reportesPreguntas:', error);
    const message = error instanceof Error ? error.message : 'Error interno de reportes';
    return res.status(500).json({ error: message });
  }
}
