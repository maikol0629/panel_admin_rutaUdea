/**
 * /api/bank/manifest
 *
 * GET  — Estado de publicación del banco: manifiesto activo, conteos reales
 *        de `questions_v2` y verificaciones previas al publish.
 * POST — Publica `bank_manifest/active` (D-02).
 *
 * Reglas del gate de publicación (Fase 7):
 * - Solo se publican preguntas con estado `aprobado`/`aprobado_con_imagen`.
 * - Cada una debe cumplir el contrato v2 (taxonomía, opciones, respuesta,
 *   verificación e imagen con URL cuando la requiere).
 * - Todas deben pertenecer a la `bank_version` que se publica y sus
 *   `contexto_ids` deben existir en `contexts_v2`.
 * - Se exige `confirmar: true` en el cuerpo: publicar no es un efecto
 *   colateral de abrir el panel.
 *
 * El `hash` del manifiesto identifica el lote (ids + updated_at). La app lo
 * usa como identidad de versión, no para recomputar el SHA del JSONL.
 */

import { createHash } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_BANK_MANIFEST,
  COLECCION_CONTEXTS,
  COLECCION_QUESTIONS,
  getAdminDb,
  requireAdmin,
  type AdminIdentity,
} from '@/lib/firebase-admin';
import {
  BANK_VERSION_DEFAULT,
  SCHEMA_VERSION,
  esAprobada,
  normalizarPregunta,
  resumenBanco,
  validarLoteParaPublicar,
  type ImagenRef,
  type PreguntaV2,
} from '@/lib/bank';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';

const DOC_ACTIVO = 'active';
const MAX_DOCS = 2000;

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function leerCuerpo(req: NextApiRequest): Record<string, unknown> {
  return typeof req.body === 'string'
    ? (JSON.parse(req.body) as Record<string, unknown>)
    : ((req.body ?? {}) as Record<string, unknown>);
}

async function cargarPreguntas(bankVersion?: string): Promise<PreguntaV2[]> {
  const snapshot = await getAdminDb()
    .collection(COLECCION_QUESTIONS)
    .limit(MAX_DOCS)
    .get();
  return snapshot.docs
    .map((doc: QueryDocumentSnapshot<DocumentData>) =>
      normalizarPregunta(doc.id, doc.data() as Record<string, unknown>),
    )
    .filter((p: PreguntaV2) => Boolean(p.area) && Boolean(p.pregunta))
    .filter((p: PreguntaV2) => (bankVersion ? p.bank_version === bankVersion : true));
}

async function cargarContextos(): Promise<Map<string, Record<string, unknown>>> {
  const snapshot = await getAdminDb()
    .collection(COLECCION_CONTEXTS)
    .limit(MAX_DOCS)
    .get();
  return new Map(
    snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => [
      doc.id,
      doc.data() as Record<string, unknown>,
    ]),
  );
}

