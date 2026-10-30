/**
 * Tipos compartidos para la gestión de preguntas (contrato v2).
 *
 * Se apoyan en `lib/bank.ts` para no duplicar reglas. `PreguntaEditable` es
 * el shape que consume el formulario: objeto de opciones, lista de imágenes
 * con rol y metadatos de revisión.
 */

import {
  AREAS,
  BANK_VERSION_DEFAULT,
  DIFICULTADES,
  ESTADOS,
  ESTADOS_PUBLICABLES,
  ROLES_IMAGEN,
  SCHEMA_VERSION,
  type EstadoPregunta,
  type ImagenRef,
  type OpcionesPregunta,
  type PreguntaV2,
} from '@/lib/bank';

export {
  AREAS,
  BANK_VERSION_DEFAULT,
  DIFICULTADES,
  ESTADOS,
  ESTADOS_PUBLICABLES,
  ROLES_IMAGEN,
  SCHEMA_VERSION,
};
export type { EstadoPregunta, ImagenRef, OpcionesPregunta, PreguntaV2 };

export interface PreguntaEditable {
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
  explicacion: string;
  texto_base?: string | null;
  contexto?: string | null;
  contexto_ids: string[];
  fuente?: string | null;
  tipo_fuente?: string | null;
  imagen_url?: string | null;
  imagenes: ImagenRef[];
  requiere_imagen: boolean;
  opciones_en_imagen: boolean;
  estado: EstadoPregunta;
  verificada: boolean;
  confianza_modelo?: string | null;
  revisado_por?: string | null;
  fecha_revision?: string | null;
  notas?: string | null;
  duplicado?: boolean;
  /** Motivo de rechazo/deshabilitación (no se persiste como campo). */
  motivo?: string | null;
}

export function esRazonamiento(area: string): boolean {
  return area === 'razonamiento_logico';
}

/** Convierte una pregunta normalizada de la API al shape editable. */
export function aEditable(p: PreguntaV2): PreguntaEditable {
  return {
    id: p.id,
    bank_version: p.bank_version || BANK_VERSION_DEFAULT,
    schema_version: p.schema_version || SCHEMA_VERSION,
    area: p.area,
    componente: p.componente,
    subtema: p.subtema,
    subtema_origen: p.subtema_origen ?? null,
    dificultad: p.dificultad,
    tipo: p.tipo ?? null,
    tarea: p.tarea ?? null,
    numero: p.numero ?? null,
    pregunta: p.pregunta,
    opciones: p.opciones,
    respuesta_correcta: p.respuesta_correcta,
    explicacion: p.explicacion ?? '',
    texto_base: p.texto_base ?? null,
    contexto: p.contexto ?? null,
    contexto_ids: p.contexto_ids ?? [],
    fuente: p.fuente ?? null,
    tipo_fuente: p.tipo_fuente ?? null,
    imagen_url: p.imagen_url ?? null,
    imagenes: p.imagenes,
    requiere_imagen: p.requiere_imagen,
    opciones_en_imagen: p.opciones_en_imagen,
    estado: p.estado,
    verificada: p.verificada,
    confianza_modelo: p.confianza_modelo ?? null,
    revisado_por: p.revisado_por ?? null,
    fecha_revision: p.fecha_revision ?? null,
    notas: p.notas ?? null,
    duplicado: p.duplicado ?? false,
  };
}
