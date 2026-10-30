/**
 * POST /api/import/jsonl
 *
 * Importador del banco canónico (contrato v2). Acepta:
 * - `multipart/form-data` con el campo `file` (.jsonl), o
 * - JSON `{ "filename": "x.jsonl", "content": "<texto jsonl>" }`.
 *
 * Query:
 * - `tipo=preguntas` (por defecto) → `questions_v2`.
 * - `tipo=contextos` → `contexts_v2`.
 *
 * Body (solo JSON o campo de formulario):
 * - `respetar_estado=true` conserva `estado`/`verificada` del archivo.
 *   Por defecto **todo entra como `pendiente` y `verificada=false`** (D-08),
 *   para que una importación no publique por accidente.
 *
 * Las filas se validan una a una; las inválidas se reportan con su línea y
 * motivo y no se escriben. Las válidas se guardan en lotes de 400 preservando
 * todos los campos del archivo (incluidos los desconocidos).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_CONTEXTS,
  COLECCION_QUESTIONS,
  getAdminDb,
  requireAdmin,
  type AdminIdentity,
} from '@/lib/firebase-admin';
import { faltantesParaPublicar, normalizarPregunta, type PreguntaV2 } from '@/lib/bank';

export const config = {
  api: { bodyParser: false },
};

const MAX_BYTES = 8 * 1024 * 1024;
const TAMANO_LOTE = 400;

interface ErrorFila {
  linea: number;
  id: string;
  errores: string[];
}

interface CuerpoImportacion {
  filename: string;
  texto: string;
  respetarEstado: boolean;
}

async function leerBuffer(req: NextApiRequest): Promise<Buffer> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    const trozo = typeof parte === 'string' ? Buffer.from(parte) : (parte as Buffer);
    total += trozo.length;
    if (total > MAX_BYTES) throw new Error('El archivo supera el límite de 8 MB');
    partes.push(trozo);
  }
  return Buffer.concat(partes);
}

function extraerMultipart(
  buffer: Buffer,
  contentType: string | undefined,
): { filename: string; content: string; campos: Record<string, string> } | null {
  if (!contentType || !contentType.includes('multipart/form-data')) return null;
  const borde = contentType.split('boundary=')[1];
  if (!borde) return null;

  const texto = buffer.toString('utf-8');
  const partes = texto.split(`--${borde}`);
  const campos: Record<string, string> = {};
  let archivo: { filename: string; content: string } | null = null;

  for (const parte of partes) {
    const finCabecera = parte.indexOf('\r\n\r\n');
    if (finCabecera === -1) continue;
    const cabeceras = parte.slice(0, finCabecera);
    const contenido = parte.slice(finCabecera + 4).replace(/\r\n$/, '');
    const nombreCampo = cabeceras.match(/name="([^"]*)"/)?.[1];
    const nombreArchivo = cabeceras.match(/filename="([^"]*)"/)?.[1];
    if (!nombreCampo) continue;
    if (nombreArchivo) {
      archivo = { filename: nombreArchivo, content: contenido };
    } else {
      campos[nombreCampo] = contenido.trim();
    }
  }

  if (!archivo) return null;
  return { ...archivo, campos };
}

async function leerCuerpo(req: NextApiRequest): Promise<CuerpoImportacion> {
  const contentType = req.headers['content-type'];
  const buffer = await leerBuffer(req);
  const multipart = extraerMultipart(buffer, contentType);

  let filename = 'upload.jsonl';
  let texto = '';
  let respetarEstado = false;

  if (multipart) {
    filename = multipart.filename;
    texto = multipart.content;
    respetarEstado =
      multipart.campos['respetar_estado'] === 'true' ||
      multipart.campos['respetarEstado'] === 'true';
  } else {
    const json = JSON.parse(buffer.toString('utf-8')) as {
      filename?: string;
      content?: string;
      respetar_estado?: boolean;
      respetarEstado?: boolean;
    };
    if (typeof json.content === 'string') {
      filename = json.filename ?? 'upload.jsonl';
      texto = json.content;
      respetarEstado = json.respetar_estado === true || json.respetarEstado === true;
    }
  }

  return { filename, texto, respetarEstado };
}

function textoDe(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Valida una fila de `questions_v2` y la normaliza. */
function prepararPregunta(
  linea: number,
  raw: unknown,
  respetarEstado: boolean,
  idsVistos: Set<string>,
): { documento: Record<string, unknown> | null; error: ErrorFila | null } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      documento: null,
      error: { linea, id: '', errores: ['la línea no es un objeto JSON'] },
    };
  }
  const data = raw as Record<string, unknown>;
  const id = textoDe(data['id']);
  const errores: string[] = [];
  if (!id) errores.push('id vacío o ausente');
  if (id && idsVistos.has(id)) errores.push('id duplicado en el archivo');
  if (id) idsVistos.add(id);

  const normalizada: PreguntaV2 = normalizarPregunta(id || `linea-${linea}`, data);
  if (!normalizada.area) errores.push('area ausente o inválida');
  if (!normalizada.pregunta.trim()) errores.push('pregunta vacía');

  const estadoArchivo = textoDe(data['estado']) || 'pendiente';
  const estadoFinal = respetarEstado ? estadoArchivo : 'pendiente';
  if (
    !['aprobado', 'aprobado_con_imagen', 'pendiente', 'deshabilitado'].includes(
      estadoFinal,
    )
  ) {
    errores.push(`estado inválido: ${estadoFinal}`);
  }

  if (
    respetarEstado &&
    (estadoFinal === 'aprobado' || estadoFinal === 'aprobado_con_imagen')
  ) {
    const faltantes = faltantesParaPublicar({ ...normalizada, estado: estadoFinal });
    if (faltantes.length > 0)
      errores.push(`aprobada incompleta: ${faltantes.join(', ')}`);
  }

  if (errores.length > 0) {
    return { documento: null, error: { linea, id: id || `línea ${linea}`, errores } };
  }

  const ahora = new Date().toISOString();
  const documento: Record<string, unknown> = {
    ...data,
    id,
    bank_version: normalizada.bank_version,
    schema_version: normalizada.schema_version,
    area: normalizada.area,
    componente: normalizada.componente,
    subtema: normalizada.subtema,
    dificultad: normalizada.dificultad,
    pregunta: normalizada.pregunta,
    opciones: normalizada.opciones,
    respuesta_correcta: normalizada.respuesta_correcta,
    explicacion: normalizada.explicacion,
    texto_base: normalizada.texto_base,
    contexto: normalizada.contexto,
    contexto_ids: normalizada.contexto_ids,
    fuente: normalizada.fuente,
    tipo_fuente: normalizada.tipo_fuente,
    imagen_url: normalizada.imagen_url,
    imagenes: normalizada.imagenes,
    requiere_imagen: normalizada.requiere_imagen,
    opciones_en_imagen: normalizada.opciones_en_imagen,
    estado: estadoFinal,
    verificada: respetarEstado ? normalizada.verificada : false,
    confianza_modelo: normalizada.confianza_modelo,
    tarea: normalizada.tarea,
    numero: normalizada.numero,
    created_at: textoDe(data['created_at']) || ahora,
    updated_at: ahora,
    metadatos: {
      ...((data['metadatos'] as Record<string, unknown> | undefined) ?? {}),
      fechaImportacion: ahora,
      importadoPor: 'admin-panel-jsonl',
    },
  };
  return { documento, error: null };
}

