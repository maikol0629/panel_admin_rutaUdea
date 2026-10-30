/**
 * Contrato v2 del banco UdeA — utilidades compartidas por el panel.
 *
 * Es la única fuente de verdad para normalizar documentos de Firestore,
 * validar antes de aprobar/publicar y resumir el lote. Las API Routes y la
 * UI usan estas funciones puras (testeables sin Firestore).
 *
 * Contrato: `migracion/01_esquema/contrato_datos.md`.
 */

export type EstadoPregunta =
  'aprobado' | 'aprobado_con_imagen' | 'pendiente' | 'deshabilitado';

export const ESTADOS: EstadoPregunta[] = [
  'aprobado',
  'aprobado_con_imagen',
  'pendiente',
  'deshabilitado',
];

export const ESTADOS_PUBLICABLES: EstadoPregunta[] = ['aprobado', 'aprobado_con_imagen'];

export const DIFICULTADES = ['baja', 'media', 'alta'] as const;
export const CONFIANZAS = ['alta', 'media', 'baja'] as const;
export const AREAS = ['razonamiento_logico', 'competencia_lectora'] as const;
export const ROLES_IMAGEN = ['contexto', 'pregunta'] as const;

export const BANK_VERSION_DEFAULT = 'udea-2026-10-v1';
export const SCHEMA_VERSION = 2;

export interface OpcionesPregunta {
  A: string;
  B: string;
  C: string;
  D: string;
}

export interface ImagenRef {
  url: string | null;
  rol: 'contexto' | 'pregunta';
  orden: number;
  alt: string | null;
  path_origen: string | null;
  sha256?: string | null;
}

export interface PreguntaV2 {
  id: string;
  bank_version: string;
  schema_version: number;
  area: string;
  componente: string;
  subtema: string;
  subtema_origen?: string | null;
  dificultad: string;
  tipo?: string | null;
  tarea?: string | null;
  numero?: number | null;
  pregunta: string;
  opciones: OpcionesPregunta;
  respuesta_correcta: string | null;
  explicacion?: string | null;
  texto_base?: string | null;
  contexto?: string | null;
  contexto_ids?: string[];
  fuente?: string | null;
  tipo_fuente?: string | null;
  imagen_url?: string | null;
  imagenes: ImagenRef[];
  requiere_imagen: boolean;
  opciones_en_imagen: boolean;
  estado: EstadoPregunta;
  verificada: boolean;
  confianza_modelo?: string | null;
  modelo_extraccion?: string | null;
  revisado_por?: string | null;
  fecha_revision?: string | null;
  notas?: string | null;
  duplicado?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  metadatos?: Record<string, unknown>;
  [campo: string]: unknown;
}

/** Taxonomía oficial (F0-05): RL01–RL18 y CL01–CL14. */
export const COMPONENTES_VALIDOS = [
  'RL01',
  'RL02',
  'RL03',
  'RL04',
  'RL05',
  'RL06',
  'RL07',
  'RL08',
  'RL09',
  'RL10',
  'RL11',
  'RL12',
  'RL13',
  'RL14',
  'RL15',
  'RL16',
  'RL17',
  'RL18',
  'CL01',
  'CL02',
  'CL03',
  'CL04',
  'CL05',
  'CL06',
  'CL07',
  'CL08',
  'CL09',
  'CL10',
  'CL11',
  'CL12',
  'CL13',
  'CL14',
] as const;

export function prefijoSubtema(subtema: string): string {
  const match = /^([A-Z]{2}\d{2})/.exec(subtema.trim());
  return match?.[1] ?? '';
}

export function esComponenteValido(subtema: string): boolean {
  return (COMPONENTES_VALIDOS as readonly string[]).includes(prefijoSubtema(subtema));
}

export function esRazonamiento(area: string): boolean {
  return area === 'razonamiento_logico';
}

export function esAprobada(p: Pick<PreguntaV2, 'estado'>): boolean {
  return ESTADOS_PUBLICABLES.includes(p.estado);
}

