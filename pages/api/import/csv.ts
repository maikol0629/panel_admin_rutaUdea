/**
 * POST /api/import/csv
 *
 * Subir y validar un archivo CSV de preguntas. Acepta:
 * - `multipart/form-data` con el campo `file` (.csv), o
 * - JSON `{ "filename": "x.csv", "content": "<texto csv>" }`.
 *
 * Encabezados obligatorios:
 * id,componente,subtema,dificultad,pregunta,opcion_a,opcion_b,opcion_c,
 * opcion_d,respuesta_correcta,explicacion,tiene_contexto_compartido,
 * descripcion_contexto
 *
 * Fase 7: escribe en `questions_v2` con el contrato v2 (opciones como
 * objeto `{A,B,C,D}`, taxonomía RL01–RL18 / CL01–CL14, `bank_version` y
 * `schema_version`). Toda fila entra como `pendiente` y sin verificar
 * (D-08); el CSV no puede publicar preguntas.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_QUESTIONS,
  getAdminDb,
  requireAdmin,
} from '@/lib/firebase-admin';
import {
  BANK_VERSION_DEFAULT,
  SCHEMA_VERSION,
  esComponenteValido,
  type OpcionesPregunta,
} from '@/lib/bank';

export const config = {
  api: { bodyParser: false },
};

interface FilaCSV {
  id: string;
  componente: string;
  subtema: string;
  dificultad: string;
  pregunta: string;
  opciones: OpcionesPregunta;
  respuesta_correcta: string;
  explicacion: string;
  tiene_contexto_compartido: string;
  descripcion_contexto: string;
}

interface ErrorFila {
  fila: number;
  id: string;
  errores: string[];
}

const ENCABEZADOS_OBLIGATORIOS = [
  'id',
  'componente',
  'subtema',
  'dificultad',
  'pregunta',
  'opcion_a',
  'opcion_b',
  'opcion_c',
  'opcion_d',
  'respuesta_correcta',
  'explicacion',
  'tiene_contexto_compartido',
  'descripcion_contexto',
] as const;

const DIFICULTADES_VALIDAS = ['baja', 'media', 'alta'] as const;
const RESPUESTAS_VALIDAS = ['A', 'B', 'C', 'D'] as const;

function esRespuestaValida(resp: string): resp is 'A' | 'B' | 'C' | 'D' {
  return (RESPUESTAS_VALIDAS as readonly string[]).includes(resp);
}

function esDificultadValida(dif: string): dif is 'baja' | 'media' | 'alta' {
  return (DIFICULTADES_VALIDAS as readonly string[]).includes(dif);
}

async function leerBuffer(req: NextApiRequest): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const parte of req) {
    partes.push(typeof parte === 'string' ? Buffer.from(parte) : (parte as Buffer));
  }
  return Buffer.concat(partes);
}

/** Extrae el archivo del multipart (campo `file`). Retorna null si no hay. */
function extraerMultipart(
  buffer: Buffer,
  contentType: string | undefined,
): { filename: string; content: string } | null {
  if (!contentType || !contentType.includes('multipart/form-data')) return null;
  const borde = contentType.split('boundary=')[1];
  if (!borde) return null;

  const texto = buffer.toString('utf-8');
  const partes = texto.split(`--${borde}`);
  for (const parte of partes) {
    if (!parte.includes('filename=')) continue;
    const finCabecera = parte.indexOf('\r\n\r\n');
    if (finCabecera === -1) continue;
    const cabeceras = parte.slice(0, finCabecera);
    const contenido = parte.slice(finCabecera + 4).replace(/\r\n$/, '');
    const nombre = cabeceras.match(/filename="([^"]*)"/)?.[1] ?? 'upload.csv';
    return { filename: nombre, content: contenido };
  }
  return null;
}

/**
 * Parser CSV mínimo compatible con RFC 4180: soporta campos entre comillas
 * con comas, comillas escapadas ("") y saltos de línea internos.
 */
export function parsearCSV(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((v) => v.trim().length > 0));
}