/** Valida una fila de `contexts_v2` (D-05: contexto compartido + imágenes). */
function prepararContexto(
  linea: number,
  raw: unknown,
  idsVistos: Set<string>,
): { documento: Record<string, unknown> | null; error: ErrorFila | null } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      documento: null,
      error: { linea, id: '', errores: ['la línea no es un objeto JSON'] },
    };
  }
  const data = raw as Record<string, unknown>;
  const id = textoDe(data['id']);
  const errores: string[] = [];
  if (!id) errores.push('id vacío o ausente');
  if (id && idsVistos.has(id)) errores.push('id duplicado en el archivo');
  if (id) idsVistos.add(id);

  const texto = textoDe(data['texto']);
  if (!texto) errores.push('texto vacío');
  if (!textoDe(data['area'])) errores.push('area ausente');
  if (!Array.isArray(data['imagenes'])) errores.push('imagenes debe ser una lista');
  if (Array.isArray(data['contexto_ids'])) {
    // Un contexto se referencia desde preguntas; no debe llevar contexto_ids.
    errores.push('contexto_ids no corresponde a un contexto');
  }

  if (errores.length > 0) {
    return { documento: null, error: { linea, id: id || `línea ${linea}`, errores } };
  }

  const ahora = new Date().toISOString();
  return {
    documento: {
      ...data,
      id,
      texto,
      updated_at: ahora,
      metadatos: {
        ...((data['metadatos'] as Record<string, unknown> | undefined) ?? {}),
        fechaImportacion: ahora,
        importadoPor: 'admin-panel-jsonl',
      },
    },
    error: null,
  };
}

