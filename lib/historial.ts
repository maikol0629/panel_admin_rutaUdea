/**
 * Historial de cambios de preguntas — utilidades puras del panel.
 *
 * Esta funcionalidad es exclusiva del panel administrativo. La app móvil no
 * lee ni escribe la colección `historialPreguntas`.
 *
 * El historial guarda un evento por cambio con:
 * - autor autenticado (`actorUid`, `actorNombre`, `actorRol`);
 * - acción y origen (`panel`, `reporte`, `importacion`);
 * - vínculo opcional al reporte que originó el cambio (`reporteId`);
 * - diff de campos de contenido y/o un snapshot para creación/importación.
 *
 * Las imágenes nunca se guardan completas: si vienen como `data:` URL solo se
 * conservan metadatos (tipo, bytes y sha256) para no superar el límite de 1 MiB
 * por documento de Firestore.
 */

import { normalizarOpciones } from '@/lib/bank';

export type AccionHistorial =
  'creacion' | 'edicion' | 'revision' | 'deshabilitacion' | 'importacion';

export type OrigenHistorial = 'panel' | 'reporte' | 'importacion';

export const ACCIONES_HISTORIAL: AccionHistorial[] = [
  'creacion',
  'edicion',
  'revision',
  'deshabilitacion',
  'importacion',
];

export const ORIGENES_HISTORIAL: OrigenHistorial[] = ['panel', 'reporte', 'importacion'];

export const ETIQUETAS_ACCION: Record<AccionHistorial, string> = {
  creacion: 'Creación',
  edicion: 'Edición',
  revision: 'Revisión',
  deshabilitacion: 'Deshabilitación',
  importacion: 'Importación',
};

export const ETIQUETAS_ORIGEN: Record<OrigenHistorial, string> = {
  panel: 'Panel',
  reporte: 'Reporte',
  importacion: 'Importación',
};

export interface CambioCampo {
  antes: unknown;
  despues: unknown;
}

export type TipoImagenHistorial = 'data_url' | 'url_externa' | 'sin_url' | 'otra';

export interface RefImagenHistorial {
  tipo: TipoImagenHistorial;
  bytes: number | null;
  url: string | null;
}

export interface ImagenHistorial extends RefImagenHistorial {
  rol: string;
  orden: number;
  alt: string | null;
  path_origen: string | null;
  sha256: string | null;
}

export interface EventoHistorial {
  id: string;
  preguntaId: string;
  fecha: string;
  fechaMs: number;
  actorUid: string;
  actorNombre: string;
  actorRol: string;
  accion: AccionHistorial;
  origen: OrigenHistorial;
  reporteId: string | null;
  campos: string[];
  resumen: string;
  cambios: Record<string, CambioCampo>;
  snapshot?: Record<string, unknown>;
}

/** Campos de contenido que se comparan y se muestran en el historial. */
export const CAMPOS_HISTORIAL = [
  'area',
  'componente',
  'subtema',
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
  'estado',
  'verificada',
  'confianza_modelo',
  'notas',
  'duplicado',
] as const;

export type CampoHistorial = (typeof CAMPOS_HISTORIAL)[number];

export const ETIQUETAS_CAMPO: Record<string, string> = {
  area: 'Área',
  componente: 'Componente',
  subtema: 'Subtema',
  dificultad: 'Dificultad',
  tipo: 'Tipo',
  tarea: 'Tarea',
  numero: 'Número',
  pregunta: 'Enunciado',
  opciones: 'Opciones',
  respuesta_correcta: 'Respuesta correcta',
  explicacion: 'Explicación',
  texto_base: 'Texto base',
  contexto: 'Contexto',
  contexto_ids: 'Contextos vinculados',
  fuente: 'Fuente',
  tipo_fuente: 'Tipo de fuente',
  imagen_url: 'Imagen principal',
  imagenes: 'Imágenes',
  requiere_imagen: 'Requiere imagen',
  opciones_en_imagen: 'Opciones en imagen',
  estado: 'Estado',
  verificada: 'Verificada',
  confianza_modelo: 'Confianza del modelo',
  notas: 'Notas',
  duplicado: 'Duplicado',
};

const CAMPOS_BOOLEANOS = new Set([
  'requiere_imagen',
  'opciones_en_imagen',
  'verificada',
  'duplicado',
]);

const CAMPOS_TEXTO = new Set([
  'area',
  'componente',
  'subtema',
  'tipo',
  'tarea',
  'pregunta',
  'explicacion',
  'texto_base',
  'contexto',
  'fuente',
  'tipo_fuente',
  'confianza_modelo',
  'notas',
]);

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function textoLimpio(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio ? limpio : null;
}

