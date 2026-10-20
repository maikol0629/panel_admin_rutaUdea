/**
 * Tipos compartidos para la gestión de preguntas.
 *
 * Reflejan el banco real (`questions.jsonl`): 17 campos comunes a las 200
 * preguntas, más `competencia`/`contexto` solo en razonamiento lógico y
 * `texto_base`/`tipo_texto` solo en competencia lectora.
 */

export type EstadoPregunta = 'aprobado' | 'pendiente' | 'deshabilitado';

export interface OpcionesPregunta {
  A: string;
  B: string;
  C: string;
  D: string;
}

export interface PreguntaEditable {
  id: string;
  area: string;
  subtema: string;
  dificultad: string;
  pregunta: string;
  opciones: OpcionesPregunta;
  /** null = sin definir (el banco real tiene 32 casos así). */
  respuesta_correcta: string | null;
  explicacion: string;
  competencia?: string;
  contexto?: string;
  texto_base?: string;
  tipo_texto?: string;
  fuente?: string;
  tipo_fuente?: string;
  es_original?: boolean;
  verificada?: boolean;
  duplicado?: boolean;
  estado?: EstadoPregunta;
  anio?: number | null;
  pagina?: number | null;
  licencia?: string;
}

export const ESTADOS: EstadoPregunta[] = ['aprobado', 'pendiente', 'deshabilitado'];

export const DIFICULTADES = ['baja', 'media', 'alta'];

export const AREAS = ['razonamiento_logico', 'competencia_lectora'];

export function esRazonamiento(area: string): boolean {
  return area === 'razonamiento_logico';
}