async function guardarLotes(
  coleccion: string,
  documentos: Record<string, unknown>[],
): Promise<number> {
  const db = getAdminDb();
  let guardados = 0;
  for (let i = 0; i < documentos.length; i += TAMANO_LOTE) {
    const lote = db.batch();
    for (const documento of documentos.slice(i, i + TAMANO_LOTE)) {
      const id = textoDe(documento['id']);
      lote.set(db.collection(coleccion).doc(id), documento, { merge: true });
    }
    await lote.commit();
    guardados += Math.min(TAMANO_LOTE, documentos.length - i);
  }
  return guardados;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  let identidad: AdminIdentity;
  try {
    identidad = await requireAdmin(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de autenticación';
    return res.status(adminErrorStatus(error)).json({ error: message });
  }

  try {
    const tipoRaw = req.query['tipo'];
    const tipo =
      (Array.isArray(tipoRaw) ? tipoRaw[0] : tipoRaw) === 'contextos'
        ? 'contextos'
        : 'preguntas';

    const { filename, texto, respetarEstado } = await leerCuerpo(req);
    if (!texto) {
      return res.status(400).json({
        error: 'No se recibió ningún archivo. Campo esperado: "file"',
      });
    }
    if (!filename.toLowerCase().endsWith('.jsonl')) {
      return res.status(400).json({ error: 'El archivo debe tener extensión .jsonl' });
    }

    const idsVistos = new Set<string>();
    const errores: ErrorFila[] = [];
    const documentos: Record<string, unknown>[] = [];
    const lineas = texto.split('\n');

    lineas.forEach((linea, indice) => {
      const limpia = linea.trim();
      if (!limpia) return;
      const numero = indice + 1;
      let raw: unknown;
      try {
        raw = JSON.parse(limpia);
      } catch {
        errores.push({ linea: numero, id: '', errores: ['JSON inválido'] });
        return;
      }
      const preparada =
        tipo === 'contextos'
          ? prepararContexto(numero, raw, idsVistos)
          : prepararPregunta(numero, raw, respetarEstado, idsVistos);
      if (preparada.error) errores.push(preparada.error);
      else if (preparada.documento) documentos.push(preparada.documento);
    });

    const coleccion = tipo === 'contextos' ? COLECCION_CONTEXTS : COLECCION_QUESTIONS;
    const guardados = await guardarLotes(coleccion, documentos);

    return res.status(200).json({
      success: errores.length === 0,
      mensaje:
        `Importación ${tipo}: ${documentos.length} válidas, ${errores.length} inválidas, ` +
        `${guardados} guardadas en ${coleccion}` +
        (tipo === 'preguntas'
          ? respetarEstado
            ? ' (estado del archivo conservado).'
            : ' con estado "pendiente".'
          : '.'),
      resultado: {
        tipo,
        coleccion,
        archivo: filename,
        respetarEstado,
        totalLineas: lineas.filter((l) => l.trim()).length,
        validas: documentos.length,
        invalidas: errores.length,
        guardadas: guardados,
        importadoPor: identidad.uid,
        errores,
      },
    });
  } catch (error) {
    console.error('Error en /api/import/jsonl:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Error interno durante la importación JSONL';
    return res.status(500).json({ error: message });
  }
}