/** Calcula el tamaño aproximado de un `data:` URL sin decodificarlo. */
function bytesDataUrl(valor: string): number | null {
  const coma = valor.indexOf(',');
  if (coma === -1) return null;
  const payload = valor.slice(coma + 1);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((payload.length * 3) / 4) - padding;
  return bytes > 0 ? bytes : null;
}

/**
 * Sanitiza una URL de imagen. Las `data:` URL se reducen a metadatos; solo se
 * conserva la URL cuando es externa (http/https) o relativa.
 */
export function sanitizarUrlImagen(valor: unknown): RefImagenHistorial {
  const texto = textoLimpio(valor);
  if (!texto) return { tipo: 'sin_url', bytes: null, url: null };
  if (texto.startsWith('data:')) {
    return { tipo: 'data_url', bytes: bytesDataUrl(texto), url: null };
  }
  if (/^https?:\/\//i.test(texto)) {
    return { tipo: 'url_externa', bytes: null, url: texto };
  }
  return {
    tipo: 'otra',
    bytes: null,
    url: texto.startsWith('/') ? texto : null,
  };
}

/** Sanitiza una lista de imágenes del contrato v2. */
export function sanitizarImagenes(raw: unknown): ImagenHistorial[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index): ImagenHistorial | null => {
      if (!esObjeto(item)) return null;
      const ref = sanitizarUrlImagen(item['url']);
      return {
        ...ref,
        rol: item['rol'] === 'contexto' ? 'contexto' : 'pregunta',
        orden: typeof item['orden'] === 'number' ? item['orden'] : index + 1,
        alt: textoLimpio(item['alt']),
        path_origen: textoLimpio(item['path_origen']),
        sha256: textoLimpio(item['sha256']),
      };
    })
    .filter((item): item is ImagenHistorial => item !== null);
}

/** Convierte el valor de un campo al shape seguro que se guarda en el historial. */
export function valorHistorial(campo: string, valor: unknown): unknown {
  switch (campo) {
    case 'imagenes':
      return sanitizarImagenes(valor);
    case 'imagen_url':
      return sanitizarUrlImagen(valor);
    case 'opciones':
      return normalizarOpciones(valor);
    case 'contexto_ids':
      return Array.isArray(valor)
        ? valor.filter((x): x is string => typeof x === 'string' && x.length > 0)
        : [];
    case 'numero':
      return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
    case 'respuesta_correcta': {
      const texto = textoLimpio(valor);
      return texto ? texto.toUpperCase() : null;
    }
    case 'estado':
    case 'dificultad':
      return textoLimpio(valor)?.toLowerCase() ?? null;
    default:
      if (CAMPOS_BOOLEANOS.has(campo)) return valor === true;
      if (CAMPOS_TEXTO.has(campo)) return textoLimpio(valor);
      return valor ?? null;
  }
}

/** Snapshot de contenido para eventos de creación/importación. */
export function snapshotPregunta(data: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const campo of CAMPOS_HISTORIAL) {
    snapshot[campo] = valorHistorial(campo, data[campo]);
  }
  return snapshot;
}

/** Diff de los campos de contenido que realmente cambiaron. */
export function calcularCambios(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): Record<string, CambioCampo> {
  const cambios: Record<string, CambioCampo> = {};
  for (const campo of CAMPOS_HISTORIAL) {
    const valorAntes = valorHistorial(campo, antes[campo]);
    const valorDespues = valorHistorial(campo, despues[campo]);
    if (JSON.stringify(valorAntes) !== JSON.stringify(valorDespues)) {
      cambios[campo] = { antes: valorAntes, despues: valorDespues };
    }
  }
  return cambios;
}

export interface ContextoResumen {
  archivo?: string;
  motivo?: string | null;
  estado?: string | null;
}

/** Resumen legible de un evento, sin depender de la UI. */
export function resumirCambios(
  accion: AccionHistorial,
  cambios: Record<string, CambioCampo>,
  contexto: ContextoResumen = {},
): string {
  if (accion === 'creacion') return 'Pregunta creada en el banco.';
  if (accion === 'importacion') {
    return contexto.archivo
      ? `Pregunta importada desde ${contexto.archivo}.`
      : 'Pregunta importada.';
  }
  if (accion === 'deshabilitacion') {
    return contexto.motivo
      ? `Pregunta deshabilitada: ${contexto.motivo}`
      : 'Pregunta deshabilitada (borrado lógico).';
  }
  if (accion === 'revision') {
    const estado =
      contexto.estado ??
      (typeof cambios['estado']?.despues === 'string' ? cambios['estado'].despues : null);
    return estado ? `Revisión aplicada: estado "${estado}".` : 'Revisión registrada.';
  }

  const campos = Object.keys(cambios);
  if (campos.length === 0) return 'Guardado sin cambios de contenido.';
  const etiquetas = campos.map((campo) => ETIQUETAS_CAMPO[campo] ?? campo);
  if (etiquetas.length === 1) return `Se actualizó ${etiquetas[0]}.`;
  if (etiquetas.length <= 3) return `Se actualizaron: ${etiquetas.join(', ')}.`;
  return `Se actualizaron ${etiquetas.length} campos: ${etiquetas
    .slice(0, 3)
    .join(', ')}…`;
}

