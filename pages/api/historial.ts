/**
 * /api/historial
 *
 * GET — Historial de cambios de preguntas (solo panel administrativo).
 *
 * Filtros:
 * - `preguntaId`  evento de una pregunta concreta.
 * - `accion`      creacion | edicion | revision | deshabilitacion | importacion.
 * - `origen`      panel | reporte | importacion.
 * - `campo`       campo de contenido afectado (pregunta, imagenes, opciones…).
 * - `actor`       uid o nombre del administrador (búsqueda parcial).
 * - `reporteId`   reporte que originó el cambio.
 * - `q`           búsqueda libre en pregunta, resumen, actor y reporte.
 * - `desde`/`hasta` fecha ISO o timestamp en milisegundos.
 * - `page`/`limit` paginación.
 *
 * El filtrado y el orden se hacen en memoria (máximo 2000 eventos) para no
 * exigir índices compuestos, igual que el resto del panel.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_HISTORIAL,
  getAdminDb,
  requireAdmin,
} from '@/lib/firebase-admin';
import { normalizarEvento } from '@/lib/historial';

const MAX_DOCS = 2000;

function queryParam(query: NextApiRequest['query'], nombre: string): string {
  const valor = query[nombre];
  if (Array.isArray(valor)) return typeof valor[0] === 'string' ? valor[0] : '';
  return typeof valor === 'string' ? valor : '';
}

function parseFecha(valor: string): number | null {
  const limpio = valor.trim();
  if (!limpio) return null;
  if (/^\d+$/.test(limpio)) {
    const numero = Number(limpio);
    return Number.isFinite(numero) ? numero : null;
  }
  const ms = Date.parse(limpio);
  return Number.isNaN(ms) ? null : ms;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdmin(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de autenticación';
    return res.status(adminErrorStatus(error)).json({ error: message });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const preguntaId = queryParam(req.query, 'preguntaId').trim();
    const accion = queryParam(req.query, 'accion').trim().toLowerCase();
    const origen = queryParam(req.query, 'origen').trim().toLowerCase();
    const campo = queryParam(req.query, 'campo').trim();
    const actor = queryParam(req.query, 'actor').trim().toLowerCase();
    const reporteId = queryParam(req.query, 'reporteId').trim();
    const q = queryParam(req.query, 'q').trim().toLowerCase();
    const desde = parseFecha(queryParam(req.query, 'desde'));
    const hasta = parseFecha(queryParam(req.query, 'hasta'));

    const limitRaw = parseInt(queryParam(req.query, 'limit') || '50', 10);
    const pageRaw = parseInt(queryParam(req.query, 'page') || '1', 10);
    const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 50 : limitRaw, 1), 200);
    const page = Math.max(Number.isNaN(pageRaw) ? 1 : pageRaw, 1);

    const db = getAdminDb();
    const coleccion = db.collection(COLECCION_HISTORIAL);
    const snap = preguntaId
      ? await coleccion.where('preguntaId', '==', preguntaId).limit(MAX_DOCS).get()
      : await coleccion.limit(MAX_DOCS).get();

    let eventos = snap.docs
      .map((doc) => normalizarEvento(doc.id, doc.data() as Record<string, unknown>))
      .filter((evento) => Boolean(evento.preguntaId));

    if (preguntaId) {
      eventos = eventos.filter((evento) => evento.preguntaId === preguntaId);
    }
    if (accion) {
      eventos = eventos.filter((evento) => evento.accion === accion);
    }
    if (origen) {
      eventos = eventos.filter((evento) => evento.origen === origen);
    }
    if (campo) {
      eventos = eventos.filter((evento) => evento.campos.includes(campo));
    }
    if (actor) {
      eventos = eventos.filter(
        (evento) =>
          evento.actorUid.toLowerCase().includes(actor) ||
          evento.actorNombre.toLowerCase().includes(actor),
      );
    }
    if (reporteId) {
      eventos = eventos.filter((evento) => evento.reporteId === reporteId);
    }
    if (q) {
      eventos = eventos.filter((evento) =>
        [
          evento.preguntaId,
          evento.resumen,
          evento.actorNombre,
          evento.actorUid,
          evento.reporteId ?? '',
        ].some((valor) => valor.toLowerCase().includes(q)),
      );
    }
    if (desde !== null) {
      eventos = eventos.filter((evento) => evento.fechaMs >= desde);
    }
    if (hasta !== null) {
      eventos = eventos.filter((evento) => evento.fechaMs <= hasta);
    }

    eventos.sort((a, b) => b.fechaMs - a.fechaMs || b.fecha.localeCompare(a.fecha));

    const total = eventos.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pagina = Math.min(page, totalPages);
    const inicio = (pagina - 1) * limit;
    const lote = eventos.slice(inicio, inicio + limit);

    return res.status(200).json({
      success: true,
      eventos: lote,
      total,
      page: pagina,
      limit,
      totalPages,
      hasMore: pagina < totalPages,
    });
  } catch (error) {
    console.error('Error en /api/historial:', error);
    const message =
      error instanceof Error ? error.message : 'Error interno al consultar el historial';
    return res.status(500).json({ error: message });
  }
}