export function esEstado(v: unknown): v is EstadoPregunta {
  return typeof v === 'string' && (ESTADOS as string[]).includes(v);
}

export function esRespuestaValida(v: unknown): v is 'A' | 'B' | 'C' | 'D' {
  return v === 'A' || v === 'B' || v === 'C' || v === 'D';
}

// ----- Normalización de datos de Firestore -----

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Firestore v2 guarda `opciones` como objeto `{A,B,C,D}`; el banco viejo
 * y algunos documentos intermedios las guardan como lista. Se aceptan
 * ambas y la UI trabaja siempre con objeto.
 */
export function normalizarOpciones(raw: unknown): OpcionesPregunta {
  const vacias: OpcionesPregunta = { A: '', B: '', C: '', D: '' };
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

export function aLista(opciones: OpcionesPregunta): string[] {
  return [opciones.A, opciones.B, opciones.C, opciones.D];
}

export function normalizarImagenes(raw: unknown): ImagenRef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index): ImagenRef | null => {
      if (typeof item !== 'object' || item === null) return null;
      const o = item as Record<string, unknown>;
      const rol = o['rol'] === 'contexto' ? 'contexto' : 'pregunta';
      return {
        url: typeof o['url'] === 'string' && o['url'].trim() ? o['url'].trim() : null,
        rol,
        orden: typeof o['orden'] === 'number' ? o['orden'] : index + 1,
        alt: typeof o['alt'] === 'string' && o['alt'].trim() ? o['alt'] : null,
        path_origen:
          typeof o['path_origen'] === 'string' && o['path_origen'].trim()
            ? o['path_origen']
            : null,
        sha256: typeof o['sha256'] === 'string' ? o['sha256'] : null,
      };
    })
    .filter((x): x is ImagenRef => x !== null);
}

/** Normaliza un documento de Firestore al shape de la UI (v2). */
export function normalizarPregunta(
  id: string,
  data: Record<string, unknown>,
): PreguntaV2 {
  const estado = esEstado(data['estado']) ? data['estado'] : 'pendiente';
  const opciones = normalizarOpciones(data['opciones']);
  const imagenes = normalizarImagenes(data['imagenes']);
  const respuesta = asString(data['respuesta_correcta']).trim().toUpperCase();
  const contextoIds = Array.isArray(data['contexto_ids'])
    ? (data['contexto_ids'] as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      )
    : [];

  return {
    ...data,
    id,
    bank_version: asString(data['bank_version'], BANK_VERSION_DEFAULT),
    schema_version:
      typeof data['schema_version'] === 'number'
        ? data['schema_version']
        : SCHEMA_VERSION,
    area: asString(data['area']),
    componente: asString(data['componente']),
    subtema: asString(data['subtema']),
    dificultad: asString(data['dificultad']),
    pregunta: asString(data['pregunta']),
    opciones,
    respuesta_correcta: esRespuestaValida(respuesta) ? respuesta : null,
    explicacion: asString(data['explicacion']) || null,
    texto_base: asString(data['texto_base']) || null,
    contexto: asString(data['contexto']) || null,
    contexto_ids: contextoIds,
    fuente: asString(data['fuente']) || null,
    tipo_fuente: asString(data['tipo_fuente']) || null,
    imagen_url: asString(data['imagen_url']) || null,
    imagenes,
    requiere_imagen: data['requiere_imagen'] === true || imagenes.length > 0,
    opciones_en_imagen: data['opciones_en_imagen'] === true,
    estado,
    verificada: data['verificada'] === true,
    confianza_modelo: asString(data['confianza_modelo']) || null,
    revisado_por: asString(data['revisado_por']) || null,
    fecha_revision: asString(data['fecha_revision']) || null,
    notas: asString(data['notas']) || null,
    tarea: asString(data['tarea']) || null,
    numero: typeof data['numero'] === 'number' ? data['numero'] : null,
  };
}

// ----- Validaciones de negocio -----