function validarFila(
  fila: Record<string, string>,
  numeroFila: number,
  idsVistos: Set<string>,
  idsDuplicados: string[],
): { limpia: FilaCSV | null; error: ErrorFila | null } {
  const errores: string[] = [];
  const idFila = (fila['id'] ?? '').trim();

  if (!idFila) errores.push('ID vacío o ausente');

  if (idFila && idsVistos.has(idFila)) {
    errores.push(`ID duplicado dentro de este lote: ${idFila}`);
    idsDuplicados.push(idFila);
  }
  if (idFila) idsVistos.add(idFila);

  const componente = (fila['componente'] ?? '').trim();
  if (!esComponenteValido(componente)) {
    errores.push(
      `Componente inválido: "${componente}". Debe ser uno de la taxonomía oficial ` +
        'RL01–RL18 / CL01–CL14.',
    );
  }

  const dificultad = (fila['dificultad'] ?? '').trim().toLowerCase();
  if (!esDificultadValida(dificultad)) {
    errores.push(
      `Dificultad inválida: "${fila['dificultad'] ?? ''}". Debe ser una de: ${DIFICULTADES_VALIDAS.join(', ')}`,
    );
  }

  const respuesta = (fila['respuesta_correcta'] ?? '').trim().toUpperCase();
  if (!esRespuestaValida(respuesta)) {
    errores.push(
      `Respuesta correcta inválida: "${fila['respuesta_correcta'] ?? ''}". Debe ser una de: ${RESPUESTAS_VALIDAS.join(', ')}`,
    );
  }

  const opciones: OpcionesPregunta = {
    A: (fila['opcion_a'] ?? '').trim(),
    B: (fila['opcion_b'] ?? '').trim(),
    C: (fila['opcion_c'] ?? '').trim(),
    D: (fila['opcion_d'] ?? '').trim(),
  };
  const opcionesVacias = (['A', 'B', 'C', 'D'] as const).filter(
    (letra) => !opciones[letra],
  );
  if (opcionesVacias.length > 0) {
    errores.push(
      `Faltan opciones. Vacías: ${opcionesVacias.join(', ')}. Todas deben tener texto.`,
    );
  }

  if (!((fila['pregunta'] ?? '').trim())) errores.push('Texto de pregunta vacío');
  if (!((fila['explicacion'] ?? '').trim())) errores.push('Texto de explicación vacío');

  if (errores.length > 0) {
    return {
      limpia: null,
      error: { fila: numeroFila, id: idFila || `fila-${numeroFila}`, errores },
    };
  }

  return {
    limpia: {
      id: idFila,
      componente,
      subtema: (fila['subtema'] ?? '').trim(),
      dificultad,
      pregunta: (fila['pregunta'] ?? '').trim(),
      opciones,
      respuesta_correcta: respuesta,
      explicacion: (fila['explicacion'] ?? '').trim(),
      tiene_contexto_compartido: (fila['tiene_contexto_compartido'] ?? '').trim(),
      descripcion_contexto: (fila['descripcion_contexto'] ?? '').trim(),
    },
    error: null,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    await requireAdmin(req);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error de autenticación';
    return res.status(adminErrorStatus(error)).json({ error: message });
  }

  try {
    const contentType = req.headers['content-type'];
    const buffer = await leerBuffer(req);

    // Acepta multipart (campo `file`) o JSON { filename, content }.
    let filename = 'upload.csv';
    let texto = '';
    const comoMultipart = extraerMultipart(buffer, contentType);
    if (comoMultipart) {
      filename = comoMultipart.filename;
      texto = comoMultipart.content;
    } else {
      try {
        const json = JSON.parse(buffer.toString('utf-8')) as {
          filename?: string;
          content?: string;
        };
        if (typeof json.content === 'string') {
          filename = json.filename ?? 'upload.csv';
          texto = json.content;
        }
      } catch {
        // Se reporta abajo como archivo ausente.
      }
    }

    if (!texto) {
      return res.status(400).json({
        error: 'No se recibió ningún archivo. Campo esperado: "file"',
      });
    }
    if (!filename.toLowerCase().endsWith('.csv')) {
      return res.status(400).json({ error: 'El archivo debe tener extensión .csv' });
    }

    const filas = parsearCSV(texto);
    if (filas.length < 2) {
      return res.status(400).json({
        error: 'El archivo CSV parece estar vacío o solo tiene encabezados.',
      });
    }

    const encabezadoCSV = (filas[0] ?? []).map((h) => h.trim());
    const faltantes = ENCABEZADOS_OBLIGATORIOS.filter(
      (h) => !encabezadoCSV.includes(h),
    );
    if (faltantes.length > 0) {
      return res.status(400).json({
        error: 'Encabezados CSV inválidos.',
        esperados: ENCABEZADOS_OBLIGATORIOS,
        encontrados: encabezadoCSV,
        faltantes,
      });
    }

    const errores: ErrorFila[] = [];
    const idsVistos = new Set<string>();
    const idsDuplicados: string[] = [];
    const preguntasAInsertar: FilaCSV[] = [];
    let preguntasValidas = 0;
    let preguntasInvalidas = 0;

    for (let i = 1; i < filas.length; i++) {
      const valores = filas[i] ?? [];
      const fila: Record<string, string> = {};
      for (let j = 0; j < ENCABEZADOS_OBLIGATORIOS.length; j++) {
        const clave = ENCABEZADOS_OBLIGATORIOS[j];
        if (clave) fila[clave] = (valores[j] ?? '').trim();
      }

      const { limpia, error } = validarFila(fila, i, idsVistos, idsDuplicados);
      if (error) {
        errores.push(error);
        preguntasInvalidas++;
      } else if (limpia) {
        preguntasAInsertar.push(limpia);
        preguntasValidas++;
      }
    }

    let preguntasInsertadas = 0;
    for (const preg of preguntasAInsertar) {
      try {
        // El área se deriva del componente (el CSV no la trae): CL* →
        // competencia_lectora, lo demás → razonamiento_logico. Sin área
        // válida la app móvil nunca seleccionaría la pregunta.
        const esLectura = preg.componente.startsWith('CL');
        const area = esLectura ? 'competencia_lectora' : 'razonamiento_logico';
        const ahora = new Date().toISOString();
        await getAdminDb().collection(COLECCION_QUESTIONS).doc(preg.id).set(
          {
            id: preg.id,
            bank_version: BANK_VERSION_DEFAULT,
            schema_version: SCHEMA_VERSION,
            area,
            componente: esLectura ? 'Competencia Lectora' : 'Razonamiento Lógico',
            subtema: `${preg.componente} ${preg.subtema}`.trim(),
            subtema_origen: preg.subtema,
            competencia: '',
            tipo_texto: esLectura ? '' : null,
            dificultad: preg.dificultad,
            contexto: preg.descripcion_contexto || null,
            texto_base: null,
            pregunta: preg.pregunta,
            // Contrato v2: objeto {A,B,C,D}, no lista.
            opciones: preg.opciones,
            respuesta_correcta: preg.respuesta_correcta,
            explicacion: preg.explicacion,
            fuente: '',
            tipo_fuente: '',
            es_original: false,
            verificada: false,
            duplicado: false,
            imagen_url: null,
            imagenes: [],
            requiere_imagen: false,
            opciones_en_imagen: false,
            // Toda importación CSV entra pendiente de revisión (D-08).
            estado: 'pendiente',
            created_at: ahora,
            updated_at: ahora,
            metadatos: {
              fechaImportacion: ahora,
              importadoPor: 'admin-panel-csv',
              tiene_contexto_compartido: preg.tiene_contexto_compartido,
            },
          },
          { merge: true },
        );
        preguntasInsertadas++;
      } catch (err) {
        console.error(`Error insertando pregunta ${preg.id}:`, err);
      }
    }

    return res.status(200).json({
      success: true,
      mensaje: `Importación completada: ${preguntasValidas} válidas, ${preguntasInvalidas} inválidas, ${preguntasInsertadas} insertadas en questions_v2 con estado "pendiente".`,
      resultado: {
        totalFilas: filas.length - 1,
        preguntasValidas,
        preguntasInvalidas,
        preguntasInsertadas,
        errores,
        idsDuplicados,
      },
    });
  } catch (error) {
    console.error('Error en /api/import/csv:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Error interno durante la importación CSV';
    return res.status(500).json({ error: message });
  }
}