/** Hash estable del lote: versión + ids ordenados + updated_at. */
export function calcularHashLote(bankVersion: string, preguntas: PreguntaV2[]): string {
  const firma = preguntas
    .filter(esAprobada)
    .map((p) => `${p.id}:${asString(p.updated_at)}:${p.estado}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(`${bankVersion}\n${firma}`).digest('hex');
}

function verificarLote(
  preguntas: PreguntaV2[],
  contextos: Map<string, Record<string, unknown>>,
  bankVersion: string,
) {
  const motivos = validarLoteParaPublicar(preguntas, bankVersion);
  const aprobadas = preguntas.filter(esAprobada);

  for (const p of aprobadas) {
    for (const contextoId of p.contexto_ids ?? []) {
      if (!contextos.has(contextoId)) {
        motivos.push(`${p.id}:contexto_inexistente:${contextoId}`);
      }
    }
    const imagenesSinUrl = p.imagenes.filter((img) => !img.url);
    if (imagenesSinUrl.length > 0) {
      motivos.push(`${p.id}:imagen_sin_url`);
    }
  }

  return { motivos, aprobadas };
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const [manifiestoSnap, preguntas, contextos] = await Promise.all([
    getAdminDb().collection(COLECCION_BANK_MANIFEST).doc(DOC_ACTIVO).get(),
    cargarPreguntas(),
    cargarContextos(),
  ]);

  const activo = manifiestoSnap.exists
    ? ((manifiestoSnap.data() ?? {}) as Record<string, unknown>)
    : null;
  const versionActiva = asString(activo?.['bank_version'], BANK_VERSION_DEFAULT);
  const deVersion = preguntas.filter((p: PreguntaV2) => p.bank_version === versionActiva);
  const resumen = resumenBanco(preguntas);
  const { motivos } = verificarLote(deVersion, contextos, versionActiva);

  const imagenes = deVersion.flatMap((p: PreguntaV2) => p.imagenes);
  const conUrl = imagenes.filter((img: ImagenRef) => Boolean(img.url)).length;

  return res.status(200).json({
    success: true,
    activo,
    versionActiva,
    resumen,
    verificacion: {
      listaParaPublicar: motivos.length === 0 && resumen.aprobadas > 0,
      motivos: motivos.slice(0, 50),
      totalMotivos: motivos.length,
      preguntasDeLaVersion: deVersion.length,
      aprobadasDeLaVersion: deVersion.filter(esAprobada).length,
      contextos: contextos.size,
      imagenes: imagenes.length,
      imagenesConUrl: conUrl,
      hashCalculado: calcularHashLote(versionActiva, deVersion),
    },
  });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  identidad: AdminIdentity,
) {
  const body = leerCuerpo(req);
  if (body['confirmar'] !== true) {
    return res.status(400).json({
      error:
        'Publicar el banco es irreversible para los clientes: envíe "confirmar": true.',
    });
  }

  const bankVersion = asString(body['bank_version'], BANK_VERSION_DEFAULT).trim();
  const schemaVersion =
    typeof body['schema_version'] === 'number' ? body['schema_version'] : SCHEMA_VERSION;
  if (!bankVersion) return res.status(400).json({ error: 'bank_version requerida' });

  const [preguntas, contextos] = await Promise.all([
    cargarPreguntas(),
    cargarContextos(),
  ]);
  const deVersion = preguntas.filter((p) => p.bank_version === bankVersion);
  if (deVersion.filter(esAprobada).length === 0) {
    return res.status(400).json({
      error: `No hay preguntas aprobadas de la versión ${bankVersion}.`,
    });
  }

  const { motivos, aprobadas } = verificarLote(deVersion, contextos, bankVersion);
  if (motivos.length > 0) {
    return res.status(400).json({
      error: 'El lote no puede publicarse todavía.',
      motivos: motivos.slice(0, 50),
      totalMotivos: motivos.length,
    });
  }

  const resumen = resumenBanco(deVersion);
  const imagenes = deVersion.flatMap((p) => p.imagenes);
  const ahora = new Date().toISOString();
  const hash = calcularHashLote(bankVersion, deVersion);
  const revisor = asString(identidad.nombre) || identidad.uid;

  const manifiesto = {
    bank_version: bankVersion,
    schema_version: schemaVersion,
    status: 'active',
    hash,
    counts: {
      total: resumen.total,
      aprobadas: aprobadas.length,
      razonamiento_logico: resumen.razonamiento_logico,
      competencia_lectora: resumen.competencia_lectora,
      aprobado: resumen.aprobado,
      aprobado_con_imagen: resumen.aprobado_con_imagen,
      pendiente: resumen.pendiente,
      deshabilitado: resumen.deshabilitado,
      imagenes: imagenes.length,
      imagenes_con_url: imagenes.filter((img) => Boolean(img.url)).length,
      contextos: contextos.size,
    },
    published_at: ahora,
    published_by: revisor,
    min_app_version:
      typeof body['min_app_version'] === 'number' ? body['min_app_version'] : 0,
    image_base_url:
      asString(body['image_base_url']) ||
      `https://rutaudea-25fe0.web.app/questions/${bankVersion}`,
    notas: asString(body['notas']) || null,
  };

  const db = getAdminDb();
  const refActivo = db.collection(COLECCION_BANK_MANIFEST).doc(DOC_ACTIVO);
  const anterior = await refActivo.get();
  const lote = db.batch();

  // Historial inmutable por versión (rollback y auditoría).
  lote.set(
    db.collection(COLECCION_BANK_MANIFEST).doc(bankVersion),
    { ...manifiesto, previous: null },
    { merge: true },
  );
  lote.set(
    refActivo,
    {
      ...manifiesto,
      previous: anterior.exists
        ? ((anterior.data() ?? {}) as Record<string, unknown>)
        : null,
    },
    { merge: true },
  );
  await lote.commit();

  return res.status(200).json({
    success: true,
    mensaje: `Banco ${bankVersion} publicado como activo (${aprobadas.length} preguntas).`,
    manifiesto,
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
    if (req.method === 'POST') return await handlePost(req, res, identidad);
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('Error en /api/bank/manifest:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return res.status(500).json({ error: message });
  }
}