export interface DatosEvento {
  preguntaId: string;
  actorUid: string;
  actorNombre?: unknown;
  actorRol?: unknown;
  accion: AccionHistorial;
  origen?: OrigenHistorial;
  reporteId?: string | null;
  cambios?: Record<string, CambioCampo>;
  snapshot?: Record<string, unknown>;
  resumen?: string;
  fecha?: Date | string;
  archivo?: string;
  motivo?: string | null;
  estado?: string | null;
}

/** Construye el documento de evento que se escribe en Firestore. */
export function construirEvento(datos: DatosEvento): Omit<EventoHistorial, 'id'> {
  const fechaCruda =
    datos.fecha instanceof Date
      ? datos.fecha
      : datos.fecha
        ? new Date(datos.fecha)
        : new Date();
  const fecha = Number.isNaN(fechaCruda.getTime()) ? new Date() : fechaCruda;
  const cambios = datos.cambios ?? {};
  const reporteId = textoLimpio(datos.reporteId);
  const actorNombre =
    textoLimpio(datos.actorNombre) ?? textoLimpio(datos.actorUid) ?? 'admin-panel';
  const actorRol =
    typeof datos.actorRol === 'string' && datos.actorRol.trim()
      ? datos.actorRol.trim()
      : String(datos.actorRol ?? 'admin');

  return {
    preguntaId: datos.preguntaId,
    fecha: fecha.toISOString(),
    fechaMs: fecha.getTime(),
    actorUid: datos.actorUid,
    actorNombre,
    actorRol,
    accion: datos.accion,
    origen: datos.origen ?? (reporteId ? 'reporte' : 'panel'),
    reporteId,
    campos: Object.keys(cambios),
    resumen:
      datos.resumen ??
      resumirCambios(datos.accion, cambios, {
        archivo: datos.archivo,
        motivo: datos.motivo,
        estado: datos.estado,
      }),
    cambios,
    ...(datos.snapshot ? { snapshot: datos.snapshot } : {}),
  };
}

/** Normaliza un documento leído de Firestore al shape de la UI. */
export function normalizarEvento(
  id: string,
  data: Record<string, unknown>,
): EventoHistorial {
  const fechaMsRaw =
    typeof data['fechaMs'] === 'number' ? data['fechaMs'] : Number(data['fechaMs']);
  const fechaTexto = typeof data['fecha'] === 'string' ? data['fecha'] : '';
  const fechaMs = Number.isFinite(fechaMsRaw)
    ? fechaMsRaw
    : fechaTexto
      ? Date.parse(fechaTexto)
      : 0;

  const accion = (ACCIONES_HISTORIAL as string[]).includes(data['accion'] as string)
    ? (data['accion'] as AccionHistorial)
    : 'edicion';
  const origen = (ORIGENES_HISTORIAL as string[]).includes(data['origen'] as string)
    ? (data['origen'] as OrigenHistorial)
    : 'panel';

  const cambiosCrudos = esObjeto(data['cambios']) ? data['cambios'] : {};
  const cambios: Record<string, CambioCampo> = {};
  for (const [campo, valor] of Object.entries(cambiosCrudos)) {
    if (esObjeto(valor) && ('antes' in valor || 'despues' in valor)) {
      cambios[campo] = {
        antes: valor['antes'] ?? null,
        despues: valor['despues'] ?? null,
      };
    }
  }

  return {
    id,
    preguntaId: typeof data['preguntaId'] === 'string' ? data['preguntaId'] : '',
    fecha:
      fechaTexto ||
      (Number.isFinite(fechaMs) && fechaMs > 0
        ? new Date(fechaMs).toISOString()
        : new Date(0).toISOString()),
    fechaMs: Number.isFinite(fechaMs) ? fechaMs : 0,
    actorUid: typeof data['actorUid'] === 'string' ? data['actorUid'] : '',
    actorNombre: typeof data['actorNombre'] === 'string' ? data['actorNombre'] : '',
    actorRol: typeof data['actorRol'] === 'string' ? data['actorRol'] : '',
    accion,
    origen,
    reporteId:
      typeof data['reporteId'] === 'string' && data['reporteId']
        ? data['reporteId']
        : null,
    campos: Array.isArray(data['campos'])
      ? data['campos'].filter((x): x is string => typeof x === 'string')
      : Object.keys(cambios),
    resumen: typeof data['resumen'] === 'string' ? data['resumen'] : '',
    cambios,
    ...(esObjeto(data['snapshot']) ? { snapshot: data['snapshot'] } : {}),
  };
}