/** Motivos por los que una pregunta NO puede publicarse (vacío = válida). */
export function faltantesParaPublicar(p: PreguntaV2): string[] {
  const faltantes: string[] = [];
  if (!p.pregunta.trim()) faltantes.push('pregunta');
  if (!(AREAS as readonly string[]).includes(p.area)) faltantes.push('area');
  if (!p.subtema.trim()) {
    faltantes.push('subtema');
  } else if (!esComponenteValido(p.subtema)) {
    faltantes.push('subtema_taxonomia (RL01–RL18 / CL01–CL14)');
  }
  if (!(DIFICULTADES as readonly string[]).includes(p.dificultad)) {
    faltantes.push('dificultad');
  }
  const letras = ['A', 'B', 'C', 'D'] as const;
  for (const l of letras) {
    if (!p.opciones[l].trim()) faltantes.push(`opcion_${l.toLowerCase()}`);
  }
  if (!esRespuestaValida(p.respuesta_correcta)) faltantes.push('respuesta_correcta');
  if (!p.verificada) faltantes.push('verificada');
  const necesitaImagen = p.requiere_imagen || p.estado === 'aprobado_con_imagen';
  const tieneImagen =
    p.imagenes.some((i) => typeof i.url === 'string' && i.url.length > 0) ||
    Boolean(p.imagen_url);
  if (necesitaImagen && !tieneImagen) faltantes.push('imagen');
  return faltantes;
}

/** Motivos por los que el lote completo NO puede publicarse. */
export function validarLoteParaPublicar(
  preguntas: PreguntaV2[],
  bankVersion: string,
): string[] {
  const motivos: string[] = [];
  const aprobadas = preguntas.filter(esAprobada);
  if (aprobadas.length === 0) motivos.push('no_hay_preguntas_aprobadas');
  const ids = new Set<string>();
  for (const p of aprobadas) {
    if (p.bank_version !== bankVersion) {
      motivos.push(`version_distinta:${p.id}:${p.bank_version}`);
    }
    if (ids.has(p.id)) motivos.push(`id_duplicado:${p.id}`);
    ids.add(p.id);
    for (const f of faltantesParaPublicar(p)) motivos.push(`${p.id}:${f}`);
  }
  return motivos;
}

export interface ResumenBanco {
  total: number;
  aprobadas: number;
  aprobado: number;
  aprobado_con_imagen: number;
  pendiente: number;
  deshabilitado: number;
  razonamiento_logico: number;
  competencia_lectora: number;
  conImagen: number;
  opcionesEnImagen: number;
  porConfianza: Record<string, number>;
}

export function resumenBanco(preguntas: PreguntaV2[]): ResumenBanco {
  const resumen: ResumenBanco = {
    total: preguntas.length,
    aprobadas: 0,
    aprobado: 0,
    aprobado_con_imagen: 0,
    pendiente: 0,
    deshabilitado: 0,
    razonamiento_logico: 0,
    competencia_lectora: 0,
    conImagen: 0,
    opcionesEnImagen: 0,
    porConfianza: {},
  };
  for (const p of preguntas) {
    if (p.estado === 'aprobado') {
      resumen.aprobado++;
      resumen.aprobadas++;
    } else if (p.estado === 'aprobado_con_imagen') {
      resumen.aprobado_con_imagen++;
      resumen.aprobadas++;
    } else if (p.estado === 'pendiente') {
      resumen.pendiente++;
    } else {
      resumen.deshabilitado++;
    }
    if (p.area === 'razonamiento_logico') resumen.razonamiento_logico++;
    if (p.area === 'competencia_lectora') resumen.competencia_lectora++;
    if (p.imagenes.length > 0 || p.imagen_url) resumen.conImagen++;
    if (p.opciones_en_imagen) resumen.opcionesEnImagen++;
    const confianza = p.confianza_modelo ?? 'sin_definir';
    resumen.porConfianza[confianza] = (resumen.porConfianza[confianza] ?? 0) + 1;
  }
  return resumen;
}
